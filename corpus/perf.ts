#!/usr/bin/env node
/**
 * Performance measurement harness (T57, NFR-01). Spawns the REAL render host standalone (same
 * mechanism as `corpus/run.ts` — see `corpus/src/hostClient.ts`) and measures, against the corpus:
 *
 *  - cold start: host spawn -> `initialize`+`warmup` resolved (design's "host pre-warms on
 *    activation" path; NFR-01 target <=5s, max 10s)
 *  - warm layout render p90 (NFR-01 <=700ms, <=300 views)
 *  - warm drawable render p90 (NFR-01 <=400ms)
 *  - save->update p90 proxy: a render round-trip on an already-open document, client-perceived
 *    (request sent -> response received) — the honest end-to-end number available without a full
 *    VS Code integration harness; the extension adds no further debounce before dispatching (T36/
 *    scheduler.ts has no artificial delay), so this IS the save->update latency modulo VS Code's own
 *    save-event dispatch (sub-millisecond, not host-side)
 *  - day/night warm toggle (success criterion: <1s)
 *
 * p90 is computed over repeated warm renders of the SAME document/config after the first (which
 * pays session-rebuild cost) — i.e. exactly the steady-state hot-reload loop NFR-01 describes.
 *
 * Prints a Markdown table (also the source for docs/performance.md's measured numbers) and exits
 * non-zero if any measured p90 breaches its NFR-01 target, so `npm run perf` doubles as a gate.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureHostLaunchConfig, HOST_PACKAGE_NAME, HostClient, HostLaunchConfig, REPO_ROOT } from './src/hostClient';

const PHONE = { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' as const };

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function measureColdStart(launch: HostLaunchConfig): Promise<number> {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-perf-cold-out-'));
  const overlayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-perf-cold-overlay-'));
  const client = new HostClient(launch);
  const start = Date.now();
  client.start();
  await client.initialize({ outputDir, overlayDir });
  await client.warmup();
  const elapsed = Date.now() - start;
  await client.shutdown();
  client.kill();
  return elapsed;
}

interface TimedRun {
  clientMs: number;
  hostTotalMs: number;
}

async function timedRenders(
  client: HostClient,
  buildReq: (id: number) => Record<string, unknown>,
  count: number,
): Promise<TimedRun[]> {
  const out: TimedRun[] = [];
  for (let i = 0; i < count; i++) {
    const req = buildReq(1000 + i);
    const start = Date.now();
    const response = await client.request<{ status: string; timings: { totalMs: number }; error?: { message: string } }>('render', req);
    const clientMs = Date.now() - start;
    if (response.status !== 'ok') throw new Error(`render failed: ${response.error?.message}`);
    out.push({ clientMs, hostTotalMs: response.timings.totalMs });
  }
  return out;
}

async function main(): Promise<void> {
  console.log('[perf] assembling real-host classpath...');
  const launch = ensureHostLaunchConfig();

  console.log('[perf] measuring cold start (fresh JVM spawn -> initialize+warmup)...');
  const coldStartMs = await measureColdStart(launch);
  console.log(`[perf] cold start: ${coldStartMs}ms`);

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-perf-out-'));
  const overlayDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-perf-overlay-'));
  const client = new HostClient(launch);
  client.start();
  await client.initialize({ outputDir, overlayDir });
  await client.warmup();

  const layoutDoc = path.join(REPO_ROOT, 'fixtures/gradle-sample/app/src/main/res/layout/main.xml');
  const layoutRoots = [path.join(REPO_ROOT, 'fixtures/gradle-sample/app/src/main/res')];
  const drawableDoc = path.join(REPO_ROOT, 'fixtures/galleries/drawables/res/drawable/shape_rectangle.xml');
  const drawableRoots = [path.join(REPO_ROOT, 'fixtures/galleries/drawables/res')];

  const layoutConfig = (night: boolean) => ({
    themeName: 'Theme.Material3.DayNight',
    isProjectTheme: false,
    night,
    device: PHONE,
    orientation: 'portrait',
    density: 'xhdpi',
    pixelScale: 1,
  });

  const layoutReq = (id: number) => ({
    id,
    docPath: layoutDoc,
    docKind: 'layout',
    roots: layoutRoots,
    packageName: HOST_PACKAGE_NAME,
    config: layoutConfig(false),
    timeoutMs: 15000,
  });

  const drawableReq = (id: number) => ({
    id,
    docPath: drawableDoc,
    docKind: 'drawableXml',
    roots: drawableRoots,
    packageName: HOST_PACKAGE_NAME,
    config: { ...layoutConfig(false), theme: undefined, drawable: { states: [], sizeDp: null } },
    timeoutMs: 15000,
  });

  // Pay the one-time session-rebuild cost before measuring steady-state (NFR-01 describes the
  // *warm* hot-reload loop; the first render of a newly opened document is the "cold" scenario above).
  await client.request('render', layoutReq(1));
  console.log('[perf] measuring warm layout renders (n=20)...');
  const layoutRuns = await timedRenders(client, layoutReq, 20);

  await client.request('render', drawableReq(2));
  console.log('[perf] measuring warm drawable renders (n=20)...');
  const drawableRuns = await timedRenders(client, drawableReq, 20);

  console.log('[perf] measuring save->update proxy (warm layout round-trip, n=20)...');
  const saveUpdateRuns = await timedRenders(client, layoutReq, 20);

  console.log('[perf] measuring day/night warm toggle (n=10 each)...');
  const dayRuns: number[] = [];
  const nightRuns: number[] = [];
  for (let i = 0; i < 10; i++) {
    let start = Date.now();
    await client.request('render', { ...layoutReq(3000 + i), config: layoutConfig(true) });
    nightRuns.push(Date.now() - start);
    start = Date.now();
    await client.request('render', { ...layoutReq(4000 + i), config: layoutConfig(false) });
    dayRuns.push(Date.now() - start);
  }

  await client.shutdown();
  client.kill();

  const layoutClientMs = layoutRuns.map((r) => r.clientMs);
  const drawableClientMs = drawableRuns.map((r) => r.clientMs);
  const saveUpdateClientMs = saveUpdateRuns.map((r) => r.clientMs);

  const results = {
    coldStartMs,
    layoutP90: percentile(layoutClientMs, 90),
    layoutSamples: layoutClientMs,
    drawableP90: percentile(drawableClientMs, 90),
    drawableSamples: drawableClientMs,
    saveUpdateP90: percentile(saveUpdateClientMs, 90),
    dayNightP90: percentile([...dayRuns, ...nightRuns], 90),
    dayRuns,
    nightRuns,
  };

  console.log('\n## Measured performance (T57, NFR-01)\n');
  console.log('| Metric | p90 | Target | Result |');
  console.log('| ------ | --- | ------ | ------ |');
  const row = (name: string, p90: number, target: number, unit = 'ms') => {
    const pass = p90 <= target;
    console.log(`| ${name} | ${p90}${unit} | <= ${target}${unit} | ${pass ? 'PASS' : 'FAIL'} |`);
    return pass;
  };
  const allPass = [
    row('Cold start', coldStartMs, 10000),
    row('Warm layout render (p90)', results.layoutP90, 700),
    row('Warm drawable render (p90)', results.drawableP90, 400),
    row('Save -> update (p90, proxy)', results.saveUpdateP90, 1000),
    row('Day/night warm toggle (p90)', results.dayNightP90, 1000),
  ].every(Boolean);

  console.log(`\nRaw samples — layout(ms): [${layoutClientMs.join(', ')}]`);
  console.log(`Raw samples — drawable(ms): [${drawableClientMs.join(', ')}]`);
  console.log(`Raw samples — day(ms): [${dayRuns.join(', ')}]  night(ms): [${nightRuns.join(', ')}]`);

  if (!allPass) {
    console.error('\n[perf] one or more NFR-01 targets were missed.');
    process.exitCode = 1;
  } else {
    console.log('\n[perf] all NFR-01 targets met.');
  }
}

main().catch((e) => {
  console.error('[perf] fatal error:', e);
  process.exitCode = 1;
});
