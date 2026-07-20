/**
 * Unit tests for the corpus diff/report logic (T54 Done-when: "diff threshold logic, report
 * generation, golden-update flow, on tiny synthetic images"). These never spawn the real host —
 * that path is exercised by `npm run render` against the real corpus (T54 AC2) and by host-side
 * engineTest. Assertions target NFR-07's spec-defined behaviour: a diff beyond the anti-aliasing
 * tolerance fails the build; a diff within tolerance (or no golden yet) does not.
 */
import { PNG } from 'pngjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { comparePngs, renderHtmlReport, updateGolden } from './src/diff';

function writeSolidPng(filePath: string, width: number, height: number, rgb: [number, number, number]): void {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

/** A mostly-solid image with [diffPixelCount] pixels flipped to a very different colour — lets tests
 * pick an exact diffRatio (16x16 = 256 total pixels). */
function writeMostlySolidPng(filePath: string, diffPixelCount: number): void {
  const width = 16;
  const height = 16;
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const idx = i << 2;
    const flip = i < diffPixelCount;
    png.data[idx] = flip ? 255 : 10;
    png.data[idx + 1] = flip ? 0 : 10;
    png.data[idx + 2] = flip ? 0 : 10;
    png.data[idx + 3] = 255;
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

describe('comparePngs', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-corpus-diff-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports goldenMissing (not a failure) when no golden exists yet', () => {
    const actual = path.join(dir, 'actual.png');
    writeSolidPng(actual, 8, 8, [0, 0, 0]);
    const result = comparePngs(actual, path.join(dir, 'does-not-exist.png'));
    expect(result.goldenMissing).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('passes on pixel-identical images (diffRatio 0)', () => {
    const actual = path.join(dir, 'actual.png');
    const golden = path.join(dir, 'golden.png');
    writeSolidPng(actual, 8, 8, [100, 150, 200]);
    writeSolidPng(golden, 8, 8, [100, 150, 200]);
    const result = comparePngs(actual, golden);
    expect(result.diffPixels).toBe(0);
    expect(result.diffRatio).toBe(0);
    expect(result.pass).toBe(true);
  });

  it('fails immediately on a width/height mismatch, regardless of tolerance', () => {
    const actual = path.join(dir, 'actual.png');
    const golden = path.join(dir, 'golden.png');
    writeSolidPng(actual, 8, 8, [0, 0, 0]);
    writeSolidPng(golden, 16, 16, [0, 0, 0]);
    const result = comparePngs(actual, golden, { maxDiffRatio: 1 });
    expect(result.sizeMatches).toBe(false);
    expect(result.pass).toBe(false);
  });

  it('passes when the differing-pixel ratio is within maxDiffRatio (AA tolerance)', () => {
    const actual = path.join(dir, 'actual.png');
    const golden = path.join(dir, 'golden.png');
    // 256 total px; flip 2 (~0.78%) — within a 1% tolerance.
    writeMostlySolidPng(golden, 0);
    writeMostlySolidPng(actual, 2);
    const result = comparePngs(actual, golden, { maxDiffRatio: 0.01 });
    expect(result.diffPixels).toBe(2);
    expect(result.diffRatio).toBeCloseTo(2 / 256, 5);
    expect(result.pass).toBe(true);
  });

  it('fails when the differing-pixel ratio exceeds maxDiffRatio (real regression)', () => {
    const actual = path.join(dir, 'actual.png');
    const golden = path.join(dir, 'golden.png');
    // 256 total px; flip 64 (25%) — well beyond a 1% tolerance, a genuine visual regression.
    writeMostlySolidPng(golden, 0);
    writeMostlySolidPng(actual, 64);
    const result = comparePngs(actual, golden, { maxDiffRatio: 0.01 });
    expect(result.diffRatio).toBeGreaterThan(0.01);
    expect(result.pass).toBe(false);
    expect(result.diffPngBuffer).toBeDefined();
  });
});

describe('updateGolden', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-corpus-update-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('copies the actual PNG bytes to the golden path, creating parent dirs', () => {
    const actual = path.join(dir, 'actual.png');
    const golden = path.join(dir, 'nested', 'sub', 'golden.png');
    writeSolidPng(actual, 4, 4, [9, 9, 9]);

    updateGolden(actual, golden);

    expect(fs.existsSync(golden)).toBe(true);
    expect(fs.readFileSync(golden).equals(fs.readFileSync(actual))).toBe(true);
  });

  it('a subsequent comparePngs against the just-updated golden passes (round trip)', () => {
    const actual = path.join(dir, 'actual.png');
    const golden = path.join(dir, 'golden.png');
    writeSolidPng(actual, 4, 4, [9, 9, 9]);
    updateGolden(actual, golden);

    const result = comparePngs(actual, golden);
    expect(result.goldenMissing).toBe(false);
    expect(result.pass).toBe(true);
  });
});

describe('renderHtmlReport', () => {
  it('summarises pass/fail counts and marks each row PASS/FAIL/ERROR correctly', () => {
    const html = renderHtmlReport([
      {
        fixtureId: 'gradle/main',
        configId: 'default',
        status: 'ok',
        diff: { goldenMissing: false, diffPixels: 0, totalPixels: 100, diffRatio: 0, sizeMatches: true, pass: true },
        goldenPngPath: '/tmp/golden-a.png',
      },
      {
        fixtureId: 'dotnet/main',
        configId: 'night',
        status: 'ok',
        diff: { goldenMissing: false, diffPixels: 50, totalPixels: 100, diffRatio: 0.5, sizeMatches: true, pass: false },
        goldenPngPath: '/tmp/golden-b.png',
      },
      {
        fixtureId: 'gallery/broken',
        configId: 'default',
        status: 'error',
        errorMessage: 'render timed out',
        goldenPngPath: '/tmp/golden-c.png',
      },
    ]);

    expect(html).toContain('1 passed, 2 failed/errored, 3 total.');
    expect(html).toContain('gradle/main');
    expect(html).toContain('PASS');
    expect(html).toContain('FAIL');
    expect(html).toContain('ERROR');
    expect(html).toContain('render timed out');
  });
});
