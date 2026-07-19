/**
 * HostManager (T17, design component #5, HOST-01/03, P1-I). Owns the render-host child process:
 * spawns it, speaks LSP-framed JSON-RPC over its stdio via `vscode-jsonrpc` (AD-010), and enforces
 * the P1-I AC3 lifecycle state machine:
 *
 *   stopped -> starting -> ready -> rendering -> (ready | crashed)
 *   crashed -> starting
 *
 * No render is ever dispatched unless the state is `ready`. A crash triggers an automatic
 * exponential-backoff restart (1s/4s/15s by default, at most 3 within a rolling 5-minute window);
 * a 4th crash inside that window stops auto-restarting and requires an explicit {@link restart}.
 * A render exceeding its timeout kills the child with SIGKILL (design: "the only reliable
 * interrupt for a wedged native render") and is treated as a crash. {@link dispose} terminates the
 * child gracefully (SIGTERM, 3s grace, then SIGKILL) — used on `deactivate()` so no process is
 * ever orphaned (NFR-05).
 */

import { ChildProcess, SpawnOptions, spawn as nodeSpawn } from 'child_process';
import * as path from 'path';
import { MessageConnection, StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node';
import { RenderRequest, RenderResponse } from './protocol';

export type HostState = 'stopped' | 'starting' | 'ready' | 'rendering' | 'crashed';

export class IllegalStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalStateError';
  }
}

export class RenderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderTimeoutError';
  }
}

export interface HostManagerOptions {
  command: string;
  args: string[];
  /** Default 15000 (`inflate.renderTimeoutMs`). */
  renderTimeoutMs?: number;
  /** Default `[1000, 4000, 15000]` (design: 1s/4s/15s exponential backoff). */
  backoffMs?: number[];
  /** Default 5 minutes — the rolling window `maxAutoRestarts` is counted within. */
  crashWindowMs?: number;
  /** Default 3 — a crash beyond this count within [crashWindowMs] requires a manual {@link restart}. */
  maxAutoRestarts?: number;
  /** Default 200 — the stderr ring-buffer size, in lines (design §5). */
  stderrRingBufferLines?: number;
  /** Injectable for tests; defaults to Node's real `child_process.spawn`. */
  spawnFn?: SpawnFn;
  /** Injectable clock for crash-window bookkeeping; defaults to `Date.now`. */
  now?: () => number;
}

export interface Disposable {
  dispose(): void;
}

/** Narrowed to just the call shape HostManager actually uses, so tests can supply a simple
 * wrapper around the real `child_process.spawn` without matching its full overload set. */
export type SpawnFn = (command: string, args: string[], options?: SpawnOptions) => ChildProcess;

const DEFAULT_BACKOFF_MS = [1000, 4000, 15000];
const DEFAULT_CRASH_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_MAX_AUTO_RESTARTS = 3;
const DEFAULT_RING_BUFFER_LINES = 200;
const GRACEFUL_KILL_GRACE_MS = 3000;

export class HostManager {
  private state: HostState = 'stopped';
  private child?: ChildProcess;
  private connection?: MessageConnection;
  private stderrLines: string[] = [];
  private crashTimestamps: number[] = [];
  private manualRestartRequired = false;
  private pendingReady?: Promise<void>;
  private intentionalKill = false;
  private stateListeners: Array<(s: HostState) => void> = [];

  private readonly renderTimeoutMs: number;
  private readonly backoffMs: number[];
  private readonly crashWindowMs: number;
  private readonly maxAutoRestarts: number;
  private readonly ringBufferLines: number;
  private readonly spawnFn: SpawnFn;
  private readonly now: () => number;

  constructor(private readonly opts: HostManagerOptions) {
    this.renderTimeoutMs = opts.renderTimeoutMs ?? 15000;
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.crashWindowMs = opts.crashWindowMs ?? DEFAULT_CRASH_WINDOW_MS;
    this.maxAutoRestarts = opts.maxAutoRestarts ?? DEFAULT_MAX_AUTO_RESTARTS;
    this.ringBufferLines = opts.stderrRingBufferLines ?? DEFAULT_RING_BUFFER_LINES;
    this.spawnFn = opts.spawnFn ?? ((command, args, options) => nodeSpawn(command, args, options ?? {}));
    this.now = opts.now ?? Date.now;
  }

  getState(): HostState {
    return this.state;
  }

  onStateChange(cb: (state: HostState) => void): Disposable {
    this.stateListeners.push(cb);
    return {
      dispose: () => {
        this.stateListeners = this.stateListeners.filter((l) => l !== cb);
      },
    };
  }

  /** Last-lines-first is not required; this is the append-ordered tail (oldest first), capped at
   * `stderrRingBufferLines`. Used for crash reports (P1-I AC1/AC5). */
  stderrTail(): string[] {
    return [...this.stderrLines];
  }

  /** True once a 4th crash has occurred within the rolling window — auto-restart has stopped and
   * {@link restart} must be called explicitly to recover. */
  needsManualRestart(): boolean {
    return this.manualRestartRequired;
  }

  /** Number of crash timestamps currently inside the rolling crash window. */
  crashCount(): number {
    return this.crashTimestamps.length;
  }

  private setState(next: HostState): void {
    this.state = next;
    this.stateListeners.forEach((l) => l(next));
  }

  /** Spawns + initializes the host if not already ready (or already in flight). Rejects with
   * {@link IllegalStateError} if the host has exceeded its auto-restart budget (P1-I AC3). */
  async ensureReady(): Promise<void> {
    if (this.state === 'ready' || this.state === 'rendering') return;
    if (this.state === 'starting' && this.pendingReady) return this.pendingReady;
    if (this.manualRestartRequired) {
      throw new IllegalStateError(
        'host crashed too many times in the last window; call restart() to recover manually',
      );
    }
    this.pendingReady = this.spawnAndInitialize().finally(() => {
      this.pendingReady = undefined;
    });
    return this.pendingReady;
  }

  private async spawnAndInitialize(): Promise<void> {
    this.setState('starting');
    const child = this.spawnFn(this.opts.command, this.opts.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.stderrLines = [];
    child.stderr?.on('data', (buf: Buffer) => this.appendStderr(buf.toString()));

    let starting = true;
    let rejectStartup: ((err: Error) => void) | undefined;

    child.once('exit', (code, signal) => {
      const reason = `exited (code=${code}, signal=${signal})`;
      if (starting && rejectStartup) {
        rejectStartup(new Error(`host ${reason} during startup`));
        return;
      }
      if (this.intentionalKill) return; // dispose()/restart() own this transition
      this.handleCrash(reason);
    });
    child.once('error', (err) => {
      if (starting && rejectStartup) {
        rejectStartup(err);
        return;
      }
      if (this.intentionalKill) return;
      this.handleCrash(err.message);
    });

    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout!),
      new StreamMessageWriter(child.stdin!),
    );
    this.connection = connection;
    connection.listen();

    const startupFailure = new Promise<never>((_resolve, reject) => {
      rejectStartup = reject;
    });

    await Promise.race([
      (async () => {
        await connection.sendRequest('initialize', {});
        await connection.sendRequest('warmup', {});
      })(),
      startupFailure,
    ]);

    starting = false;
    this.setState('ready');
  }

  /** Dispatches a render — only legal from `ready` (P1-I AC3). Kills the child on timeout. */
  async render(req: RenderRequest): Promise<RenderResponse> {
    if (this.state !== 'ready') {
      throw new IllegalStateError(`cannot render while host state is '${this.state}' (must be 'ready')`);
    }
    this.setState('rendering');
    const connection = this.connection!;
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        reject(new RenderTimeoutError(`render timed out after ${this.renderTimeoutMs}ms`));
      }, this.renderTimeoutMs);
    });

    try {
      const result = await Promise.race([
        connection.sendRequest<RenderResponse>('render', req),
        timeoutPromise,
      ]);
      if (this.getState() === 'rendering') this.setState('ready');
      return result;
    } catch (e) {
      if (timedOut) {
        this.killChild('SIGKILL');
        this.handleCrash(`render timeout after ${this.renderTimeoutMs}ms`);
      } else {
        this.handleCrash(`render failed: ${(e as Error).message}`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async listThemes(params: unknown): Promise<unknown> {
    await this.ensureReady();
    return this.connection!.sendRequest('listThemes', params);
  }

  async invalidate(params: unknown): Promise<unknown> {
    await this.ensureReady();
    return this.connection!.sendRequest('invalidate', params);
  }

  /** Kills the current child (if any), then respawns and re-initializes. Clears the crash history
   * and the manual-restart flag — an explicit restart is always allowed, regardless of history. */
  async restart(): Promise<void> {
    await this.gracefulKill();
    this.manualRestartRequired = false;
    this.crashTimestamps = [];
    this.setState('stopped');
    await this.ensureReady();
  }

  /** Terminates the child (SIGTERM, `GRACEFUL_KILL_GRACE_MS` grace, then SIGKILL) and leaves the
   * manager `stopped`. Safe to call when already stopped. Used on extension `deactivate()`. */
  async dispose(): Promise<void> {
    await this.gracefulKill();
    this.setState('stopped');
  }

  private killChild(signal: NodeJS.Signals): void {
    this.connection?.dispose();
    this.connection = undefined;
    if (this.child && this.child.exitCode === null) {
      this.child.kill(signal);
    }
  }

  private async gracefulKill(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.intentionalKill = true;
    this.connection?.dispose();
    this.connection = undefined;
    if (child.exitCode === null && child.signalCode === null && !child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        }, GRACEFUL_KILL_GRACE_MS);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.child = undefined;
    this.intentionalKill = false;
  }

  private handleCrash(reason: string): void {
    if (this.state === 'crashed') return; // already processed for this incident
    this.setState('crashed');
    this.connection?.dispose();
    this.connection = undefined;
    this.child = undefined;

    const nowMs = this.now();
    this.crashTimestamps = this.crashTimestamps.filter((t) => nowMs - t < this.crashWindowMs);
    this.crashTimestamps.push(nowMs);

    if (this.crashTimestamps.length > this.maxAutoRestarts) {
      this.manualRestartRequired = true;
      return;
    }

    const attemptIndex = this.crashTimestamps.length - 1;
    const delay = this.backoffMs[Math.min(attemptIndex, this.backoffMs.length - 1)];
    setTimeout(() => {
      if (this.state === 'crashed' && !this.manualRestartRequired) {
        void this.ensureReady().catch(() => {
          /* a failed respawn attempt re-enters handleCrash via the exit/error listeners */
        });
      }
    }, delay);
  }

  private appendStderr(text: string): void {
    const lines = text.split('\n').filter((l) => l.length > 0);
    this.stderrLines.push(...lines);
    if (this.stderrLines.length > this.ringBufferLines) {
      this.stderrLines = this.stderrLines.slice(this.stderrLines.length - this.ringBufferLines);
    }
  }
}

// ---- production spawn-command assembly (design: "java -Xmx<heap> -D<layoutlib props> -cp <classpath>") ----

export interface JavaSpawnConfig {
  javaBin: string;
  hostJarPath: string;
  classpathJars: string[];
  layoutlibRuntimeRoot: string;
  layoutlibResourcesRoot: string;
  /** Default 1024 (`inflate.hostMaxHeap`, NFR-02 default 1 GB). */
  maxHeapMb?: number;
}

export function buildJavaCommand(config: JavaSpawnConfig): { command: string; args: string[] } {
  const heap = config.maxHeapMb ?? 1024;
  const classpath = [config.hostJarPath, ...config.classpathJars].join(path.delimiter);
  return {
    command: config.javaBin,
    args: [
      `-Xmx${heap}m`,
      `-Dpaparazzi.layoutlib.runtime.root=${config.layoutlibRuntimeRoot}`,
      `-Dpaparazzi.layoutlib.resources.root=${config.layoutlibResourcesRoot}`,
      '-cp',
      classpath,
      'MainKt',
    ],
  };
}
