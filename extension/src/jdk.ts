/**
 * JdkLocator (T14, design component #6, SETUP-01/AD-003/AD-008). Finds a JDK >= 17 via the
 * macOS detection chain below, in precedence order, and NEVER downloads a JVM:
 *
 *   `inflate.javaHome` setting > `JAVA_HOME` env > `PATH` > `/usr/libexec/java_home -V` >
 *   Homebrew (`/opt/homebrew/opt/openjdk*`, `/usr/local/opt/openjdk*`) >
 *   SDKMAN (`~/.sdkman/candidates/java/*`) > Android Studio JBR
 *   (`/Applications/Android Studio.app/Contents/jbr`) > `/Library/Java/JavaVirtualMachines/*`
 *   (incl. `microsoft-*`).
 *
 * The version of a candidate home is read from `<home>/release` (the `JAVA_VERSION="..."` line)
 * — never by spawning `java -version`. The first source (in the precedence order above) whose
 * best candidate is >= 17 wins outright, even if a later source would report a higher version;
 * if no source anywhere yields >= 17, a {@link GuidedError} is returned naming the closest match
 * found (if any) purely for a friendlier message — it is still "no compatible JDK found" (P1-H
 * AC3): Inflate never attempts to download a JVM itself.
 *
 * All I/O is behind {@link JdkLocatorDeps} so detection is unit-testable with in-memory fixtures
 * (fs/env) — the real `/usr/libexec/java_home` invocation only happens through {@link defaultDeps}.
 */

import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const REQUIRED_JDK_VERSION = 17;
export const JDK_DOWNLOAD_URL = 'https://learn.microsoft.com/en-us/java/openjdk/download';

export type JdkSource =
  | 'inflate.javaHome'
  | 'JAVA_HOME'
  | 'PATH'
  | 'java_home'
  | 'homebrew'
  | 'sdkman'
  | 'android-studio-jbr'
  | 'library-java-vms';

export interface JdkInfo {
  javaBin: string;
  home: string;
  version: number;
  source: JdkSource;
}

export interface GuidedError {
  kind: 'guidedSetup';
  requiredVersion: number;
  downloadUrl: string;
  message: string;
  closestFound?: { version: number; home: string; source: JdkSource };
}

export function isGuidedError(value: JdkInfo | GuidedError): value is GuidedError {
  return (value as GuidedError).kind === 'guidedSetup';
}

/** Injectable I/O surface — see module doc. [defaultDeps] wires the real filesystem/process. */
export interface JdkLocatorDeps {
  env: Record<string, string | undefined>;
  homeDir: string;
  existsSync: (p: string) => boolean;
  readFileSync: (p: string) => string;
  readdirSync: (p: string) => string[];
  realpathSync: (p: string) => string;
  /** Parsed candidate home directories from `/usr/libexec/java_home -V` (`[]` if unavailable). */
  javaHomeToolCandidates: () => string[];
}

export function defaultDeps(): JdkLocatorDeps {
  return {
    env: process.env,
    homeDir: os.homedir(),
    existsSync: (p) => fs.existsSync(p),
    readFileSync: (p) => fs.readFileSync(p, 'utf8'),
    readdirSync: (p) => fs.readdirSync(p),
    realpathSync: (p) => fs.realpathSync(p),
    javaHomeToolCandidates: defaultJavaHomeToolCandidates,
  };
}

function defaultJavaHomeToolCandidates(): string[] {
  try {
    const result = childProcess.spawnSync('/usr/libexec/java_home', ['-V'], { encoding: 'utf8' });
    return parseJavaHomeOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  } catch {
    return [];
  }
}

/** Extracts the distinct absolute home-directory paths from `/usr/libexec/java_home -V` output
 * (stdout+stderr): each matching line ends with the JVM's home path as its last whitespace-free
 * token (either a bare path on its own line, or trailing a "<version> ... <name>" description). */
export function parseJavaHomeOutput(output: string): string[] {
  const seen = new Set<string>();
  for (const rawLine of output.split('\n')) {
    const tokens = rawLine.trim().split(/\s+/);
    const last = tokens[tokens.length - 1];
    if (last && last.startsWith('/')) seen.add(last);
  }
  return [...seen];
}

/** Extracts the major version from an `<home>/release` file's `JAVA_VERSION="..."` line, handling
 * both the modern scheme ("17.0.9" -> 17) and the legacy "1.8.0_292" -> 8 scheme. */
export function parseMajorVersion(releaseContent: string): number | undefined {
  const match = releaseContent.match(/^JAVA_VERSION="([^"]+)"/m);
  if (!match) return undefined;
  const parts = match[1].split(/[.+]/);
  const raw = parts[0] === '1' && parts.length > 1 ? parts[1] : parts[0];
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : undefined;
}

function tryReadVersion(home: string, source: JdkSource, deps: JdkLocatorDeps): JdkInfo | undefined {
  let content: string;
  try {
    content = deps.readFileSync(path.join(home, 'release'));
  } catch {
    return undefined;
  }
  const version = parseMajorVersion(content);
  if (version === undefined) return undefined;
  return { javaBin: path.join(home, 'bin', 'java'), home, version, source };
}

function safeReaddir(deps: JdkLocatorDeps, dir: string): string[] {
  if (!deps.existsSync(dir)) return [];
  try {
    return deps.readdirSync(dir);
  } catch {
    return [];
  }
}

function pathCandidates(deps: JdkLocatorDeps): string[] {
  const pathEnv = deps.env.PATH;
  if (!pathEnv) return [];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const javaBin = path.join(dir, 'java');
    if (deps.existsSync(javaBin)) {
      let real = javaBin;
      try {
        real = deps.realpathSync(javaBin);
      } catch {
        // fall through with the unresolved path
      }
      // <home>/bin/java -> <home>
      return [path.dirname(path.dirname(real))];
    }
  }
  return [];
}

function homebrewCandidates(deps: JdkLocatorDeps): string[] {
  const bases = ['/opt/homebrew/opt', '/usr/local/opt'];
  const result: string[] = [];
  for (const base of bases) {
    for (const entry of safeReaddir(deps, base).filter((e) => e.startsWith('openjdk'))) {
      result.push(path.join(base, entry, 'libexec/openjdk.jdk/Contents/Home'));
    }
  }
  return result;
}

function sdkmanCandidates(deps: JdkLocatorDeps): string[] {
  const base = path.join(deps.homeDir, '.sdkman/candidates/java');
  return safeReaddir(deps, base)
    .filter((e) => e !== 'current')
    .map((e) => path.join(base, e));
}

function androidStudioJbrCandidates(): string[] {
  const base = '/Applications/Android Studio.app/Contents/jbr';
  // Recent Android Studio bundles a full macOS app-style JBR (an extra Contents/Home nesting);
  // older ones use the jbr dir directly as home. tryReadVersion silently skips whichever is absent.
  return [path.join(base, 'Contents/Home'), base];
}

function libraryJavaVmsCandidates(deps: JdkLocatorDeps): string[] {
  const base = '/Library/Java/JavaVirtualMachines';
  return safeReaddir(deps, base).map((e) => path.join(base, e, 'Contents/Home'));
}

const PRECEDENCE: JdkSource[] = [
  'inflate.javaHome',
  'JAVA_HOME',
  'PATH',
  'java_home',
  'homebrew',
  'sdkman',
  'android-studio-jbr',
  'library-java-vms',
];

function candidateHomesFor(source: JdkSource, configuredJavaHome: string | undefined, deps: JdkLocatorDeps): string[] {
  switch (source) {
    case 'inflate.javaHome':
      return configuredJavaHome ? [configuredJavaHome] : [];
    case 'JAVA_HOME':
      return deps.env.JAVA_HOME ? [deps.env.JAVA_HOME] : [];
    case 'PATH':
      return pathCandidates(deps);
    case 'java_home':
      return deps.javaHomeToolCandidates();
    case 'homebrew':
      return homebrewCandidates(deps);
    case 'sdkman':
      return sdkmanCandidates(deps);
    case 'android-studio-jbr':
      return androidStudioJbrCandidates();
    case 'library-java-vms':
      return libraryJavaVmsCandidates(deps);
  }
}

/** Pure detection function — see module doc for the precedence + fallback rules. */
export function resolveJdk(configuredJavaHome: string | undefined, deps: JdkLocatorDeps): JdkInfo | GuidedError {
  let overallBest: JdkInfo | undefined;

  for (const source of PRECEDENCE) {
    let bestForSource: JdkInfo | undefined;
    for (const home of candidateHomesFor(source, configuredJavaHome, deps)) {
      const info = tryReadVersion(home, source, deps);
      if (info && (!bestForSource || info.version > bestForSource.version)) {
        bestForSource = info;
      }
    }
    if (bestForSource) {
      if (!overallBest || bestForSource.version > overallBest.version) overallBest = bestForSource;
      if (bestForSource.version >= REQUIRED_JDK_VERSION) {
        return bestForSource;
      }
    }
  }

  return {
    kind: 'guidedSetup',
    requiredVersion: REQUIRED_JDK_VERSION,
    downloadUrl: JDK_DOWNLOAD_URL,
    message: `Inflate requires JDK ${REQUIRED_JDK_VERSION} or later. Install one and re-check, or set "inflate.javaHome".`,
    closestFound: overallBest
      ? { version: overallBest.version, home: overallBest.home, source: overallBest.source }
      : undefined,
  };
}

/** Caches the detection result in memory; call {@link invalidate} to force re-detection (design:
 * "re-validated on spawn failure" — HostManager calls this when spawning the cached javaBin fails). */
export class JdkLocator {
  private cached?: JdkInfo | GuidedError;

  constructor(private readonly deps: JdkLocatorDeps = defaultDeps()) {}

  locate(configuredJavaHome: string | undefined): JdkInfo | GuidedError {
    if (!this.cached) {
      this.cached = resolveJdk(configuredJavaHome, this.deps);
    }
    return this.cached;
  }

  invalidate(): void {
    this.cached = undefined;
  }
}
