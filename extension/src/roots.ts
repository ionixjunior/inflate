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

/** Injectable filesystem/settings surface — see module doc. {@link defaultDeps} wires real `fs`. */
export interface RootsDeps {
  /** True if `p` exists and is a directory. */
  isDirectory(p: string): boolean;
  /** Directory entry names (not full paths). Throws if `p` is not a readable directory. */
  readdir(p: string): string[];
  /** Raw `inflate.resourceRoots` values (absolute or workspace-relative). Default: none. */
  getConfiguredRoots?(): string[];
  /** Workspace folder root, used to resolve workspace-relative configured roots. */
  workspaceRoot?: string;
  /** True if `p` exists and is a regular file (used for manifest lookup, T23). */
  isFile?(p: string): boolean;
  /** Read a text file (UTF-8). Throws if unreadable. Used for manifest parsing (T23). */
  readFile?(p: string): string;
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
    getConfiguredRoots: () => [],
    isFile: (p: string) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
    readFile: (p: string) => fs.readFileSync(p, 'utf8'),
  };
}

/** Project ecosystem inferred from the discovered root's shape (RES-05). */
export type Ecosystem = 'gradle' | 'dotnet' | 'plain' | 'none';

/**
 * Full resolver output (design component #3). `packageName`/`manifestTheme` are filled by T23;
 * until then `packageName` carries the fallback and `manifestTheme` is undefined.
 */
export interface RootsInfo {
  /** Ordered local resource roots (highest priority first), incl. merged configured roots. */
  roots: string[];
  packageName: string;
  manifestTheme?: string;
  ecosystem: Ecosystem;
}

/** Fallback package name when no manifest is found (design §D3) — namespaces getIdentifier only. */
export const FALLBACK_PACKAGE = 'com.inflate.preview';

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

// --- T22: source-set enumeration, ordering, settings merge, ecosystem tagging, memoization ---

/**
 * If `root` has the Gradle shape `.../src/<sourceSet>/res`, returns `{ moduleDir, sourceSet }`
 * (moduleDir = the dir containing `src`); otherwise null.
 */
function gradleShape(root: string): { moduleDir: string; sourceSet: string; srcDir: string } | null {
  const ssDir = path.dirname(root); // .../src/<ss>
  const srcDir = path.dirname(ssDir); // .../src
  if (path.basename(srcDir) !== 'src') return null;
  const sourceSet = path.basename(ssDir);
  if (!sourceSet || sourceSet === 'src') return null;
  return { moduleDir: path.dirname(srcDir), sourceSet, srcDir };
}

/**
 * Enumerate the containing Gradle module's source-set resource roots under src (each
 * `src/<sourceSet>/res`), ordered: containing source set -> `main` -> the rest alphabetically.
 * Only existing directories are kept.
 * Multi-module cross-references are NOT auto-resolved (Q7 default) — configured roots cover them.
 */
function gradleSourceSetRoots(root: string, deps: RootsDeps): string[] {
  const shape = gradleShape(root);
  if (!shape) return [root];
  const { sourceSet, srcDir } = shape;
  let sets: string[];
  try {
    sets = deps.readdir(srcDir).filter((s) => deps.isDirectory(path.join(srcDir, s)));
  } catch {
    return [root];
  }
  const ordered: string[] = [];
  const push = (s: string) => {
    if (!ordered.includes(s)) ordered.push(s);
  };
  push(sourceSet);
  if (sets.includes('main')) push('main');
  for (const s of sets.slice().sort()) push(s);

  return ordered.map((s) => path.join(srcDir, s, 'res')).filter((r) => deps.isDirectory(r));
}

/** Classify the discovered root's ecosystem (RES-05). `null` root => single-file mode ('none'). */
export function detectEcosystem(root: string | null): Ecosystem {
  if (root === null) return 'none';
  if (gradleShape(root) !== null) return 'gradle';
  if (path.basename(root).toLowerCase() === 'resources') return 'dotnet';
  return 'plain';
}

// --- T23: nearest AndroidManifest.xml -> package name + android:theme hint (RES-01, CFG-04) ---

/**
 * Extract the `package` name and `android:theme` hint from AndroidManifest.xml content by trivial
 * regex (design §D3: "if trivially parseable"). Deliberately tolerant — a malformed manifest that
 * a strict XML parser would reject still yields whatever attributes are present, and yields nothing
 * (undefined) when an attribute is absent. Never throws.
 */
export function parseManifest(content: string): { packageName?: string; theme?: string } {
  const pkg = /\bpackage\s*=\s*"([^"]+)"/.exec(content)?.[1];
  const theme = /\bandroid:theme\s*=\s*"([^"]+)"/.exec(content)?.[1];
  return {
    packageName: pkg && pkg.trim().length > 0 ? pkg.trim() : undefined,
    theme: theme && theme.trim().length > 0 ? theme.trim() : undefined,
  };
}

/**
 * Candidate AndroidManifest.xml locations for the discovered root, in priority order (design §D3):
 *  - Gradle: `src/<containingSourceSet>/AndroidManifest.xml`, then `src/main/...`, then module root.
 *  - .NET:   `Properties/AndroidManifest.xml`, then the project root.
 *  - plain:  the root's parent dir, `AndroidManifest.xml` or `Properties/AndroidManifest.xml`.
 */
function manifestCandidates(root: string, ecosystem: Ecosystem): string[] {
  if (ecosystem === 'gradle') {
    const shape = gradleShape(root);
    if (shape) {
      const { moduleDir, sourceSet, srcDir } = shape;
      return [
        path.join(srcDir, sourceSet, 'AndroidManifest.xml'),
        path.join(srcDir, 'main', 'AndroidManifest.xml'),
        path.join(moduleDir, 'AndroidManifest.xml'),
      ];
    }
  }
  const projectRoot = path.dirname(root);
  if (ecosystem === 'dotnet') {
    return [
      path.join(projectRoot, 'Properties', 'AndroidManifest.xml'),
      path.join(projectRoot, 'AndroidManifest.xml'),
    ];
  }
  return [
    path.join(projectRoot, 'AndroidManifest.xml'),
    path.join(projectRoot, 'Properties', 'AndroidManifest.xml'),
  ];
}

/** Read and parse the first existing manifest candidate; graceful fallback on any failure. */
function resolveManifest(
  root: string | null,
  ecosystem: Ecosystem,
  deps: RootsDeps,
): { packageName: string; manifestTheme?: string } {
  if (root === null || !deps.isFile || !deps.readFile) {
    return { packageName: FALLBACK_PACKAGE };
  }
  for (const candidate of manifestCandidates(root, ecosystem)) {
    if (!deps.isFile(candidate)) continue;
    let content: string;
    try {
      content = deps.readFile(candidate);
    } catch {
      continue;
    }
    const parsed = parseManifest(content);
    return {
      packageName: parsed.packageName ?? FALLBACK_PACKAGE,
      manifestTheme: parsed.theme,
    };
  }
  return { packageName: FALLBACK_PACKAGE };
}

/** Resolve a configured root: absolute kept as-is, relative resolved against the workspace root. */
function resolveConfiguredRoot(entry: string, deps: RootsDeps): string {
  if (path.isAbsolute(entry)) return path.resolve(entry);
  return path.resolve(deps.workspaceRoot ?? process.cwd(), entry);
}

/**
 * ResourceRootResolver — computes the ordered {@link RootsInfo} for a document and memoizes it
 * per normalized document path. The memo is invalidated by fs/setting changes via
 * {@link ResourceRootResolver.invalidate}; the extension wires those triggers.
 */
export class ResourceRootResolver {
  private readonly memo = new Map<string, RootsInfo>();

  constructor(private readonly deps: RootsDeps = defaultDeps()) {}

  /** Drop the memo entry for `docPath` (or the whole memo when omitted). */
  invalidate(docPath?: string): void {
    if (docPath === undefined) this.memo.clear();
    else this.memo.delete(path.resolve(docPath));
  }

  resolve(docPath: string): RootsInfo {
    const key = path.resolve(docPath);
    const cached = this.memo.get(key);
    if (cached) return cached;
    const info = this.computeRoots(docPath);
    this.memo.set(key, info);
    return info;
  }

  private computeRoots(docPath: string): RootsInfo {
    const root = discoverResourceRoot(docPath, this.deps);
    const ecosystem = detectEcosystem(root);

    let discovered: string[];
    if (root === null) discovered = []; // single-file mode: overlay-only (added host-side)
    else if (ecosystem === 'gradle') discovered = gradleSourceSetRoots(root, this.deps);
    else discovered = [root]; // .NET single root, or a plain conventional tree

    // Merge configured roots (absolute or workspace-relative), appended after discovered roots,
    // de-duplicated while preserving order.
    const configured = (this.deps.getConfiguredRoots?.() ?? []).map((e) =>
      resolveConfiguredRoot(e, this.deps),
    );
    const roots: string[] = [];
    for (const r of [...discovered, ...configured]) {
      if (!roots.includes(r)) roots.push(r);
    }

    const { packageName, manifestTheme } = resolveManifest(root, ecosystem, this.deps);
    return { roots, packageName, manifestTheme, ecosystem };
  }
}
