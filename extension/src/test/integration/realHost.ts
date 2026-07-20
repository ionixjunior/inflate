/**
 * Real-host launch helper for the chaos suite (T58, NFR-05/P1-I). Several chaos scenarios (host
 * crash mid-render, JVM OOM naming the heap setting, orphan-process check) need to observe the
 * ACTUAL JVM process — a scripted fake host can't fake a real crash or a real memory ceiling.
 *
 * Mirrors `corpus/src/hostClient.ts`'s approach exactly (same "reuse, don't reinvent" mandate as
 * T54/T57): the classpath + engine paths come from `host/build.gradle.kts`'s `writeCorpusClasspath`
 * task (the exact assembly `engineTest` already proves works), not re-derived here. Kept local to
 * `extension/src/test/integration/` (rather than importing `corpus/`, which is a separate npm
 * package with no dependency relationship to the extension) so the extension's own test project
 * stays self-contained.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostManagerOptions } from '../../host';

const HOST_DIR = path.resolve(__dirname, '../../../../host');
const LAUNCH_CONFIG_PATH = path.join(HOST_DIR, 'build', 'corpus', 'host-launch.json');

export interface HostLaunchConfig {
  classpath: string[];
  jvmArgs: string[];
  layoutlibRuntimeRoot: string;
  layoutlibResourcesRoot: string;
  libraryResDirs: string[];
  libraryPackages: string[];
}

/** The fixed package name the whole engine setup registers at Bridge-init time (see
 * `corpus/src/hostClient.ts`'s doc for the underlying `resourceId` gap this works around). */
export const HOST_PACKAGE_NAME = 'com.inflate.preview';

/** Runs `./gradlew writeCorpusClasspath` (unless a config already exists) and returns it parsed. */
export function ensureHostLaunchConfig(force = false): HostLaunchConfig {
  if (force || !fs.existsSync(LAUNCH_CONFIG_PATH)) {
    execFileSync('./gradlew', ['writeCorpusClasspath', '--console=plain'], { cwd: HOST_DIR, stdio: 'pipe' });
  }
  return JSON.parse(fs.readFileSync(LAUNCH_CONFIG_PATH, 'utf8')) as HostLaunchConfig;
}

/**
 * Builds the `HostManagerOptions` needed to spawn the REAL host — `command`/`args` (java + assembled
 * classpath, JPMS opens, an optional tiny `-Xmx` for the OOM scenario) plus real `initializeParams`
 * (T58 fix: HostManager previously sent `{}`, which a real `backendFactory`-backed host rejects).
 */
export function realHostOptions(
  launch: HostLaunchConfig,
  opts: { maxHeapMb?: number; renderTimeoutMs?: number; backoffMs?: number[]; maxAutoRestarts?: number; crashWindowMs?: number } = {},
): HostManagerOptions {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-chaos-out-'));
  const overlayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-chaos-overlay-'));
  const heap = opts.maxHeapMb ?? 1024;
  return {
    command: 'java',
    args: [...launch.jvmArgs, `-Xmx${heap}m`, '-cp', launch.classpath.join(path.delimiter), 'MainKt'],
    renderTimeoutMs: opts.renderTimeoutMs,
    backoffMs: opts.backoffMs,
    maxAutoRestarts: opts.maxAutoRestarts,
    crashWindowMs: opts.crashWindowMs,
    initializeParams: {
      layoutlibRuntimeRoot: launch.layoutlibRuntimeRoot,
      layoutlibResourcesRoot: launch.layoutlibResourcesRoot,
      classpathNote: 'assembled-by-launcher',
      libraryResDirs: launch.libraryResDirs,
      libraryPackages: launch.libraryPackages,
      outputDir,
      overlayDir,
      compileSdkVersion: 34,
      logLevel: 'info',
    },
  };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Polls [predicate] until it's true or [timeoutMs] elapses, throwing on timeout. */
export async function waitUntil(predicate: () => boolean, timeoutMs = 20000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitUntil: timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
