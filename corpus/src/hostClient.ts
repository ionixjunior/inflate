/**
 * HostClient (T54, NFR-07 mechanism). Spawns the REAL Inflate render host standalone — over the
 * real LSP-framed JSON-RPC protocol (AD-010), the exact same `Main.kt` binary the extension
 * eventually ships — and drives `initialize`/`warmup`/`render`/`listThemes`/`invalidate`/`shutdown`.
 *
 * The classpath + engine paths (layoutlib runtime/resources, bundled androidx/Material AAR classes,
 * generated R classes, `framework-delegates.jar`) are NOT re-derived here: `host/build.gradle.kts`'s
 * `writeCorpusClasspath` task mirrors the exact assembly `engineTest` already proves works (main
 * runtime classpath + `prepareEngineTestLibs` + `generateEngineTestRClasses` +
 * `generateFrameworkDelegates`) and dumps it to `host/build/corpus/host-launch.json`. This client
 * only runs that Gradle task (if the file is missing/stale) and reads the result — "reuse, don't
 * reinvent" per the batch brief.
 *
 * IMPORTANT (documented real bug — see docs/known-issues.md / STATE.md handoff): the render pipeline
 * resolves resource ids via `EngineAdapter.resourceId(name, type, packageName)` ->
 * `Resources.getIdentifier`, which only recognises the ONE package name fixed at Bridge-init time
 * (`EngineAdapter.previewEnvironment`'s default, `"com.inflate.preview"`) — passing any other
 * `packageName` (e.g. a real project's manifest `applicationId`) makes every resource id resolve to
 * 0 and every render fail with `"layout id 0 inflated to null"`. Every existing host-side test
 * (LayoutRendererTest, MaterialGalleryTest, …) already sidesteps this by hardcoding
 * `"com.inflate.preview""` — this corpus runner does the same (`HOST_PACKAGE_NAME` below), which is
 * necessary for ANY fixture to render today, not a corpus-specific workaround.
 */

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const HOST_DIR = path.join(REPO_ROOT, 'host');
const LAUNCH_CONFIG_PATH = path.join(HOST_DIR, 'build', 'corpus', 'host-launch.json');

/** The fixed package name every host-side test (and this runner) uses — see class doc above. */
export const HOST_PACKAGE_NAME = 'com.inflate.preview';

export interface HostLaunchConfig {
  classpath: string[];
  jvmArgs: string[];
  layoutlibRuntimeRoot: string;
  layoutlibResourcesRoot: string;
  libraryResDirs: string[];
  libraryPackages: string[];
}

/** Runs `./gradlew writeCorpusClasspath` (unless [force] is false and a config already exists) and
 * returns the parsed launch config. Throws with the Gradle output on failure — never silently. */
export function ensureHostLaunchConfig(force = false): HostLaunchConfig {
  if (force || !fs.existsSync(LAUNCH_CONFIG_PATH)) {
    try {
      execFileSync('./gradlew', ['writeCorpusClasspath', '--console=plain'], {
        cwd: HOST_DIR,
        stdio: 'pipe',
      });
    } catch (e) {
      const err = e as { stdout?: Buffer; stderr?: Buffer; message: string };
      throw new Error(
        `failed to assemble host classpath via './gradlew writeCorpusClasspath' — is the engine cache ` +
          `populated ('./gradlew fetchEngine')? stdout:\n${err.stdout?.toString() ?? ''}\nstderr:\n${err.stderr?.toString() ?? err.message}`,
      );
    }
  }
  const raw = fs.readFileSync(LAUNCH_CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as HostLaunchConfig;
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

/** Minimal LSP header-framed JSON-RPC 2.0 client (AD-010) — reads/writes `Content-Length`-prefixed
 * frames over the child's stdio, matching `host/src/main/kotlin/rpc/Framing.kt` exactly. Kept
 * dependency-free (no `vscode-jsonrpc`) since the corpus tool is a standalone package. */
export class HostClient {
  private child?: ChildProcessWithoutNullStreams;
  private buf: Buffer = Buffer.alloc(0);
  private pending = new Map<number, PendingCall>();
  private nextId = 1;
  readonly stderrLines: string[] = [];

  constructor(private readonly config: HostLaunchConfig, private readonly javaBin: string = 'java', private readonly maxHeapMb = 1024) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  start(): void {
    const cp = this.config.classpath.join(path.delimiter);
    const args = [...this.config.jvmArgs, `-Xmx${this.maxHeapMb}m`, '-cp', cp, 'MainKt'];
    this.child = spawn(this.javaBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (d: Buffer) => {
      const text = d.toString('utf8');
      this.stderrLines.push(...text.split('\n').filter((l) => l.length > 0));
    });
    this.child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const headerEnd = this.buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = this.buf.slice(0, headerEnd).toString('utf8');
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        this.buf = Buffer.alloc(0);
        return;
      }
      const len = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buf.length < bodyStart + len) return;
      const body = this.buf.slice(bodyStart, bodyStart + len).toString('utf8');
      this.buf = this.buf.slice(bodyStart + len);
      this.handleFrame(body);
    }
  }

  private handleFrame(body: string): void {
    const msg = JSON.parse(body) as { id?: number; result?: unknown; error?: { message: string } };
    if (msg.id === undefined) return;
    const call = this.pending.get(msg.id);
    if (!call) return;
    this.pending.delete(msg.id);
    if (msg.error) call.reject(new Error(msg.error.message));
    else call.resolve(msg.result);
  }

  request<T>(method: string, params: unknown): Promise<T> {
    if (!this.child) throw new Error('HostClient.start() must be called first');
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
      this.child!.stdin.write(header + payload);
    });
  }

  async initialize(params: {
    outputDir: string;
    overlayDir: string;
    logLevel?: 'info' | 'debug';
  }): Promise<void> {
    await this.request('initialize', {
      layoutlibRuntimeRoot: this.config.layoutlibRuntimeRoot,
      layoutlibResourcesRoot: this.config.layoutlibResourcesRoot,
      classpathNote: 'assembled-by-launcher',
      libraryResDirs: this.config.libraryResDirs,
      libraryPackages: this.config.libraryPackages,
      outputDir: params.outputDir,
      overlayDir: params.overlayDir,
      compileSdkVersion: 34,
      logLevel: params.logLevel ?? 'info',
    });
  }

  warmup(): Promise<void> {
    return this.request('warmup', {});
  }

  async shutdown(): Promise<void> {
    try {
      await this.request('shutdown', {});
    } catch {
      /* best-effort */
    }
  }

  /** Kills the child if still alive (chaos/cleanup paths). */
  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.child && this.child.exitCode === null) this.child.kill(signal);
  }

  onExit(cb: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.child?.on('exit', cb);
  }
}
