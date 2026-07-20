/**
 * Golden-image diffing (T54, NFR-07). Pure, host-independent logic so it can be unit-tested against
 * tiny synthetic PNGs: compare a rendered PNG to a checked-in golden with `pixelmatch` (an
 * anti-aliasing-aware threshold — layoutlib's software rasteriser is deterministic per pinned
 * engine version, but AA edges can differ by a pixel or two across JDK/OS point releases), decide
 * pass/fail against a per-fixture tolerance, and render an HTML diff report.
 */

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import * as fs from 'fs';
import * as path from 'path';

export interface DiffResult {
  /** True when the golden didn't exist yet (first run / --update-goldens) — never a failure. */
  goldenMissing: boolean;
  /** Number of pixels pixelmatch flagged as different (0 when dimensions mismatch or golden missing). */
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  /** Whether width/height matched the golden (a size mismatch always fails, regardless of tolerance). */
  sizeMatches: boolean;
  pass: boolean;
  diffPngBuffer?: Buffer;
}

/** Compares [actualPngPath] against [goldenPngPath] using pixelmatch's `threshold` (per-pixel colour
 * delta sensitivity, 0-1) and a [maxDiffRatio] (fraction of differing pixels tolerated — covers
 * anti-aliasing jitter across otherwise-identical renders). */
export function comparePngs(
  actualPngPath: string,
  goldenPngPath: string,
  opts: { threshold?: number; maxDiffRatio?: number } = {},
): DiffResult {
  const threshold = opts.threshold ?? 0.1;
  const maxDiffRatio = opts.maxDiffRatio ?? 0.01;

  if (!fs.existsSync(goldenPngPath)) {
    return { goldenMissing: true, diffPixels: 0, totalPixels: 0, diffRatio: 0, sizeMatches: true, pass: true };
  }

  const actual = PNG.sync.read(fs.readFileSync(actualPngPath));
  const golden = PNG.sync.read(fs.readFileSync(goldenPngPath));

  if (actual.width !== golden.width || actual.height !== golden.height) {
    return {
      goldenMissing: false,
      diffPixels: Math.max(actual.width * actual.height, golden.width * golden.height),
      totalPixels: Math.max(actual.width * actual.height, golden.width * golden.height),
      diffRatio: 1,
      sizeMatches: false,
      pass: false,
    };
  }

  const { width, height } = actual;
  const diffPng = new PNG({ width, height });
  const diffPixels = pixelmatch(actual.data, golden.data, diffPng.data, width, height, { threshold });
  const totalPixels = width * height;
  const diffRatio = totalPixels === 0 ? 0 : diffPixels / totalPixels;

  return {
    goldenMissing: false,
    diffPixels,
    totalPixels,
    diffRatio,
    sizeMatches: true,
    pass: diffRatio <= maxDiffRatio,
    diffPngBuffer: diffRatio > 0 ? PNG.sync.write(diffPng) : undefined,
  };
}

/** Writes [actualPngPath]'s bytes to [goldenPngPath] (the `--update-goldens` flow), creating parent
 * directories as needed. */
export function updateGolden(actualPngPath: string, goldenPngPath: string): void {
  fs.mkdirSync(path.dirname(goldenPngPath), { recursive: true });
  fs.copyFileSync(actualPngPath, goldenPngPath);
}

export interface FixtureRunResult {
  fixtureId: string;
  configId: string;
  status: 'ok' | 'error';
  errorMessage?: string;
  diff?: DiffResult;
  actualPngPath?: string;
  goldenPngPath: string;
  diffPngPath?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Renders an HTML diff report (T54 "Done when": report generation) — one row per fixture x config,
 * a status badge, and (when available) inline actual/golden/diff thumbnails via `file://` URIs. */
export function renderHtmlReport(results: FixtureRunResult[]): string {
  const passCount = results.filter((r) => r.status === 'ok' && (r.diff?.pass ?? false)).length;
  const failCount = results.length - passCount;
  const rows = results
    .map((r) => {
      const badge = r.status === 'error' ? 'ERROR' : r.diff?.pass ? 'PASS' : 'FAIL';
      const badgeClass = badge === 'PASS' ? 'pass' : badge === 'ERROR' ? 'error' : 'fail';
      const detail =
        r.status === 'error'
          ? escapeHtml(r.errorMessage ?? 'unknown error')
          : r.diff?.goldenMissing
            ? 'golden generated (first run)'
            : `${r.diff?.diffPixels ?? 0} / ${r.diff?.totalPixels ?? 0} px (${((r.diff?.diffRatio ?? 0) * 100).toFixed(3)}%)`;
      const images = [
        r.actualPngPath ? `<img src="file://${r.actualPngPath}" alt="actual" />` : '',
        fs_existsForReport(r.goldenPngPath) ? `<img src="file://${r.goldenPngPath}" alt="golden" />` : '',
        r.diffPngPath ? `<img src="file://${r.diffPngPath}" alt="diff" />` : '',
      ].join('');
      return `<tr class="${badgeClass}"><td>${escapeHtml(r.fixtureId)}</td><td>${escapeHtml(r.configId)}</td><td class="badge">${badge}</td><td>${detail}</td><td class="imgs">${images}</td></tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Inflate golden-image corpus report</title>
<style>
body { font-family: -apple-system, sans-serif; margin: 2rem; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; vertical-align: top; }
tr.pass { background: #eaffea; }
tr.fail { background: #ffecec; }
tr.error { background: #fff3cd; }
.badge { font-weight: bold; }
.imgs img { max-width: 160px; margin-right: 4px; border: 1px solid #999; }
h1 { font-size: 1.4rem; }
</style></head>
<body>
<h1>Inflate golden-image corpus report</h1>
<p>${passCount} passed, ${failCount} failed/errored, ${results.length} total.</p>
<table>
<thead><tr><th>Fixture</th><th>Config</th><th>Status</th><th>Detail</th><th>Images</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body></html>
`;
}

function fs_existsForReport(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
