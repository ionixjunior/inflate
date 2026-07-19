import { describe, expect, it } from 'vitest';
import * as path from 'path';
import {
  GuidedError,
  JDK_DOWNLOAD_URL,
  JdkLocator,
  JdkLocatorDeps,
  REQUIRED_JDK_VERSION,
  isGuidedError,
  parseJavaHomeOutput,
  parseMajorVersion,
  resolveJdk,
} from './jdk';

/** Builds an in-memory JdkLocatorDeps fixture: `files` maps a `release` file path to its content
 * (its presence implies the parent home dir "exists"); `dirs` maps a directory path to its listing. */
function fakeDeps(opts: {
  env?: Record<string, string | undefined>;
  homeDir?: string;
  files?: Record<string, string>;
  dirs?: Record<string, string[]>;
  realpaths?: Record<string, string>;
  /** Extra paths that should report as existing (e.g. a `java` binary with no release fixture). */
  extraExists?: string[];
  javaHomeToolCandidates?: () => string[];
}): JdkLocatorDeps & { existsSyncCalls: number; readFileSyncCalls: number } {
  const files = opts.files ?? {};
  const dirs = opts.dirs ?? {};
  const realpaths = opts.realpaths ?? {};
  const extraExists = new Set(opts.extraExists ?? []);
  const state = { existsSyncCalls: 0, readFileSyncCalls: 0 };
  return {
    env: opts.env ?? {},
    homeDir: opts.homeDir ?? '/Users/dev',
    existsSync: (p: string) => {
      state.existsSyncCalls++;
      return p in files || p in dirs || extraExists.has(p);
    },
    readFileSync: (p: string) => {
      state.readFileSyncCalls++;
      if (!(p in files)) throw new Error(`ENOENT: ${p}`);
      return files[p];
    },
    readdirSync: (p: string) => {
      if (!(p in dirs)) throw new Error(`ENOENT: ${p}`);
      return dirs[p];
    },
    realpathSync: (p: string) => realpaths[p] ?? p,
    javaHomeToolCandidates: opts.javaHomeToolCandidates ?? (() => []),
    get existsSyncCalls() {
      return state.existsSyncCalls;
    },
    get readFileSyncCalls() {
      return state.readFileSyncCalls;
    },
  };
}

function releaseContent(version: string): string {
  return `JAVA_VERSION="${version}"\nOS_NAME="Darwin"\n`;
}

describe('parseMajorVersion', () => {
  it('parses the modern version scheme', () => {
    expect(parseMajorVersion(releaseContent('17.0.9'))).toBe(17);
    expect(parseMajorVersion(releaseContent('21.0.1'))).toBe(21);
  });

  it('parses the legacy 1.x version scheme', () => {
    expect(parseMajorVersion(releaseContent('1.8.0_292'))).toBe(8);
  });

  it('returns undefined when JAVA_VERSION is missing', () => {
    expect(parseMajorVersion('OS_NAME="Darwin"\n')).toBeUndefined();
  });
});

describe('parseJavaHomeOutput', () => {
  it('extracts distinct absolute-path lines from /usr/libexec/java_home -V output', () => {
    const output = [
      'Matching Java Virtual Machines (2):',
      '    17.0.9 (arm64) "Microsoft" - "Microsoft OpenJDK 17" /Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home',
      '    11.0.20 (arm64) "Eclipse Adoptium" - "Temurin 11" /Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home',
      '',
      '/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home',
    ].join('\n');
    expect(parseJavaHomeOutput(output)).toEqual([
      '/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home',
      '/Library/Java/JavaVirtualMachines/temurin-11.jdk/Contents/Home',
    ]);
  });
});

describe('resolveJdk — precedence order (P1-H AC2)', () => {
  it('uses inflate.javaHome first, even when a lower-precedence source has a higher version', () => {
    const deps = fakeDeps({
      env: { JAVA_HOME: '/opt/java-home' },
      files: {
        '/configured/release': releaseContent('17.0.1'),
        '/opt/java-home/release': releaseContent('21.0.1'),
      },
    });
    const result = resolveJdk('/configured', deps);
    expect(isGuidedError(result)).toBe(false);
    const info = result as import('./jdk').JdkInfo;
    expect(info.source).toBe('inflate.javaHome');
    expect(info.version).toBe(17);
    expect(info.home).toBe('/configured');
    expect(info.javaBin).toBe(path.join('/configured', 'bin', 'java'));
  });

  it('falls through to JAVA_HOME when inflate.javaHome is not configured', () => {
    const deps = fakeDeps({
      env: { JAVA_HOME: '/opt/java-home' },
      files: { '/opt/java-home/release': releaseContent('17.0.1') },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('JAVA_HOME');
  });

  it('falls through to PATH, resolving the java binary symlink to its home', () => {
    const deps = fakeDeps({
      env: { PATH: '/usr/bin:/opt/jdk17/bin' },
      files: { '/opt/jdk17-real/release': releaseContent('17.0.1') },
      extraExists: ['/opt/jdk17/bin/java'],
      realpaths: { '/opt/jdk17/bin/java': '/opt/jdk17-real/bin/java' },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('PATH');
    expect((result as import('./jdk').JdkInfo).home).toBe('/opt/jdk17-real');
  });

  it('falls through to the java_home tool candidates', () => {
    const deps = fakeDeps({
      files: { '/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home/release': releaseContent('17.0.9') },
      javaHomeToolCandidates: () => ['/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home'],
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('java_home');
    expect((result as import('./jdk').JdkInfo).version).toBe(17);
  });

  it('falls through to Homebrew (/opt/homebrew/opt/openjdk*)', () => {
    const deps = fakeDeps({
      dirs: { '/opt/homebrew/opt': ['openjdk@17', 'wget'] },
      files: {
        '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/release': releaseContent('17.0.2'),
      },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('homebrew');
  });

  it('falls through to SDKMAN (~/.sdkman/candidates/java/*), skipping the "current" symlink', () => {
    const deps = fakeDeps({
      homeDir: '/Users/dev',
      dirs: { '/Users/dev/.sdkman/candidates/java': ['current', '17.0.9-tem'] },
      files: { '/Users/dev/.sdkman/candidates/java/17.0.9-tem/release': releaseContent('17.0.9') },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('sdkman');
    expect((result as import('./jdk').JdkInfo).home).toBe('/Users/dev/.sdkman/candidates/java/17.0.9-tem');
  });

  it('falls through to the Android Studio JBR', () => {
    const deps = fakeDeps({
      files: {
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home/release': releaseContent('17.0.6'),
      },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('android-studio-jbr');
  });

  it('falls through to /Library/Java/JavaVirtualMachines/* (incl. microsoft-*) last', () => {
    const deps = fakeDeps({
      dirs: { '/Library/Java/JavaVirtualMachines': ['microsoft-17.jdk'] },
      files: { '/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home/release': releaseContent('17.0.19') },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('library-java-vms');
    expect((result as import('./jdk').JdkInfo).version).toBe(17);
  });
});

describe('resolveJdk — version floor and guided error (P1-H AC3)', () => {
  it('rejects a JDK below 17 and reports it as the closest match in the guided error', () => {
    const deps = fakeDeps({
      env: { JAVA_HOME: '/opt/java11' },
      files: { '/opt/java11/release': releaseContent('11.0.20') },
    });
    const result = resolveJdk(undefined, deps);
    expect(isGuidedError(result)).toBe(true);
    const err = result as GuidedError;
    expect(err.closestFound).toEqual({ version: 11, home: '/opt/java11', source: 'JAVA_HOME' });
  });

  it('returns the P1-H AC3 guided-error shape when nothing is found at all', () => {
    const deps = fakeDeps({});
    const result = resolveJdk(undefined, deps);
    expect(isGuidedError(result)).toBe(true);
    const err = result as GuidedError;
    expect(err.kind).toBe('guidedSetup');
    expect(err.requiredVersion).toBe(REQUIRED_JDK_VERSION);
    expect(err.downloadUrl).toBe(JDK_DOWNLOAD_URL);
    expect(err.message).toContain(String(REQUIRED_JDK_VERSION));
    expect(err.closestFound).toBeUndefined();
  });

  it('picks a later, adequate source over an earlier, inadequate one', () => {
    const deps = fakeDeps({
      env: { JAVA_HOME: '/opt/java11' },
      dirs: { '/Library/Java/JavaVirtualMachines': ['microsoft-17.jdk'] },
      files: {
        '/opt/java11/release': releaseContent('11.0.20'),
        '/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home/release': releaseContent('17.0.19'),
      },
    });
    const result = resolveJdk(undefined, deps);
    expect(isGuidedError(result)).toBe(false);
    expect((result as import('./jdk').JdkInfo).source).toBe('library-java-vms');
  });
});

describe('JdkLocator — in-memory caching and invalidation', () => {
  it('caches the result across calls, then re-detects after invalidate()', () => {
    const deps = fakeDeps({
      env: { JAVA_HOME: '/opt/java-home' },
      files: { '/opt/java-home/release': releaseContent('17.0.1') },
    });
    const locator = new JdkLocator(deps);

    const first = locator.locate(undefined);
    const callsAfterFirst = deps.readFileSyncCalls;
    expect(callsAfterFirst).toBeGreaterThan(0); // sanity: detection actually read a release file
    const second = locator.locate(undefined);
    expect(deps.readFileSyncCalls).toBe(callsAfterFirst); // no re-scan: cached
    expect(second).toBe(first); // same cached object identity

    locator.invalidate();
    locator.locate(undefined);
    expect(deps.readFileSyncCalls).toBeGreaterThan(callsAfterFirst); // re-scanned after invalidate()
  });
});
