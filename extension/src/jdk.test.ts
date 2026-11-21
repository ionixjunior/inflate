import { describe, expect, it } from 'vitest';
import {
  GuidedError,
  JDK_DOWNLOAD_URL,
  JdkInfo,
  JdkLocator,
  JdkLocatorDeps,
  JdkSource,
  REQUIRED_JDK_VERSION,
  isGuidedError,
  parseJavaHomeOutput,
  parseMajorVersion,
  resolveJdk,
} from './jdk';

/** Builds an in-memory JdkLocatorDeps fixture: `files` maps a `release` file path to its content
 * (its presence implies the parent home dir "exists"); `dirs` maps a directory path to its listing. */
function fakeDeps(opts: {
  platform: NodeJS.Platform;
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
    platform: opts.platform,
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
      platform: 'darwin',
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
    expect(info.javaBin).toBe('/configured/bin/java');
  });

  it('falls through to JAVA_HOME when inflate.javaHome is not configured', () => {
    const deps = fakeDeps({
      platform: 'darwin',
      env: { JAVA_HOME: '/opt/java-home' },
      files: { '/opt/java-home/release': releaseContent('17.0.1') },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('JAVA_HOME');
  });

  it('falls through to PATH, resolving the java binary symlink to its home', () => {
    const deps = fakeDeps({
      platform: 'darwin',
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
      platform: 'darwin',
      files: { '/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home/release': releaseContent('17.0.9') },
      javaHomeToolCandidates: () => ['/Library/Java/JavaVirtualMachines/microsoft-17.jdk/Contents/Home'],
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('java_home');
    expect((result as import('./jdk').JdkInfo).version).toBe(17);
  });

  it('falls through to Homebrew (/opt/homebrew/opt/openjdk*)', () => {
    const deps = fakeDeps({
      platform: 'darwin',
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
      platform: 'darwin',
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
      platform: 'darwin',
      files: {
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home/release': releaseContent('17.0.6'),
      },
    });
    const result = resolveJdk(undefined, deps);
    expect((result as import('./jdk').JdkInfo).source).toBe('android-studio-jbr');
  });

  it('falls through to /Library/Java/JavaVirtualMachines/* (incl. microsoft-*) last', () => {
    const deps = fakeDeps({
      platform: 'darwin',
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
      platform: 'darwin',
      env: { JAVA_HOME: '/opt/java11' },
      files: { '/opt/java11/release': releaseContent('11.0.20') },
    });
    const result = resolveJdk(undefined, deps);
    expect(isGuidedError(result)).toBe(true);
    const err = result as GuidedError;
    expect(err.closestFound).toEqual({ version: 11, home: '/opt/java11', source: 'JAVA_HOME' });
  });

  it('returns the P1-H AC3 guided-error shape when nothing is found at all', () => {
    const deps = fakeDeps({ platform: 'darwin' });
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
      platform: 'darwin',
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
      platform: 'darwin',
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

/** Where one source of the search list keeps a JDK of the given version. */
interface Placement {
  configured?: string;
  env?: Record<string, string>;
  files?: Record<string, string>;
  dirs?: Record<string, string[]>;
  extraExists?: string[];
  javaHomeTool?: string[];
}

interface SourceFixture {
  label: string;
  source: JdkSource;
  home: string;
  place: (version: string) => Placement;
}

/** Resolves with a JDK 17 in `sources[from]` and a JDK 21 in every source after it, so the test
 * fails both when the order is wrong and when a later, newer JDK wins. */
function resolveFrom(
  platform: NodeJS.Platform,
  homeDir: string,
  env: Record<string, string>,
  sources: SourceFixture[],
  from: number,
): JdkInfo | GuidedError {
  const placements = sources.slice(from).map((s, j) => s.place(j === 0 ? '17.0.1' : '21.0.1'));
  const merged = placements.reduce<Required<Placement>>(
    (acc, p) => ({
      configured: acc.configured || p.configured || '',
      env: { ...acc.env, ...p.env },
      files: { ...acc.files, ...p.files },
      dirs: { ...acc.dirs, ...p.dirs },
      extraExists: [...acc.extraExists, ...(p.extraExists ?? [])],
      javaHomeTool: [...acc.javaHomeTool, ...(p.javaHomeTool ?? [])],
    }),
    { configured: '', env, files: {}, dirs: {}, extraExists: [], javaHomeTool: [] },
  );
  return resolveJdk(
    merged.configured || undefined,
    fakeDeps({
      platform,
      homeDir,
      env: merged.env,
      files: merged.files,
      dirs: merged.dirs,
      extraExists: merged.extraExists,
      javaHomeToolCandidates: () => merged.javaHomeTool,
    }),
  );
}

const WINDOWS_SOURCES: SourceFixture[] = [
  {
    label: 'inflate.javaHome',
    source: 'inflate.javaHome',
    home: 'D:\\jdks\\configured',
    place: (v) => ({ configured: 'D:\\jdks\\configured', files: { 'D:\\jdks\\configured\\release': releaseContent(v) } }),
  },
  {
    label: 'JAVA_HOME',
    source: 'JAVA_HOME',
    home: 'D:\\jdks\\java-home',
    place: (v) => ({ env: { JAVA_HOME: 'D:\\jdks\\java-home' }, files: { 'D:\\jdks\\java-home\\release': releaseContent(v) } }),
  },
  {
    label: 'PATH',
    source: 'PATH',
    home: 'D:\\jdks\\on-path',
    place: (v) => ({
      env: { PATH: 'C:\\Windows\\System32;D:\\jdks\\on-path\\bin' },
      extraExists: ['D:\\jdks\\on-path\\bin\\java.exe'],
      files: { 'D:\\jdks\\on-path\\release': releaseContent(v) },
    }),
  },
  {
    label: '%ProgramFiles%\\Java\\*',
    source: 'program-files-java',
    home: 'C:\\Program Files\\Java\\jdk-a',
    place: (v) => ({
      dirs: { 'C:\\Program Files\\Java': ['jdk-a'] },
      files: { 'C:\\Program Files\\Java\\jdk-a\\release': releaseContent(v) },
    }),
  },
  {
    label: '%ProgramFiles%\\Microsoft\\jdk-*',
    source: 'program-files-microsoft',
    home: 'C:\\Program Files\\Microsoft\\jdk-a',
    place: (v) => ({
      dirs: { 'C:\\Program Files\\Microsoft': ['jdk-a'] },
      files: { 'C:\\Program Files\\Microsoft\\jdk-a\\release': releaseContent(v) },
    }),
  },
  {
    label: '%ProgramFiles%\\Eclipse Adoptium\\*',
    source: 'program-files-adoptium',
    home: 'C:\\Program Files\\Eclipse Adoptium\\jdk-a',
    place: (v) => ({
      dirs: { 'C:\\Program Files\\Eclipse Adoptium': ['jdk-a'] },
      files: { 'C:\\Program Files\\Eclipse Adoptium\\jdk-a\\release': releaseContent(v) },
    }),
  },
  {
    label: '%ProgramFiles%\\Zulu\\*',
    source: 'program-files-zulu',
    home: 'C:\\Program Files\\Zulu\\zulu-a',
    place: (v) => ({
      dirs: { 'C:\\Program Files\\Zulu': ['zulu-a'] },
      files: { 'C:\\Program Files\\Zulu\\zulu-a\\release': releaseContent(v) },
    }),
  },
  {
    label: '%ProgramFiles%\\Android\\Android Studio\\jbr',
    source: 'android-studio-jbr',
    home: 'C:\\Program Files\\Android\\Android Studio\\jbr',
    place: (v) => ({ files: { 'C:\\Program Files\\Android\\Android Studio\\jbr\\release': releaseContent(v) } }),
  },
];

const LINUX_SOURCES: SourceFixture[] = [
  {
    label: 'inflate.javaHome',
    source: 'inflate.javaHome',
    home: '/opt/configured',
    place: (v) => ({ configured: '/opt/configured', files: { '/opt/configured/release': releaseContent(v) } }),
  },
  {
    label: 'JAVA_HOME',
    source: 'JAVA_HOME',
    home: '/opt/java-home',
    place: (v) => ({ env: { JAVA_HOME: '/opt/java-home' }, files: { '/opt/java-home/release': releaseContent(v) } }),
  },
  {
    label: 'PATH',
    source: 'PATH',
    home: '/opt/on-path',
    place: (v) => ({
      env: { PATH: '/usr/bin:/opt/on-path/bin' },
      extraExists: ['/opt/on-path/bin/java'],
      files: { '/opt/on-path/release': releaseContent(v) },
    }),
  },
  {
    label: '/usr/lib/jvm/*',
    source: 'usr-lib-jvm',
    home: '/usr/lib/jvm/java-a',
    place: (v) => ({ dirs: { '/usr/lib/jvm': ['java-a'] }, files: { '/usr/lib/jvm/java-a/release': releaseContent(v) } }),
  },
  {
    label: '~/.sdkman/candidates/java/*',
    source: 'sdkman',
    home: '/home/dev/.sdkman/candidates/java/a-tem',
    place: (v) => ({
      dirs: { '/home/dev/.sdkman/candidates/java': ['a-tem'] },
      files: { '/home/dev/.sdkman/candidates/java/a-tem/release': releaseContent(v) },
    }),
  },
  {
    label: '/opt/android-studio/jbr',
    source: 'android-studio-jbr',
    home: '/opt/android-studio/jbr',
    place: (v) => ({ files: { '/opt/android-studio/jbr/release': releaseContent(v) } }),
  },
  {
    label: '~/android-studio/jbr',
    source: 'user-android-studio-jbr',
    home: '/home/dev/android-studio/jbr',
    place: (v) => ({ files: { '/home/dev/android-studio/jbr/release': releaseContent(v) } }),
  },
];

const DARWIN_SOURCES: SourceFixture[] = [
  {
    label: 'inflate.javaHome',
    source: 'inflate.javaHome',
    home: '/configured',
    place: (v) => ({ configured: '/configured', files: { '/configured/release': releaseContent(v) } }),
  },
  {
    label: 'JAVA_HOME',
    source: 'JAVA_HOME',
    home: '/opt/java-home',
    place: (v) => ({ env: { JAVA_HOME: '/opt/java-home' }, files: { '/opt/java-home/release': releaseContent(v) } }),
  },
  {
    label: 'PATH',
    source: 'PATH',
    home: '/opt/on-path',
    place: (v) => ({
      env: { PATH: '/usr/bin:/opt/on-path/bin' },
      extraExists: ['/opt/on-path/bin/java'],
      files: { '/opt/on-path/release': releaseContent(v) },
    }),
  },
  {
    label: '/usr/libexec/java_home -V',
    source: 'java_home',
    home: '/opt/from-java-home-tool',
    place: (v) => ({ javaHomeTool: ['/opt/from-java-home-tool'], files: { '/opt/from-java-home-tool/release': releaseContent(v) } }),
  },
  {
    label: 'Homebrew',
    source: 'homebrew',
    home: '/opt/homebrew/opt/openjdk@a/libexec/openjdk.jdk/Contents/Home',
    place: (v) => ({
      dirs: { '/opt/homebrew/opt': ['openjdk@a'] },
      files: { '/opt/homebrew/opt/openjdk@a/libexec/openjdk.jdk/Contents/Home/release': releaseContent(v) },
    }),
  },
  {
    label: 'SDKMAN',
    source: 'sdkman',
    home: '/Users/dev/.sdkman/candidates/java/a-tem',
    place: (v) => ({
      dirs: { '/Users/dev/.sdkman/candidates/java': ['a-tem'] },
      files: { '/Users/dev/.sdkman/candidates/java/a-tem/release': releaseContent(v) },
    }),
  },
  {
    label: 'Android Studio JBR',
    source: 'android-studio-jbr',
    home: '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    place: (v) => ({ files: { '/Applications/Android Studio.app/Contents/jbr/Contents/Home/release': releaseContent(v) } }),
  },
  {
    label: '/Library/Java/JavaVirtualMachines/*',
    source: 'library-java-vms',
    home: '/Library/Java/JavaVirtualMachines/a.jdk/Contents/Home',
    place: (v) => ({
      dirs: { '/Library/Java/JavaVirtualMachines': ['a.jdk'] },
      files: { '/Library/Java/JavaVirtualMachines/a.jdk/Contents/Home/release': releaseContent(v) },
    }),
  },
];

describe('resolveJdk on win32', () => {
  it.each(WINDOWS_SOURCES.map((s, i) => [s.label, i] as const))(
    'finds the JDK 17 in %s before the sources after it',
    (_label, i) => {
      const result = resolveFrom('win32', 'C:\\Users\\dev', { ProgramFiles: 'C:\\Program Files' }, WINDOWS_SOURCES, i);

      expect(result).toMatchObject({ source: WINDOWS_SOURCES[i].source, home: WINDOWS_SOURCES[i].home, version: 17 });
    },
  );

  it('finds C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot when it is the only JDK, with javaBin bin\\java.exe', () => {
    const deps = fakeDeps({
      platform: 'win32',
      env: { ProgramFiles: 'C:\\Program Files' },
      dirs: { 'C:\\Program Files\\Microsoft': ['jdk-17.0.13.11-hotspot'] },
      files: { 'C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot\\release': releaseContent('17.0.13') },
    });

    expect(resolveJdk(undefined, deps)).toEqual({
      javaBin: 'C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot\\bin\\java.exe',
      home: 'C:\\Program Files\\Microsoft\\jdk-17.0.13.11-hotspot',
      version: 17,
      source: 'program-files-microsoft',
    });
  });

  it('uses C:\\Program Files when ProgramFiles is unset', () => {
    const deps = fakeDeps({
      platform: 'win32',
      env: {},
      dirs: { 'C:\\Program Files\\Zulu': ['zulu-17'] },
      files: { 'C:\\Program Files\\Zulu\\zulu-17\\release': releaseContent('17.0.13') },
    });

    expect(resolveJdk(undefined, deps)).toMatchObject({ home: 'C:\\Program Files\\Zulu\\zulu-17', source: 'program-files-zulu' });
  });

  it('prefers the JDK 17 under %ProgramFiles%\\Zulu\\ over a JDK 11 in JAVA_HOME', () => {
    const deps = fakeDeps({
      platform: 'win32',
      env: { JAVA_HOME: 'C:\\jdk-11', ProgramFiles: 'C:\\Program Files' },
      dirs: { 'C:\\Program Files\\Zulu': ['zulu-17'] },
      files: {
        'C:\\jdk-11\\release': releaseContent('11.0.20'),
        'C:\\Program Files\\Zulu\\zulu-17\\release': releaseContent('17.0.13'),
      },
    });

    expect(resolveJdk(undefined, deps)).toMatchObject({
      home: 'C:\\Program Files\\Zulu\\zulu-17',
      version: 17,
      source: 'program-files-zulu',
    });
  });
});

describe('resolveJdk on linux', () => {
  it.each(LINUX_SOURCES.map((s, i) => [s.label, i] as const))(
    'finds the JDK 17 in %s before the sources after it',
    (_label, i) => {
      const result = resolveFrom('linux', '/home/dev', {}, LINUX_SOURCES, i);

      expect(result).toMatchObject({ source: LINUX_SOURCES[i].source, home: LINUX_SOURCES[i].home, version: 17 });
    },
  );

  it('skips the SDKMAN current link', () => {
    const deps = fakeDeps({
      platform: 'linux',
      homeDir: '/home/dev',
      dirs: { '/home/dev/.sdkman/candidates/java': ['current', '17.0.9-tem'] },
      files: {
        '/home/dev/.sdkman/candidates/java/current/release': releaseContent('21.0.1'),
        '/home/dev/.sdkman/candidates/java/17.0.9-tem/release': releaseContent('17.0.9'),
      },
    });

    expect(resolveJdk(undefined, deps)).toMatchObject({ home: '/home/dev/.sdkman/candidates/java/17.0.9-tem', version: 17 });
  });

  it('finds /usr/lib/jvm/java-17-openjdk-amd64 when it is the only JDK, with javaBin bin/java', () => {
    const deps = fakeDeps({
      platform: 'linux',
      dirs: { '/usr/lib/jvm': ['java-17-openjdk-amd64'] },
      files: { '/usr/lib/jvm/java-17-openjdk-amd64/release': releaseContent('17.0.13') },
    });

    expect(resolveJdk(undefined, deps)).toEqual({
      javaBin: '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
      home: '/usr/lib/jvm/java-17-openjdk-amd64',
      version: 17,
      source: 'usr-lib-jvm',
    });
  });

  it('finds the JDK 21 in ~/android-studio/jbr when it is the only JDK', () => {
    const deps = fakeDeps({
      platform: 'linux',
      homeDir: '/home/dev',
      files: { '/home/dev/android-studio/jbr/release': releaseContent('21.0.5') },
    });

    expect(resolveJdk(undefined, deps)).toMatchObject({
      home: '/home/dev/android-studio/jbr',
      version: 21,
      source: 'user-android-studio-jbr',
    });
  });
});

describe('resolveJdk on darwin', () => {
  it.each(DARWIN_SOURCES.map((s, i) => [s.label, i] as const))(
    'finds the JDK 17 in %s before the sources after it',
    (_label, i) => {
      const result = resolveFrom('darwin', '/Users/dev', {}, DARWIN_SOURCES, i);

      expect(result).toMatchObject({ source: DARWIN_SOURCES[i].source, home: DARWIN_SOURCES[i].home, version: 17 });
    },
  );
});
