/**
 * DocumentClassifier (T33, design component #2, UX-01). Decides a document's {@link DocKind} —
 * `layout | drawableXml | ninePatch | color` — or reports it `unsupported`, first by a path
 * heuristic (`…/(res|resources)/<type>[-quals]/…`, `.xml|.axml|.9.png`, case-insensitive) and,
 * when the path is inconclusive, by a root-element sniff of the first bytes of the file.
 *
 * The eligibility constants below are the single source of truth mirrored from
 * `shared/eligibility.json` and the host's `preprocess/Eligibility.kt`. The guard test
 * (`classifier.test.ts`) asserts this object is value-identical to `shared/eligibility.json`, and a
 * matching guard on the Kotlin side keeps all three in lock-step (drift fails a build gate).
 */

import * as path from 'path';

/** Eligibility constants — MIRRORS `shared/eligibility.json` (guarded by classifier.test.ts). */
export const ELIGIBILITY = {
  resourceTypeDirs: [
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
  ],
  layoutTypeDirs: ['layout'],
  drawableTypeDirs: ['drawable', 'mipmap'],
  colorTypeDirs: ['color'],
  drawableRootElements: [
    'adaptive-icon',
    'animated-selector',
    'animated-vector',
    'animation-list',
    'bitmap',
    'clip',
    'inset',
    'layer-list',
    'level-list',
    'ripple',
    'rotate',
    'scale',
    'selector',
    'shape',
    'transition',
    'vector',
  ],
  eligibleExtensions: ['.9.png', '.axml', '.xml'],
} as const;

/** The four previewable document kinds (mirrors the protocol `DocKind`) plus `unsupported`. */
export type Classification =
  | { kind: 'layout' }
  | { kind: 'drawableXml' }
  | { kind: 'ninePatch' }
  | { kind: 'color' }
  | { kind: 'unsupported'; reason: string };

const RES_TYPE_DIR = /\/(?:res|resources)\/([a-z0-9]+)(?:-[a-z0-9-]+)?\//;

/** The resource-type dir base (before any `-qualifier`) for `uri`, lower-cased, or null. */
function resourceTypeDirOf(lowerUri: string): string | null {
  return RES_TYPE_DIR.exec(lowerUri)?.[1] ?? null;
}

/** First XML element name (lower-cased) of `content`, skipping the prolog/comments, or null. */
export function firstRootElement(content: string): string | null {
  const stripped = content.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  return /<([A-Za-z_][\w.\-]*)/.exec(stripped)?.[1]?.toLowerCase() ?? null;
}

/**
 * Classify `uri` (a file path/URI). `firstKb` — the first bytes of the file — is consulted only
 * when the path heuristic is inconclusive (a `<vector>` under a non-standard dir, or a file outside
 * any resource tree). Path evidence always wins over the sniff (a `<selector>` under `color/` is a
 * color state list, under `drawable/` a state-list drawable).
 */
export function classify(uri: string, firstKb?: string): Classification {
  const lower = uri.replace(/\\/g, '/').toLowerCase();

  // Nine-patch is decided purely by the compound `.9.png` extension.
  if (lower.endsWith('.9.png')) return { kind: 'ninePatch' };

  const ext = path.extname(lower);
  if (ext !== '.xml' && ext !== '.axml') {
    return { kind: 'unsupported', reason: `extension '${ext || '(none)'}' is not previewable` };
  }

  const typeDir = resourceTypeDirOf(lower);
  if (typeDir) {
    if ((ELIGIBILITY.layoutTypeDirs as readonly string[]).includes(typeDir)) return { kind: 'layout' };
    if ((ELIGIBILITY.drawableTypeDirs as readonly string[]).includes(typeDir)) return { kind: 'drawableXml' };
    if ((ELIGIBILITY.colorTypeDirs as readonly string[]).includes(typeDir)) return { kind: 'color' };
    if ((ELIGIBILITY.resourceTypeDirs as readonly string[]).includes(typeDir)) {
      return { kind: 'unsupported', reason: `resource type '${typeDir}' is not previewable` };
    }
    // A dir that isn't a known resource type falls through to the root-element sniff.
  }

  const root = firstKb ? firstRootElement(firstKb) : null;
  if (root) {
    if ((ELIGIBILITY.drawableRootElements as readonly string[]).includes(root)) return { kind: 'drawableXml' };
    // Everything else (a `<layout>`/`<merge>` root, a framework view group/widget, or a custom
    // dotted view class) is a layout.
    return { kind: 'layout' };
  }

  return {
    kind: 'unsupported',
    reason: 'not under a resource type directory and no recognizable root element',
  };
}

/** True when `c` is a previewable kind (drives the `inflate:eligibleDocument` context key). */
export function isEligible(c: Classification): boolean {
  return c.kind !== 'unsupported';
}
