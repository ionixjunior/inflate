/**
 * Doctor (T19, design component #10, SETUP-03, P1-H AC5). Assembles a single, read-only report
 * from JdkLocator/ArtifactManager/HostManager — never mutates anything. `resolveRoots` is a stub
 * until the resource-root resolver lands (Phase 4, T20-T23): this always reports "resolver
 * pending" rather than guessing.
 */

import { CacheReport, EngineManifest } from './artifacts';
import { HostState } from './host';
import { GuidedError, JdkInfo, isGuidedError } from './jdk';

export interface DoctorJdkSection {
  found: boolean;
  path?: string;
  version?: number;
  source?: string;
  /** Present iff `found` is false (P1-H AC3 guided message, surfaced read-only here). */
  guidedMessage?: string;
  downloadUrl?: string;
}

export interface DoctorHostSection {
  state: HostState;
  pid?: number;
  /** Milliseconds since the host last became ready; undefined when not ready/rendering. */
  uptimeMs?: number;
  /** Last stderr lines, present only when `state === 'crashed'` (P1-I AC5 crash report). */
  lastCrashExcerpt?: string[];
}

export interface DoctorRootsSection {
  status: 'resolverPending';
  message: string;
}

export interface DoctorRenderTimings {
  prepareMs: number;
  inflateMs: number;
  renderMs: number;
  totalMs: number;
}

export interface EnginePinMatrix {
  pinName: string;
  layoutlibVersion: string;
  toolsVersion: string;
  minJdk: number;
  compileSdkVersion: number;
}

export interface DoctorReport {
  jdk: DoctorJdkSection;
  cache: CacheReport;
  host: DoctorHostSection;
  roots: DoctorRootsSection;
  lastRenderTimings?: DoctorRenderTimings;
  enginePinMatrix: EnginePinMatrix;
  logPointers: string[];
}

/** Minimal read-only view of HostManager that Doctor needs (avoids a hard dependency on the full
 * class, so tests can supply a plain object). */
export interface DoctorHostManagerView {
  getState(): HostState;
  getChildPid(): number | undefined;
  stderrTail(): string[];
}

export interface DoctorDeps {
  jdkResult: JdkInfo | GuidedError;
  cacheReport: CacheReport;
  hostManager: DoctorHostManagerView;
  manifest: EngineManifest;
  /** Timestamp (ms) the host last entered `ready`; undefined if never ready yet. */
  hostReadySince?: number;
  lastRenderTimings?: DoctorRenderTimings;
  logPointers: string[];
  now?: () => number;
}

const MIN_JDK = 17; // AD-008
const COMPILE_SDK_VERSION = 34; // design §D6

/** Derives the display pin matrix from the bundled `engine-manifest.json` (T15) — never
 * hand-maintained, so Doctor can't drift from what was actually generated/pinned. */
export function derivePinMatrix(manifest: EngineManifest): EnginePinMatrix {
  const findVersion = (name: string): string => manifest.artifacts.find((a) => a.name === name)?.version ?? 'unknown';
  return {
    pinName: manifest.pinName,
    layoutlibVersion: findVersion('layoutlib'),
    toolsVersion: findVersion('layoutlib-api'),
    minJdk: MIN_JDK,
    compileSdkVersion: COMPILE_SDK_VERSION,
  };
}

function jdkSection(result: JdkInfo | GuidedError): DoctorJdkSection {
  if (isGuidedError(result)) {
    return { found: false, guidedMessage: result.message, downloadUrl: result.downloadUrl };
  }
  return { found: true, path: result.home, version: result.version, source: result.source };
}

function hostSection(
  hostManager: DoctorHostManagerView,
  hostReadySince: number | undefined,
  now: () => number,
): DoctorHostSection {
  const state = hostManager.getState();
  const pid = hostManager.getChildPid();
  const uptimeMs =
    (state === 'ready' || state === 'rendering') && hostReadySince !== undefined ? now() - hostReadySince : undefined;
  const lastCrashExcerpt = state === 'crashed' ? hostManager.stderrTail().slice(-10) : undefined;
  return { state, pid, uptimeMs, lastCrashExcerpt };
}

function rootsSection(): DoctorRootsSection {
  return {
    status: 'resolverPending',
    message: 'Resource root resolution lands in Phase 4 (T20-T23); not yet available.',
  };
}

/** Assembles the full Doctor report (P1-H AC5). Pure and read-only — never installs, spawns, or
 * mutates anything; callers gather `deps` from the already-running managers. */
export function assembleDoctorReport(deps: DoctorDeps): DoctorReport {
  const now = deps.now ?? Date.now;
  return {
    jdk: jdkSection(deps.jdkResult),
    cache: deps.cacheReport,
    host: hostSection(deps.hostManager, deps.hostReadySince, now),
    roots: rootsSection(),
    lastRenderTimings: deps.lastRenderTimings,
    enginePinMatrix: derivePinMatrix(deps.manifest),
    logPointers: deps.logPointers,
  };
}

/** Renders the report as plain lines for the "Inflate" output channel / Doctor command. */
export function formatDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = ['=== Inflate Doctor ==='];

  lines.push('-- JDK --');
  if (report.jdk.found) {
    lines.push(`  path: ${report.jdk.path}`, `  version: ${report.jdk.version}`, `  source: ${report.jdk.source}`);
  } else {
    lines.push(`  not found: ${report.jdk.guidedMessage}`, `  download: ${report.jdk.downloadUrl}`);
  }

  lines.push('-- Engine cache --');
  lines.push(`  manifestHash: ${report.cache.manifestHash}`, `  ready: ${report.cache.ready}`);
  for (const a of report.cache.artifacts) {
    lines.push(`  - ${a.key}: ${a.installed ? 'installed' : 'missing'}${a.sizeBytes ? ` (${a.sizeBytes} bytes)` : ''}`);
  }

  lines.push('-- Host --');
  lines.push(`  state: ${report.host.state}`, `  pid: ${report.host.pid ?? '(none)'}`);
  if (report.host.uptimeMs !== undefined) lines.push(`  uptimeMs: ${report.host.uptimeMs}`);
  if (report.host.lastCrashExcerpt) lines.push('  last stderr:', ...report.host.lastCrashExcerpt.map((l) => `    ${l}`));

  lines.push('-- Resource roots --', `  ${report.roots.message}`);

  if (report.lastRenderTimings) {
    const t = report.lastRenderTimings;
    lines.push('-- Last render timings --', `  prepare=${t.prepareMs}ms inflate=${t.inflateMs}ms render=${t.renderMs}ms total=${t.totalMs}ms`);
  }

  lines.push('-- Engine pin --');
  lines.push(
    `  ${report.enginePinMatrix.pinName} (layoutlib ${report.enginePinMatrix.layoutlibVersion}, tools ${report.enginePinMatrix.toolsVersion}, JDK>=${report.enginePinMatrix.minJdk}, compileSdk=${report.enginePinMatrix.compileSdkVersion})`,
  );

  lines.push('-- Logs --', ...report.logPointers.map((p) => `  ${p}`));

  return lines;
}
