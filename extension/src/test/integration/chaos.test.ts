import * as assert from 'assert';
import * as path from 'path';
import { HostManager } from '../../host';
import { RenderRequest } from '../../protocol';
import { ensureHostLaunchConfig, HOST_PACKAGE_NAME, HostLaunchConfig, isProcessAlive, realHostOptions, waitUntil } from './realHost';

/**
 * Chaos and robustness suite (T58, NFR-05, HOST-01/02/03, P1-I AC1-AC4). Every scenario here drives
 * the REAL JVM render host (not the scripted fake-host.js) — a fake can't fake a real process crash,
 * a real memory ceiling, or a real orphaned PID, and this suite's whole point is proving HostManager
 * (T17) actually recovers from and cleans up after a REAL one. Classpath assembly reuses
 * `writeCorpusClasspath` (see `./realHost.ts`), the same mechanism T54's corpus runner and T57's perf
 * harness use — "reuse the exact assembly, don't reinvent it" per the batch brief.
 *
 * Every scenario runs 3 consecutive times (Done-when: "no flake") via {@link repeat}.
 */
suite('Inflate chaos and robustness (T58)', () => {
  let launch: HostLaunchConfig;
  const spawned: HostManager[] = [];

  suiteSetup(function () {
    this.timeout(120000);
    launch = ensureHostLaunchConfig();
  });

  teardown(async function () {
    this.timeout(30000);
    await Promise.all(spawned.splice(0).map((m) => m.dispose().catch(() => undefined)));
  });

  function makeManager(opts: Parameters<typeof realHostOptions>[1] = {}): HostManager {
    const m = new HostManager(realHostOptions(launch, opts));
    spawned.push(m);
    return m;
  }

  function makeRequest(id: number, docPath: string, roots: string[], overrides: Partial<RenderRequest> = {}): RenderRequest {
    return {
      id,
      docPath,
      docKind: 'layout',
      roots,
      packageName: HOST_PACKAGE_NAME,
      config: {
        themeName: 'android:Theme.Material.NoActionBar',
        isProjectTheme: false,
        night: false,
        device: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
        orientation: 'portrait',
        density: 'xhdpi',
        pixelScale: 1,
      },
      timeoutMs: 15000,
      ...overrides,
    };
  }

  const galleryDoc = path.join(__dirname, '../../../../fixtures/galleries/framework/res/layout/framework_gallery.xml');
  const galleryRoots = [path.join(__dirname, '../../../../fixtures/galleries/framework/res')];
  const poisonDoc = path.join(__dirname, '../../../../fixtures/galleries/framework/res/layout/poison.xml');

  /** Runs [scenario] 3 consecutive times (Done-when: "pass repeatedly, 3 consecutive runs, no flake"). */
  async function repeat(scenario: () => Promise<void>): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await scenario();
    }
  }

  test('killing the host PID mid-render triggers auto-restart, and the next render recovers', async function () {
    this.timeout(60000);
    await repeat(async () => {
      const manager = makeManager({ backoffMs: [200, 400, 800] });
      await manager.ensureReady();

      const renderPromise = manager.render(makeRequest(1, galleryDoc, galleryRoots));
      const pid = manager.getChildPid();
      assert.ok(pid, 'expected a real child PID while rendering');
      process.kill(pid!, 'SIGKILL');

      await assert.rejects(renderPromise, 'a render whose host was killed mid-flight should reject');

      // "next save recovers automatically" (P1-I Independent Test): a subsequent render succeeds
      // once the auto-restart backoff has elapsed AND the respawned host has reached 'ready' —
      // not merely left 'crashed' (it transits crashed -> starting -> ready during the restart).
      await waitUntil(() => manager.getState() === 'ready', 15000);
      const recovered = await manager.render(makeRequest(2, galleryDoc, galleryRoots));
      assert.strictEqual(recovered.status, 'ok', `recovery render should succeed; error=${recovered.error?.message}`);
    });
  });

  test('a render that wedges past its timeout is killed and the host auto-restarts', async function () {
    this.timeout(60000);
    await repeat(async () => {
      // poison.xml (deeply nested weighted layout) reliably takes ~400-550ms to render (measured);
      // a 150ms renderTimeoutMs reliably wedges past it with wide margin, keeping the test itself
      // fast rather than waiting out the product's real 15s default.
      const manager = makeManager({ renderTimeoutMs: 150, backoffMs: [200, 400, 800] });
      await manager.ensureReady();
      const pidBefore = manager.getChildPid();

      await assert.rejects(
        manager.render(makeRequest(1, poisonDoc, galleryRoots)),
        /timed out/,
        'a wedged render should reject with a timeout error',
      );
      assert.strictEqual(manager.getState(), 'crashed', 'a timed-out render should move the host to crashed');

      await waitUntil(() => manager.getState() === 'ready', 15000);
      const pidAfter = manager.getChildPid();
      assert.notStrictEqual(pidAfter, pidBefore, 'auto-restart should have spawned a NEW child process');
      assert.ok(!isProcessAlive(pidBefore!), 'the wedged child should actually be dead (SIGKILL), not just abandoned');
    });
  });

  test('disposing the host (VS Code exit) leaves no orphan JVM process', async function () {
    this.timeout(60000);
    await repeat(async () => {
      const manager = makeManager();
      await manager.ensureReady();
      const pid = manager.getChildPid();
      assert.ok(pid && isProcessAlive(pid), 'expected a live child PID before dispose()');

      await manager.dispose();

      await waitUntil(() => !isProcessAlive(pid!), 10000);
      assert.ok(!isProcessAlive(pid!), 'the child process must be gone after dispose() (no orphan, NFR-05)');
      assert.strictEqual(manager.getState(), 'stopped');
    });
  });

  test('3 concurrently requested renders on one host all complete correctly, serialized (NFR-05)', async function () {
    this.timeout(60000);
    await repeat(async () => {
      const manager = makeManager();
      await manager.ensureReady();

      const requests = [1, 2, 3].map((id) => manager.render(makeRequest(id, galleryDoc, galleryRoots)));
      const results = await Promise.all(requests);

      results.forEach((r, i) => {
        assert.strictEqual(r.status, 'ok', `render ${i + 1} should succeed; error=${r.error?.message}`);
        assert.strictEqual(r.id, i + 1, `render ${i + 1} should echo back its own request id`);
      });
    });
  });

  test('a 4th crash within the rolling window surfaces manual-restart state; restart() recovers', async function () {
    this.timeout(90000);
    await repeat(async () => {
      const manager = makeManager({ backoffMs: [50, 50, 50], crashWindowMs: 60000, maxAutoRestarts: 3 });
      await manager.ensureReady();

      for (let crashNum = 1; crashNum <= 3; crashNum++) {
        const pid = manager.getChildPid();
        assert.ok(pid, `expected a child PID before crash #${crashNum}`);
        process.kill(pid!, 'SIGKILL');
        await waitUntil(() => manager.crashCount() === crashNum);
        await waitUntil(() => manager.getState() === 'ready' || manager.getState() === 'starting');
        await waitUntil(() => manager.getState() === 'ready', 15000);
      }

      // The 4th crash exceeds maxAutoRestarts (3) within the window: auto-restart stops.
      const pid = manager.getChildPid();
      process.kill(pid!, 'SIGKILL');
      await waitUntil(() => manager.needsManualRestart());
      assert.strictEqual(manager.getState(), 'crashed');
      await assert.rejects(manager.ensureReady(), /crashed too many times/i);

      // restart() recovers regardless of history (P1-I: manual restart action).
      await manager.restart();
      assert.strictEqual(manager.getState(), 'ready');
      assert.ok(!manager.needsManualRestart());
      const recovered = await manager.render(makeRequest(99, galleryDoc, galleryRoots));
      assert.strictEqual(recovered.status, 'ok');
    });
  });

  test('a tiny -Xmx heap crash names the inflate.hostMaxHeap setting in the surfaced error', async function () {
    this.timeout(60000);
    await repeat(async () => {
      // 8m reliably OOMs the JVM within its own classpath-scanning startup (~150ms, measured) —
      // well before Bridge init even begins — so this exercises the startup-failure path rather
      // than a post-ready crash; either way the surfaced error must name the heap setting.
      const manager = makeManager({ maxHeapMb: 8 });
      await assert.rejects(manager.ensureReady(), (err: Error) => {
        assert.ok(err.message.includes('OutOfMemoryError'), `expected an OutOfMemoryError mention, got: ${err.message}`);
        assert.ok(err.message.includes('inflate.hostMaxHeap'), `expected the heap setting to be named, got: ${err.message}`);
        return true;
      });
    });
  });
});
