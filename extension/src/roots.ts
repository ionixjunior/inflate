/**
 * ResourceRootResolver (design component #3, §D3) — the extension-side resource-tree walker that
 * maps any project shape onto the engine's `localResourceDirs` (RES-01/05). Built incrementally:
 *
 *   T21 (this commit): the discovery walker — walk up from the previewed file to the nearest
 *        `res`/`resources` dir (case-insensitive) containing >= 1 Android resource-type subdir;
 *        `.xml` and `.axml` are both eligible; returns the root or a none-found signal
 *        (single-file mode).
 *   T22: source-set enumeration + ordering, `inflate.resourceRoots` merge, ecosystem tagging, memo.
 *   T23: nearest AndroidManifest.xml package name + `android:theme` hint.
 *
 * All filesystem access is behind {@link RootsDeps} so the walker is unit-testable with in-memory
 * fixtures (mirrors the JdkLocator pattern). `defaultDeps()` wires the real Node `fs`.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Android resource-type directory base names (the segment before any `-qualifier`). A directory is
 * a resource-type dir if its lower-cased name, with any `-qualifier` suffix stripped, is in this
 * set — so `layout`, `layout-sw600dp`, `Layout`, `values-night`, `drawable-xxhdpi` all match.
 */
export const RESOURCE_TYPE_DIRS: ReadonlySet<string> = new Set([
  'anim',
  'animator',
  'color',
  'drawable',
  'font',
  'interpolator',
  'layout',
  'menu',
  'mipmap',
  'navigation',
  'raw',
  'transition',
  'values',
  'xml',
]);

/** Previewable resource-file extensions (RES-01: `.xml` native, `.axml` Xamarin/.NET). */
export const ELIGIBLE_EXTENSIONS: ReadonlySet<string> = new Set(['.xml', '.axml']);

/** Injectable filesystem surface — see module doc. {@link defaultDeps} wires the real `fs`. */
export interface RootsDeps {
  /** True if `p` exists and is a directory. */
  isDirectory(p: string): boolean;
  /** Directory entry names (not full paths). Throws if `p` is not a readable directory. */
  readdir(p: string): string[];
}

export function defaultDeps(): RootsDeps {
  return {
    isDirectory: (p: string) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    readdir: (p: string) => fs.readdirSync(p),
  };
}

/** A resource-type dir name matches if its base (before `-qualifier`) is a known Android type. */
export function isResourceTypeDir(name: string): boolean {
  const base = name.toLowerCase().split('-', 1)[0];
  return RESOURCE_TYPE_DIRS.has(base);
}

/** `res` / `resources` matched case-insensitively (Q6: `res/`, `Resources/`, `RESOURCES/`). */
export function isResFolderName(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'res' || n === 'resources';
}

/** True if `docPath` has a previewable extension (`.xml`/`.axml`), matched case-insensitively. */
export function isEligibleResourceFile(docPath: string): boolean {
  return ELIGIBLE_EXTENSIONS.has(path.extname(docPath).toLowerCase());
}

function hasResourceTypeChild(dir: string, deps: RootsDeps): boolean {
  let entries: string[];
  try {
    entries = deps.readdir(dir);
  } catch {
    return false;
  }
  return entries.some((e) => isResourceTypeDir(e) && deps.isDirectory(path.join(dir, e)));
}

/**
 * Walk up from `docPath` to the nearest ancestor directory named `res`/`resources`
 * (case-insensitively) that contains at least one Android resource-type subdirectory. Returns the
 * absolute path of that root, or `null` when the file lives outside any recognizable resource tree
 * (single-file mode — RES-05 degradation applies). The file's own extension is not consulted here;
 * use {@link isEligibleResourceFile} for that.
 */
export function discoverResourceRoot(docPath: string, deps: RootsDeps = defaultDeps()): string | null {
  let dir = path.dirname(path.resolve(docPath));
  while (true) {
    const base = path.basename(dir);
    if (isResFolderName(base) && deps.isDirectory(dir) && hasResourceTypeChild(dir, deps)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null; // reached the filesystem root without finding a resource root
    }
    dir = parent;
  }
}
