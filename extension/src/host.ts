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
import { Writable } from 'stream';
import { MessageConnection, StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node';
import { RenderRequest, RenderResponse } from './protocol';

export type HostState = 'stopped' | 'starting' | 'ready' | 'rendering' | 'crashed';

/**
 * Wraps the child's stdin so a JSON-RPC write racing the host's death can never surface an error.
 * vscode-jsonrpc 9's `sendRequest` awaits the write inside an async Promise executor and, on
 * failure, rejects the response promise AND rethrows — the executor's own promise is discarded by
 * the Promise constructor, so that second rejection is unhandleable from calling code
 * (connection.js ~1149; reproduced deterministically, 2026-07-27). Swallowing the write error is
 * sound: a write to a dead host carries no information — the child 'exit' handler owns the crash
 * transition, and `handleCrash`/`gracefulKill` dispose the connection, which rejects every pending
 * request with PendingResponseRejected (verified in vscode-jsonrpc 9.0.1), so callers still fail
 * fast instead of hanging.
 */
class DeadPipeTolerantWritable extends Writable {
  constructor(private readonly target: NodeJS.WritableStream) {
    super();
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    // Writable normalizes string chunks to Buffers before _write (decodeStrings defaults true),
    // so the chunk is passed through without re-encoding.
    try {
      this.target.write(chunk as Uint8Array, () => callback());
    } catch {
      callback();
    }
  }
}

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
  /** Sent verbatim as the `initialize` RPC params (T13/T35 `InitializeParams`). Defaults to `{}`
   * for the scripted fake-host test path (T17/T18), which does not validate them; a real
   * `backendFactory`-backed host (T35) requires the full shape (layoutlibRuntimeRoot,
   * layoutlibResourcesRoot, libraryResDirs/Packages, outputDir, overlayDir, compileSdkVersion,
   * logLevel) or `initialize` fails moshi parsing and the host never reaches `ready`. */
  initializeParams?: Record<string, unknown>;
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
  private stderrLineListeners: Array<(line: string) => void> = [];
  /** FIFO gate serializing concurrent {@link render} calls onto this single-session host (NFR-05). */
  private renderQueueTail: Promise<void> = Promise.resolve();
  /** The most recent crash's user-facing reason (P1-I AC1/AC2), enriched with an actionable hint
   * when the stderr tail shows heap exhaustion — see {@link describeCrash}. */
  private lastCrashReason?: string;

  /** Not `readonly`: {@link reconfigure} updates it from the real `inflate.renderTimeoutMs` setting,
   * which is only known once activation.ts's lazy real-host setup runs (T60). */
  private renderTimeoutMs: number;
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

  /**
   * Overwrites the spawn command/args and `initialize` params (T60: real JDK/ArtifactManager
   * resolution happens lazily, on first preview request — P1-H AC1 — not at construction time,
   * since it can involve a one-time ~170 MB download and must not block `activate()`, NFR-02). A
   * no-op once the host has actually started (state !== 'stopped') — reconfiguring a live/crashed/
   * restarting host would be incoherent; callers (activation.ts) re-derive the same real config on
   * every call, so this is safe and idempotent to call repeatedly before the first `ensureReady()`.
   */
  reconfigure(next: {
    command: string;
    args: string[];
    initializeParams?: Record<string, unknown>;
    renderTimeoutMs?: number;
  }): void {
    if (this.state !== 'stopped') return;
    this.opts.command = next.command;
    this.opts.args = next.args;
    if (next.initializeParams) this.opts.initializeParams = next.initializeParams;
    if (next.renderTimeoutMs !== undefined) this.renderTimeoutMs = next.renderTimeoutMs;
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

  /** The most recent crash's user-facing reason (P1-I AC1/AC2 "a readable error"), or undefined if
   * the host has never crashed. When the stderr tail shows JVM heap exhaustion, this names the
   * `inflate.hostMaxHeap` setting rather than just the raw exit code (T58 chaos scenario). */
  getLastCrashReason(): string | undefined {
    return this.lastCrashReason;
  }

  /** Enriches a bare crash [reason] with an actionable heap-size hint when the stderr tail shows a
   * JVM `OutOfMemoryError` — otherwise returns [reason] unchanged. */
  private describeCrash(reason: string): string {
    const isOom = this.stderrLines.some((l) => l.includes('OutOfMemoryError'));
    if (!isOom) return reason;
    return (
      `${reason} — the render host ran out of memory (JVM OutOfMemoryError); increase the ` +
      `"inflate.hostMaxHeap" setting (current default 1024 MB) and try again.`
    );
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

  /** PID of the currently running child, if any (Doctor/observability; T18 orphan-process checks). */
  getChildPid(): number | undefined {
    return this.child?.pid;
  }

  /** Notifies [cb] with each stderr line as it arrives (in addition to the ring buffer), so callers
   * can mirror host output into the "Inflate" output channel with render IDs (P1-I AC5). */
  onStderrLine(cb: (line: string) => void): Disposable {
    this.stderrLineListeners.push(cb);
    return {
      dispose: () => {
        this.stderrLineListeners = this.stderrLineListeners.filter((l) => l !== cb);
      },
    };
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
    // A JSON-RPC write can race the child's death and hit a closed pipe (EPIPE). The 'exit'
    // handler below owns that lifecycle transition — a stdin stream error adds no signal, but
    // without a listener it becomes an unhandled 'error' event.
    child.stdin?.on('error', () => {});

    let starting = true;
    let rejectStartup: ((err: Error) => void) | undefined;

    child.once('exit', (code, signal) => {
      const reason = `exited (code=${code}, signal=${signal})`;
      if (starting && rejectStartup) {
        rejectStartup(new Error(`host ${this.describeCrash(reason)} during startup`));
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
      new StreamMessageWriter(new DeadPipeTolerantWritable(child.stdin!)),
    );
    this.connection = connection;
    connection.listen();

    const startupFailure = new Promise<never>((_resolve, reject) => {
      rejectStartup = reject;
    });

    const startupSequence = (async () => {
      await connection.sendRequest('initialize', this.opts.initializeParams ?? {});
      await connection.sendRequest('warmup', {});
    })();
    // When the child dies mid-startup the race settles via startupFailure, but this arm is still
    // in flight — its late rejection (e.g. EPIPE writing 'warmup' to the dead stdin) has no
    // awaiter left and would surface as an unhandled rejection.
    startupSequence.catch(() => {});

    await Promise.race([startupSequence, startupFailure]);

    starting = false;
    this.setState('ready');
  }

  /**
   * Dispatches a render — legal from `ready` or `rendering` (P1-I AC3 plus NFR-05: "concurrent
   * previews supported... renders serialized per host"). A call arriving while another is already
   * `rendering` is queued (FIFO) behind it via {@link renderQueueTail} rather than rejected — the
   * per-document latest-wins coalescing that decides WHICH requests reach this point at all lives
   * one layer up, in `RenderScheduler` (T36); this queue is what makes 3 concurrently open previews
   * (3 different documents, each with its own scheduler state) land on the single-session host one
   * render at a time instead of racing. Any other state (`stopped`/`starting`/`crashed`) still
   * rejects immediately — there is nothing to queue behind. Kills the child on timeout.
   */
  async render(req: RenderRequest): Promise<RenderResponse> {
    if (this.state !== 'ready' && this.state !== 'rendering') {
      throw new IllegalStateError(`cannot render while host state is '${this.state}' (must be 'ready')`);
    }
    const myTurn = this.renderQueueTail;
    let releaseNext!: () => void;
    this.renderQueueTail = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    await myTurn;
    try {
      if (this.state !== 'ready') {
        throw new IllegalStateError(`cannot render while host state is '${this.state}' (must be 'ready')`);
      }
      return await this.dispatchRender(req);
    } finally {
      releaseNext();
    }
  }

  private async dispatchRender(req: RenderRequest): Promise<RenderResponse> {
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
    this.lastCrashReason = this.describeCrash(reason);
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
    lines.forEach((line) => this.stderrLineListeners.forEach((l) => l(line)));
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
