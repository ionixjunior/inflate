import { describe, expect, it } from 'vitest';
import * as path from 'path';
import {
  ResourceRootResolver,
  RootsDeps,
  detectEcosystem,
  parseManifest,
  discoverResourceRoot,
  isEligibleResourceFile,
  isResFolderName,
  isResourceTypeDir,
} from './roots';

/** Controllable in-memory deps: mutate `configured`/`workspaceRoot` to simulate setting changes. */
interface FakeDeps extends RootsDeps {
  configured: string[];
  workspaceRoot?: string;
}

/**
 * In-memory {@link RootsDeps} over a set of directory paths. Only directories are modeled (the
 * walker never reads files); `readdir` returns the immediate child dir names of a path. Casing is
 * preserved exactly as given, so case-insensitive matching is tested independently of the host FS.
 */
function fakeDeps(
  dirs: string[],
  opts: { configured?: string[]; workspaceRoot?: string; files?: Record<string, string> } = {},
): FakeDeps {
  const set = new Set(dirs.map((d) => path.resolve(d)));
  const files: Record<string, string> = {};
  for (const [p, c] of Object.entries(opts.files ?? {})) files[path.resolve(p)] = c;
  const state: FakeDeps = {
    configured: opts.configured ?? [],
    workspaceRoot: opts.workspaceRoot,
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
    getConfiguredRoots: () => state.configured,
    isFile: (p: string) => path.resolve(p) in files,
    readFile: (p: string) => {
      const rp = path.resolve(p);
      if (!(rp in files)) throw new Error(`ENOENT: ${rp}`);
      return files[rp];
    },
  };
  return state;
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

// --- T22: source-set enumeration, ordering, settings merge, ecosystem tag, memo ---

// A single-module Gradle project with two source sets (main + free flavor) under app/, plus a
// SEPARATE lib module that must NOT be auto-included (Q7).
const GRADLE_MODULE_DIRS = [
  '/w/proj',
  '/w/proj/app',
  '/w/proj/app/src',
  '/w/proj/app/src/main',
  '/w/proj/app/src/main/res',
  '/w/proj/app/src/main/res/layout',
  '/w/proj/app/src/free',
  '/w/proj/app/src/free/res',
  '/w/proj/app/src/free/res/values',
  '/w/proj/lib',
  '/w/proj/lib/src',
  '/w/proj/lib/src/main',
  '/w/proj/lib/src/main/res',
  '/w/proj/lib/src/main/res/values',
];

describe('detectEcosystem', () => {
  it('classifies gradle / dotnet / plain / none by root shape (RES-05)', () => {
    expect(detectEcosystem(path.resolve('/w/proj/app/src/main/res'))).toBe('gradle');
    expect(detectEcosystem(path.resolve('/w/dn/Resources'))).toBe('dotnet');
    expect(detectEcosystem(path.resolve('/w/plain/res'))).toBe('plain');
    expect(detectEcosystem(null)).toBe('none');
  });
});

describe('ResourceRootResolver.resolve — ordering & ecosystem (P1-G AC5, Q7)', () => {
  it('orders the containing module source sets: containing -> main -> alpha, excluding other modules', () => {
    const deps = fakeDeps(GRADLE_MODULE_DIRS);
    const info = new ResourceRootResolver(deps).resolve('/w/proj/app/src/main/res/layout/main.xml');
    expect(info.ecosystem).toBe('gradle');
    expect(info.roots).toEqual([
      path.resolve('/w/proj/app/src/main/res'),
      path.resolve('/w/proj/app/src/free/res'),
    ]);
    // The lib module's res is NOT auto-included (Q7 — configured roots would be required).
    expect(info.roots).not.toContain(path.resolve('/w/proj/lib/src/main/res'));
  });

  it('puts the containing flavor source set first (flavor precedence)', () => {
    const deps = fakeDeps(GRADLE_MODULE_DIRS);
    const info = new ResourceRootResolver(deps).resolve('/w/proj/app/src/free/res/values/strings.xml');
    expect(info.roots).toEqual([
      path.resolve('/w/proj/app/src/free/res'),
      path.resolve('/w/proj/app/src/main/res'),
    ]);
  });

  it('appends configured roots (absolute + workspace-relative), after discovered roots', () => {
    const deps = fakeDeps(GRADLE_MODULE_DIRS, {
      configured: ['/abs/extra/res', 'shared/res'],
      workspaceRoot: '/w',
    });
    const info = new ResourceRootResolver(deps).resolve('/w/proj/app/src/main/res/layout/main.xml');
    expect(info.roots).toEqual([
      path.resolve('/w/proj/app/src/main/res'),
      path.resolve('/w/proj/app/src/free/res'),
      path.resolve('/abs/extra/res'),
      path.resolve('/w/shared/res'),
    ]);
  });

  it('tags a bare conventional res tree as plain (single root)', () => {
    const deps = fakeDeps(['/w/plain', '/w/plain/res', '/w/plain/res/layout']);
    const info = new ResourceRootResolver(deps).resolve('/w/plain/res/layout/main.xml');
    expect(info.ecosystem).toBe('plain');
    expect(info.roots).toEqual([path.resolve('/w/plain/res')]);
  });

  it('tags a .NET Resources tree as dotnet (single root)', () => {
    const deps = fakeDeps(['/w/dn', '/w/dn/Resources', '/w/dn/Resources/Layout']);
    const info = new ResourceRootResolver(deps).resolve('/w/dn/Resources/Layout/Main.axml');
    expect(info.ecosystem).toBe('dotnet');
    expect(info.roots).toEqual([path.resolve('/w/dn/Resources')]);
  });

  it('single-file mode: no root -> ecosystem none, empty discovered roots (still merges configured)', () => {
    const deps = fakeDeps(['/tmp/snip'], { configured: ['/abs/res'], workspaceRoot: '/w' });
    const info = new ResourceRootResolver(deps).resolve('/tmp/snip/scratch.xml');
    expect(info.ecosystem).toBe('none');
    expect(info.roots).toEqual([path.resolve('/abs/res')]);
  });
});

describe('ResourceRootResolver memoization & invalidation (P1-G AC5)', () => {
  it('memoizes per document and refreshes only after invalidate on a setting change', () => {
    const deps = fakeDeps(['/w/plain', '/w/plain/res', '/w/plain/res/layout'], {
      configured: [],
      workspaceRoot: '/w',
    });
    const resolver = new ResourceRootResolver(deps);
    const doc = '/w/plain/res/layout/main.xml';

    const first = resolver.resolve(doc);
    expect(first.roots).toEqual([path.resolve('/w/plain/res')]);

    // Simulate an `inflate.resourceRoots` setting change.
    deps.configured = ['/extra/res'];

    // Still cached — memo returns the pre-change result.
    expect(resolver.resolve(doc).roots).toEqual([path.resolve('/w/plain/res')]);

    // After invalidation the new configured root is picked up.
    resolver.invalidate(doc);
    expect(resolver.resolve(doc).roots).toEqual([
      path.resolve('/w/plain/res'),
      path.resolve('/extra/res'),
    ]);
  });
});

// --- T23: manifest package name + android:theme hint (RES-01, CFG-04) ---

const GRADLE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app">
  <application android:theme="@style/AppTheme" />
</manifest>`;

const DOTNET_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.dotnet">
  <application android:theme="@android:style/Theme.Material.Light" />
</manifest>`;

describe('parseManifest', () => {
  it('extracts package and android:theme', () => {
    expect(parseManifest(GRADLE_MANIFEST)).toEqual({
      packageName: 'com.example.app',
      theme: '@style/AppTheme',
    });
  });

  it('returns undefined for absent attributes (graceful no-hint)', () => {
    expect(parseManifest('<manifest package="x.y"></manifest>')).toEqual({
      packageName: 'x.y',
      theme: undefined,
    });
    expect(parseManifest('<manifest></manifest>')).toEqual({
      packageName: undefined,
      theme: undefined,
    });
  });

  it('recovers attributes from a malformed (unclosed) manifest without throwing', () => {
    const malformed = '<manifest package="z.z" ><application android:theme="@style/Broken" ';
    expect(parseManifest(malformed)).toEqual({ packageName: 'z.z', theme: '@style/Broken' });
  });
});

describe('ResourceRootResolver — manifest completion (RES-01, CFG-04)', () => {
  it('reads the Gradle source-set manifest for package + theme', () => {
    const deps = fakeDeps(GRADLE_MODULE_DIRS, {
      files: { '/w/proj/app/src/main/AndroidManifest.xml': GRADLE_MANIFEST },
    });
    const info = new ResourceRootResolver(deps).resolve('/w/proj/app/src/main/res/layout/main.xml');
    expect(info.packageName).toBe('com.example.app');
    expect(info.manifestTheme).toBe('@style/AppTheme');
  });

  it('reads the .NET Properties/AndroidManifest.xml (RES-01)', () => {
    const deps = fakeDeps(['/w/dn', '/w/dn/Properties', '/w/dn/Resources', '/w/dn/Resources/Layout'], {
      files: { '/w/dn/Properties/AndroidManifest.xml': DOTNET_MANIFEST },
    });
    const info = new ResourceRootResolver(deps).resolve('/w/dn/Resources/Layout/Main.axml');
    expect(info.packageName).toBe('com.example.dotnet');
    expect(info.manifestTheme).toBe('@android:style/Theme.Material.Light');
  });

  it('falls back to com.inflate.preview and no theme when no manifest exists', () => {
    const deps = fakeDeps(GRADLE_MODULE_DIRS); // no files
    const info = new ResourceRootResolver(deps).resolve('/w/proj/app/src/main/res/layout/main.xml');
    expect(info.packageName).toBe('com.inflate.preview');
    expect(info.manifestTheme).toBeUndefined();
  });

  it('degrades to fallback package with no theme when the manifest is malformed (no attrs)', () => {
    const deps = fakeDeps(['/w/dn', '/w/dn/Properties', '/w/dn/Resources', '/w/dn/Resources/Layout'], {
      files: { '/w/dn/Properties/AndroidManifest.xml': '<<< not really xml >>>' },
    });
    const info = new ResourceRootResolver(deps).resolve('/w/dn/Resources/Layout/Main.axml');
    expect(info.packageName).toBe('com.inflate.preview');
    expect(info.manifestTheme).toBeUndefined();
  });
});
