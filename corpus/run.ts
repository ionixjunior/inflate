#!/usr/bin/env node
/**
 * Golden-image corpus runner (T54, NFR-07). Spawns the real Inflate render host standalone (over
 * the real LSP protocol — see `corpus/src/hostClient.ts`), renders every fixture x config in
 * `corpus/manifest.json`, diffs each PNG against its checked-in golden with pixelmatch, writes an
 * HTML report to `corpus/report.html`, and exits non-zero if anything failed/errored.
 *
 * Usage: `npm run render` (from corpus/) or `npm run corpus` (repo root) — see root package.json.
 *        `npm run render:update` (or `--update-goldens`) regenerates every golden from the current
 *        render instead of diffing against it — use after an intentional, reviewed visual change.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { comparePngs, FixtureRunResult, renderHtmlReport, updateGolden } from './src/diff';
import { ensureHostLaunchConfig, HOST_PACKAGE_NAME, HostClient, REPO_ROOT } from './src/hostClient';

interface DevicePresetLike {
  id: string;
  label: string;
  widthDp: number;
  heightDp: number;
  defaultDensity: string;
  sizeBucket: 'normal' | 'large' | 'xlarge';
}

// Mirrors extension/src/config.ts's DEVICE_PRESETS (kept as a small literal here since corpus is a
// standalone package with no build-time dependency on the extension) plus a "drawable" canvas preset
// for docKind drawable/color/ninePatch renders (DRW rendering doesn't use the full device canvas, but
// PreviewConfig.device is still a required field on the wire).
const DEVICE_PRESETS: Record<string, DevicePresetLike> = {
  small: { id: 'small', label: 'Small phone', widthDp: 360, heightDp: 640, defaultDensity: 'hdpi', sizeBucket: 'normal' },
  phone: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
  large: { id: 'large', label: 'Large phone', widthDp: 480, heightDp: 1040, defaultDensity: 'xxhdpi', sizeBucket: 'normal' },
  tablet7: { id: 'tablet7', label: '7" Tablet', widthDp: 600, heightDp: 1024, defaultDensity: 'xhdpi', sizeBucket: 'large' },
  tablet10: { id: 'tablet10', label: '10" Tablet', widthDp: 800, heightDp: 1280, defaultDensity: 'xhdpi', sizeBucket: 'xlarge' },
  drawable: { id: 'drawable', label: 'Drawable canvas', widthDp: 411, heightDp: 891, defaultDensity: 'mdpi', sizeBucket: 'normal' },
};

interface FixtureConfigSpec {
  id: string;
  theme: string;
  night: boolean;
  device: string;
  density: string;
  orientation: 'portrait' | 'landscape';
  tolerance?: number;
}

interface FixtureSpec {
  id: string;
  ecosystem: 'gradle' | 'dotnet';
  kind: 'layout' | 'drawable' | 'color' | 'ninePatch';
  docPath: string;
  roots: string[];
  goldenDir: string;
  configs: FixtureConfigSpec[];
}

interface Manifest {
  fixtures: FixtureSpec[];
}

function docKindOf(kind: FixtureSpec['kind']): string {
  switch (kind) {
    case 'layout':
      return 'layout';
    case 'drawable':
      return 'drawableXml';
    case 'color':
      return 'color';
    case 'ninePatch':
      return 'ninePatch';
  }
}

function goldenPath(fixture: FixtureSpec, configId: string): string {
  const safeId = fixture.id.replace(/\//g, '-');
  return path.join(REPO_ROOT, fixture.goldenDir, 'golden', `${safeId}__${configId}.png`);
}

async function main(): Promise<void> {
  const updateGoldens = process.argv.includes('--update-goldens');
  const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

  console.log(`[corpus] assembling real-host classpath (./gradlew writeCorpusClasspath)...`);
  const launch = ensureHostLaunchConfig();
  console.log(`[corpus] classpath ready: ${launch.classpath.length} entries, ${launch.libraryPackages.length} bundled library packages.`);

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-corpus-out-'));
  const overlayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-corpus-overlay-'));

  const client = new HostClient(launch);
  client.start();
  console.log(`[corpus] host spawned (pid=${client.pid}); sending initialize + warmup...`);
  await client.initialize({ outputDir, overlayDir });
  await client.warmup();
  console.log('[corpus] host ready; rendering fixtures...');

  const results: FixtureRunResult[] = [];
  let idSeq = 0;

  for (const fixture of manifest.fixtures) {
    const docPath = path.join(REPO_ROOT, fixture.docPath);
    const roots = fixture.roots.map((r) => path.join(REPO_ROOT, r));

    for (const cfg of fixture.configs) {
      const device = DEVICE_PRESETS[cfg.device] ?? DEVICE_PRESETS.phone;
      const golden = goldenPath(fixture, cfg.id);
      idSeq += 1;

      const req = {
        id: idSeq,
        docPath,
        docKind: docKindOf(fixture.kind),
        roots,
        packageName: HOST_PACKAGE_NAME,
        config: {
          themeName: cfg.theme,
          isProjectTheme: false,
          night: cfg.night,
          device,
          orientation: cfg.orientation,
          density: cfg.density,
          pixelScale: 1,
          drawable: fixture.kind === 'layout' ? undefined : { states: [], sizeDp: null },
        },
        timeoutMs: 15000,
      };

      try {
        const response = await client.request<{
          status: 'ok' | 'error';
          pngPath?: string;
          error?: { message: string };
        }>('render', req);

        if (response.status !== 'ok' || !response.pngPath) {
          results.push({
            fixtureId: fixture.id,
            configId: cfg.id,
            status: 'error',
            errorMessage: response.error?.message ?? 'render returned non-ok status with no error message',
            goldenPngPath: golden,
          });
          console.error(`[corpus] FAIL  ${fixture.id} :: ${cfg.id} -> ${response.error?.message}`);
          continue;
        }

        if (updateGoldens) {
          updateGolden(response.pngPath, golden);
          results.push({ fixtureId: fixture.id, configId: cfg.id, status: 'ok', actualPngPath: response.pngPath, goldenPngPath: golden });
          console.log(`[corpus] updated golden for ${fixture.id} :: ${cfg.id}`);
          continue;
        }

        const diff = comparePngs(response.pngPath, golden, { maxDiffRatio: cfg.tolerance ?? 0.01 });
        let diffPngPath: string | undefined;
        if (diff.diffPngBuffer) {
          diffPngPath = path.join(outputDir, `${fixture.id.replace(/\//g, '-')}__${cfg.id}.diff.png`);
          fs.writeFileSync(diffPngPath, diff.diffPngBuffer);
        }
        results.push({
          fixtureId: fixture.id,
          configId: cfg.id,
          status: 'ok',
          diff,
          actualPngPath: response.pngPath,
          goldenPngPath: golden,
          diffPngPath,
        });
        console.log(
          `[corpus] ${diff.pass ? 'PASS' : 'FAIL'}  ${fixture.id} :: ${cfg.id}` +
            (diff.goldenMissing ? ' (golden generated)' : ` (${(diff.diffRatio * 100).toFixed(3)}% diff)`),
        );
      } catch (e) {
        results.push({
          fixtureId: fixture.id,
          configId: cfg.id,
          status: 'error',
          errorMessage: (e as Error).message,
          goldenPngPath: golden,
        });
        console.error(`[corpus] ERROR ${fixture.id} :: ${cfg.id} -> ${(e as Error).message}`);
      }
    }
  }

  await client.shutdown();
  client.kill();

  const reportPath = path.join(__dirname, 'report.html');
  fs.writeFileSync(reportPath, renderHtmlReport(results));
  console.log(`[corpus] report written to ${reportPath}`);

  const failed = results.filter((r) => r.status === 'error' || (r.diff && !r.diff.pass));
  console.log(`[corpus] ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length > 0 && !updateGoldens) {
    console.error(`[corpus] ${failed.length} fixture(s) failed — see ${reportPath}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[corpus] fatal error:', e);
  process.exitCode = 1;
});
