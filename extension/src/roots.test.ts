import { describe, expect, it } from 'vitest';
import * as path from 'path';
import {
  RootsDeps,
  discoverResourceRoot,
  isEligibleResourceFile,
  isResFolderName,
  isResourceTypeDir,
} from './roots';

/**
 * In-memory {@link RootsDeps} over a set of directory paths. Only directories are modeled (the
 * walker never reads files); `readdir` returns the immediate child dir names of a path. Casing is
 * preserved exactly as given, so case-insensitive matching is tested independently of the host FS.
 */
function fakeDeps(dirs: string[]): RootsDeps {
  const set = new Set(dirs.map((d) => path.resolve(d)));
  return {
    isDirectory: (p: string) => set.has(path.resolve(p)),
    readdir: (p: string) => {
      const rp = path.resolve(p);
      if (!set.has(rp)) throw new Error(`ENOTDIR: ${rp}`);
      const children: string[] = [];
      for (const d of set) {
        if (path.dirname(d) === rp && d !== rp) children.push(path.basename(d));
      }
      return children;
    },
  };
}

// Gradle-shaped tree: .../app/src/main/res with layout/ + values/ + layout-sw600dp/.
const GRADLE_DIRS = [
  '/w/gradle-sample',
  '/w/gradle-sample/app',
  '/w/gradle-sample/app/src',
  '/w/gradle-sample/app/src/main',
  '/w/gradle-sample/app/src/main/res',
  '/w/gradle-sample/app/src/main/res/layout',
  '/w/gradle-sample/app/src/main/res/layout-sw600dp',
  '/w/gradle-sample/app/src/main/res/values',
  '/w/gradle-sample/app/src/main/res/values-night',
  '/w/gradle-sample/app/src/main/res/drawable',
];

// .NET-shaped tree with legacy Xamarin casing: Resources/Layout/Main.axml.
const DOTNET_DIRS = [
  '/w/dotnet-sample',
  '/w/dotnet-sample/Properties',
  '/w/dotnet-sample/Resources',
  '/w/dotnet-sample/Resources/Layout',
  '/w/dotnet-sample/Resources/layout-sw600dp',
  '/w/dotnet-sample/Resources/values',
  '/w/dotnet-sample/Resources/drawable',
];

describe('isResourceTypeDir', () => {
  it('accepts resource-type dirs with and without qualifiers, case-insensitively', () => {
    expect(isResourceTypeDir('layout')).toBe(true);
    expect(isResourceTypeDir('layout-sw600dp')).toBe(true);
    expect(isResourceTypeDir('Layout')).toBe(true);
    expect(isResourceTypeDir('values-night')).toBe(true);
    expect(isResourceTypeDir('drawable-xxhdpi')).toBe(true);
    expect(isResourceTypeDir('mipmap-anydpi-v26')).toBe(true);
  });

  it('rejects non-resource dirs', () => {
    expect(isResourceTypeDir('src')).toBe(false);
    expect(isResourceTypeDir('java')).toBe(false);
    expect(isResourceTypeDir('assets')).toBe(false);
    expect(isResourceTypeDir('Properties')).toBe(false);
  });
});

describe('isResFolderName', () => {
  it('matches res/resources case-insensitively', () => {
    expect(isResFolderName('res')).toBe(true);
    expect(isResFolderName('resources')).toBe(true);
    expect(isResFolderName('Resources')).toBe(true);
    expect(isResFolderName('RESOURCES')).toBe(true);
    expect(isResFolderName('resource')).toBe(false);
    expect(isResFolderName('assets')).toBe(false);
  });
});

describe('isEligibleResourceFile', () => {
  it('accepts .xml and .axml, case-insensitively (RES-01)', () => {
    expect(isEligibleResourceFile('/w/res/layout/main.xml')).toBe(true);
    expect(isEligibleResourceFile('/w/Resources/Layout/Main.axml')).toBe(true);
    expect(isEligibleResourceFile('/w/res/layout/MAIN.AXML')).toBe(true);
  });

  it('rejects non-XML resource files', () => {
    expect(isEligibleResourceFile('/w/res/drawable/icon.png')).toBe(false);
    expect(isEligibleResourceFile('/w/notes.txt')).toBe(false);
  });
});

describe('discoverResourceRoot (P1-G AC1, Q6)', () => {
  it('finds the res root for a nested Gradle layout file', () => {
    const deps = fakeDeps(GRADLE_DIRS);
    const root = discoverResourceRoot('/w/gradle-sample/app/src/main/res/layout/main.xml', deps);
    expect(root).toBe(path.resolve('/w/gradle-sample/app/src/main/res'));
  });

  it('finds the Resources root for a legacy-cased .axml file (Q6)', () => {
    const deps = fakeDeps(DOTNET_DIRS);
    const root = discoverResourceRoot('/w/dotnet-sample/Resources/Layout/Main.axml', deps);
    expect(root).toBe(path.resolve('/w/dotnet-sample/Resources'));
  });

  it('resolves a values file too (not only layout)', () => {
    const deps = fakeDeps(GRADLE_DIRS);
    const root = discoverResourceRoot('/w/gradle-sample/app/src/main/res/values/colors.xml', deps);
    expect(root).toBe(path.resolve('/w/gradle-sample/app/src/main/res'));
  });

  it('rejects a res-named dir that has no resource-type subdir', () => {
    // /w/proj/res contains only non-resource subdirs -> not a resource root.
    const deps = fakeDeps(['/w/proj', '/w/proj/res', '/w/proj/res/java', '/w/proj/res/assets']);
    const root = discoverResourceRoot('/w/proj/res/java/main.xml', deps);
    expect(root).toBeNull();
  });

  it('skips a bare res dir and keeps walking to a real resource root above it', () => {
    const deps = fakeDeps([
      '/w/m',
      '/w/m/res', // real resource root (has layout/)
      '/w/m/res/layout',
      '/w/m/res/inner', // an unrelated "res"-less nested dir
      '/w/m/res/inner/res', // a res-named dir with NO resource-type subdir
    ]);
    const root = discoverResourceRoot('/w/m/res/inner/res/foo.xml', deps);
    // The nested /w/m/res/inner/res has no resource-type child, so it is skipped; the walk
    // continues up to /w/m/res which has layout/.
    expect(root).toBe(path.resolve('/w/m/res'));
  });

  it('returns null in single-file mode (no resource tree at all)', () => {
    const deps = fakeDeps(['/tmp/snippet']);
    const root = discoverResourceRoot('/tmp/snippet/scratch.xml', deps);
    expect(root).toBeNull();
  });
});
