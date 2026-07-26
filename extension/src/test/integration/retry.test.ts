import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HostManager } from '../../host';
import { PreviewConfig, RenderResponse } from '../../protocol';
import { RenderCause, RenderScheduler } from '../../scheduler';

/**
 * Fix-pack retry suite (POLISH-03, FP-1 AC3/AC4): proves the REAL `RenderScheduler` + `HostManager`
 * (a real child process speaking the real LSP-framed protocol, via the scripted `fake-host.js` — not
 * a mock) cooperate to ride out a single transient host-level failure with no error ever surfaced,
 * and still settle in failure after two consecutive failures. Each test spins up its own isolated
 * `HostManager` (same pattern as the chaos suite, T58) rather than sharing the extension's single
 * activation, so the crash scenario here can't affect any other integration suite.
 *
 * `lastApplied.status === 'ok'`-style outcomes are observed directly via the scheduler's own
 * `onResult`/`onHostError`/`onRetry` callbacks — the same calls `PreviewPanelManager.applyResult` /
 * `applyHostError` / `setBusy` (unit-tested in T64) would receive in the real extension, so this
 * proves the scheduler+host cooperation without needing a live webview panel.
 */
suite('Inflate fix-pack: automatic retry of a host-level failure (POLISH-03)', () => {
  const fakeHostScript = path.resolve(__dirname, '../../../src/test/fake-host.js');
  const fixtureDir = path.join(os.tmpdir(), 'inflate-retry-test', 'res', 'layout');
  const fixtureFile = path.join(fixtureDir, 'hello.xml');
  const markerDir = path.join(os.tmpdir(), 'inflate-retry-test-markers');
  const spawned: HostManager[] = [];

  suiteSetup(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(
      fixtureFile,
      '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />',
    );
  });

  suiteTeardown(() => {
    fs.rmSync(path.join(os.tmpdir(), 'inflate-retry-test'), { recursive: true, force: true });
    fs.rmSync(markerDir, { recursive: true, force: true });
  });

  teardown(async function () {
    this.timeout(30000);
    await Promise.all(spawned.splice(0).map((m) => m.dispose().catch(() => undefined)));
  });

  const CONFIG: PreviewConfig = {
    themeName: 'Theme.Material3.DayNight',
    isProjectTheme: false,
    night: false,
    device: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
    orientation: 'portrait',
    density: 'xhdpi',
    pixelScale: 1,
  };

  function makeHostManager(mode: string, extraArg?: string): HostManager {
    const m = new HostManager({
      command: process.execPath,
      args: extraArg ? [fakeHostScript, mode, extraArg] : [fakeHostScript, mode],
      initializeParams: {},
    });
    spawned.push(m);
    return m;
  }

  function makeScheduler(
    hostManager: HostManager,
    hooks: { onResult: (r: RenderResponse) => void; onHostError: (e: Error) => void; onRetry: (e: Error) => void; onDispatch: (c: RenderCause) => void },
  ): RenderScheduler {
    return new RenderScheduler({
      host: {
        render: (req) => hostManager.render(req),
        invalidate: (paths) => hostManager.invalidate({ paths }),
        ensureReady: () => hostManager.ensureReady(),
      },
      resolveRoots: () => ({ roots: [fixtureDir], packageName: 'com.example' }),
      classify: () => 'layout',
      getConfig: () => CONFIG,
      readBuffer: () => '',
      onResult: (_docPath, r) => hooks.onResult(r),
      onHostError: (_docPath, e) => hooks.onHostError(e),
      onRetry: (_docPath, e) => hooks.onRetry(e),
      onDispatch: (_docPath, c) => hooks.onDispatch(c),
    });
  }

  test('crash-on-first-render: settles ok with no error ever applied, and the failed attempt is observable (FP-1 AC3)', async function () {
    this.timeout(30000);
    const markerPath = path.join(markerDir, `crash-on-first-render-${Date.now()}.marker`);
    const hostManager = makeHostManager('crash-on-first-render', markerPath);

    const results: RenderResponse[] = [];
    const hostErrors: Error[] = [];
    const retries: Error[] = [];
    const dispatches: RenderCause[] = [];
    const scheduler = makeScheduler(hostManager, {
      onResult: (r) => results.push(r),
      onHostError: (e) => hostErrors.push(e),
      onRetry: (e) => retries.push(e),
      onDispatch: (c) => dispatches.push(c),
    });

    await hostManager.ensureReady();
    scheduler.requestRender(fixtureFile, 'reopen');
    await scheduler.settled(fixtureFile);

    // The failed (first) attempt never reached the panel as an error — it was suppressed and
    // retried; only the successful outcome was ever delivered.
    assert.strictEqual(hostErrors.length, 0, 'onHostError must never fire for a transient first failure');
    assert.strictEqual(results.length, 1, 'exactly one result delivered');
    assert.strictEqual(results[0].status, 'ok', 'the settled result is ok');

    // The suppressed failure is still observable (stands in for the output-channel log line).
    assert.strictEqual(retries.length, 1, 'the first failed attempt was logged/observed via onRetry');

    // Dispatched twice (the failed attempt + the retry), both under the same 'reopen' cause.
    assert.deepStrictEqual(dispatches, ['reopen', 'reopen']);

    assert.strictEqual(hostManager.getState(), 'ready', 'the host recovered and is ready');
  });

  test('crash-on-render: both the initial attempt and its retry fail, settling in a single host error (FP-1 AC4)', async function () {
    this.timeout(30000);
    const hostManager = makeHostManager('crash-on-render');

    const results: RenderResponse[] = [];
    const hostErrors: Error[] = [];
    const retries: Error[] = [];
    const dispatches: RenderCause[] = [];
    const scheduler = makeScheduler(hostManager, {
      onResult: (r) => results.push(r),
      onHostError: (e) => hostErrors.push(e),
      onRetry: (e) => retries.push(e),
      onDispatch: (c) => dispatches.push(c),
    });

    await hostManager.ensureReady();
    scheduler.requestRender(fixtureFile, 'reopen');
    await scheduler.settled(fixtureFile);

    // Exactly 2 attempts (the original + the one retry), then settled failure.
    assert.deepStrictEqual(dispatches, ['reopen', 'reopen']);
    assert.strictEqual(retries.length, 1, 'the first failure was logged before retrying');
    assert.strictEqual(results.length, 0, 'no ok/error result was ever delivered');
    assert.strictEqual(hostErrors.length, 1, 'onHostError fires exactly once, after the retry also fails');
  });
});
