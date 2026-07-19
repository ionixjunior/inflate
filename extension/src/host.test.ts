import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { HostManager, IllegalStateError, RenderTimeoutError, SpawnFn, buildJavaCommand } from './host';
import { RenderRequest } from './protocol';

const FAKE_HOST = path.join(__dirname, 'test', 'fake-host.js');

function makeRequest(id: number): RenderRequest {
  return {
    id,
    docPath: '/tmp/a.xml',
    docKind: 'layout',
    roots: [],
    packageName: 'com.inflate.preview',
    config: {
      themeName: 'Theme.Material3.DayNight',
      isProjectTheme: false,
      night: false,
      device: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
      orientation: 'portrait',
      density: 'xhdpi',
      pixelScale: 1,
    },
    timeoutMs: 15000,
  };
}

/** Polls [predicate] until it's true or [timeoutMs] elapses, throwing on timeout. */
async function waitUntil(predicate: () => boolean, timeoutMs = 5000, intervalMs = 10): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitUntil: timed out');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('HostManager (T17) — lifecycle state machine against a real fake-host child process', () => {
  const managers: HostManager[] = [];
  const spawnedChildren: ChildProcess[] = [];

  function makeManager(mode: string, overrides: Partial<ConstructorParameters<typeof HostManager>[0]> = {}): HostManager {
    const trackingSpawn: SpawnFn = (command, args, options) => {
      const child = spawn(command, args, options ?? {});
      spawnedChildren.push(child);
      return child;
    };
    const manager = new HostManager({
      command: 'node',
      args: [FAKE_HOST, mode],
      backoffMs: [5, 10, 15],
      spawnFn: trackingSpawn,
      ...overrides,
    });
    managers.push(manager);
    return manager;
  }

  afterEach(async () => {
    await Promise.all(managers.map((m) => m.dispose().catch(() => undefined)));
    managers.length = 0;
    spawnedChildren.length = 0;
  });

  it('follows the legal transition sequence stopped -> starting -> ready -> rendering -> ready', async () => {
    const manager = makeManager('normal');
    const seen: string[] = [];
    manager.onStateChange((s) => seen.push(s));

    expect(manager.getState()).toBe('stopped');
    await manager.ensureReady();
    expect(manager.getState()).toBe('ready');

    const renderPromise = manager.render(makeRequest(1));
    // 'rendering' is entered synchronously before the awaited response arrives.
    expect(seen).toContain('rendering');
    const response = await renderPromise;

    expect(response.status).toBe('ok');
    expect(manager.getState()).toBe('ready');
    expect(seen).toEqual(['starting', 'ready', 'rendering', 'ready']);
  });

  it('rejects render() when the state is not ready (illegal dispatch)', async () => {
    const manager = makeManager('normal');
    expect(manager.getState()).toBe('stopped');

    await expect(manager.render(makeRequest(1))).rejects.toBeInstanceOf(IllegalStateError);

    await manager.ensureReady();
    // A second concurrent render while the first is in flight must also be rejected (state is
    // 'rendering', not 'ready') — render() is gated only from 'ready'.
    const first = manager.render(makeRequest(1));
    await expect(manager.render(makeRequest(2))).rejects.toBeInstanceOf(IllegalStateError);
    await first;
  });

  it('kills the child and moves to crashed when a render exceeds its timeout', async () => {
    const manager = makeManager('hang-on-render', { renderTimeoutMs: 100 });
    await manager.ensureReady();

    await expect(manager.render(makeRequest(1))).rejects.toBeInstanceOf(RenderTimeoutError);

    expect(manager.getState()).toBe('crashed');
    const child = spawnedChildren[spawnedChildren.length - 1];
    await waitUntil(() => child.exitCode !== null || child.signalCode !== null);
    expect(child.killed || child.signalCode === 'SIGKILL').toBeTruthy();
  });

  it('auto-restarts on crash with the configured backoff sequence, then requires a manual restart on the 4th crash', async () => {
    const manager = makeManager('crash-after-initialize', { backoffMs: [5, 5, 5] });
    await manager.ensureReady();
    expect(manager.getState()).toBe('ready');

    // 1st crash fires ~50ms after initialize; auto-restart follows (backoff[0]).
    await waitUntil(() => manager.crashCount() >= 1);
    await waitUntil(() => manager.getState() === 'ready', 5000);
    expect(manager.needsManualRestart()).toBe(false);

    // 2nd crash + auto-restart.
    await waitUntil(() => manager.crashCount() >= 2);
    await waitUntil(() => manager.getState() === 'ready' || manager.needsManualRestart(), 5000);

    // 3rd crash + auto-restart.
    await waitUntil(() => manager.crashCount() >= 3);
    await waitUntil(() => manager.getState() === 'ready' || manager.needsManualRestart(), 5000);
    expect(manager.needsManualRestart()).toBe(false); // still within the 3-auto-restart budget

    // 4th crash: no more auto-restart — manager stays crashed until restart() is called explicitly.
    await waitUntil(() => manager.crashCount() >= 4, 5000);
    expect(manager.needsManualRestart()).toBe(true);
    expect(manager.getState()).toBe('crashed');

    // Prove no 5th auto-restart attempt happens: state stays crashed well past another backoff interval.
    await new Promise((r) => setTimeout(r, 100));
    expect(manager.getState()).toBe('crashed');
    expect(manager.crashCount()).toBe(4);

    // ensureReady() refuses to help until an explicit restart() — matches P1-I AC3 (no silent auto-retry).
    await expect(manager.ensureReady()).rejects.toBeInstanceOf(IllegalStateError);
  }, 15000);

  it('restart() recovers a manager stuck needing a manual restart', async () => {
    const manager = makeManager('crash-after-initialize', { backoffMs: [5, 5, 5], maxAutoRestarts: 1 });
    await manager.ensureReady();
    await waitUntil(() => manager.needsManualRestart(), 5000);
    expect(manager.getState()).toBe('crashed');

    await manager.restart();

    expect(manager.getState()).toBe('ready');
    expect(manager.needsManualRestart()).toBe(false);
    expect(manager.crashCount()).toBe(0);
  }, 15000);

  it('dispose() terminates the child process (no orphan)', async () => {
    const manager = makeManager('normal');
    await manager.ensureReady();
    const child = spawnedChildren[spawnedChildren.length - 1];
    expect(child.exitCode).toBeNull();
    expect(child.signalCode).toBeNull();

    await manager.dispose();

    // A process killed by a signal (SIGTERM/SIGKILL) never sets `.exitCode` — Node records that
    // as `.signalCode` instead; either one being non-null proves the process actually terminated.
    await waitUntil(() => child.exitCode !== null || child.signalCode !== null);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(manager.getState()).toBe('stopped');
  });

  it('surfaces the last stderr lines from the fake host (crash reporting, P1-I AC5)', async () => {
    const manager = makeManager('normal');
    await manager.ensureReady();
    await manager.render(makeRequest(1));

    const tail = manager.stderrTail();
    expect(tail.some((l) => l.includes('fake-host: initialize'))).toBe(true);
    expect(tail.some((l) => l.includes('render id=1'))).toBe(true);
  });

  it('caps the stderr ring buffer at the configured line count', async () => {
    const manager = makeManager('normal', { stderrRingBufferLines: 3 });
    await manager.ensureReady();
    await manager.render(makeRequest(1));
    await manager.render(makeRequest(2));

    expect(manager.stderrTail().length).toBeLessThanOrEqual(3);
  });
});

describe('buildJavaCommand', () => {
  it('assembles -Xmx, the layoutlib system properties, and the classpath (design §5)', () => {
    const { command, args } = buildJavaCommand({
      javaBin: '/opt/jdk17/bin/java',
      hostJarPath: '/ext/host.jar',
      classpathJars: ['/cache/jars/a.jar', '/cache/jars/b.jar'],
      layoutlibRuntimeRoot: '/cache/layoutlib/runtime',
      layoutlibResourcesRoot: '/cache/layoutlib/resources',
      maxHeapMb: 512,
    });
    expect(command).toBe('/opt/jdk17/bin/java');
    expect(args).toContain('-Xmx512m');
    expect(args).toContain('-Dpaparazzi.layoutlib.runtime.root=/cache/layoutlib/runtime');
    expect(args).toContain('-Dpaparazzi.layoutlib.resources.root=/cache/layoutlib/resources');
    const cpIndex = args.indexOf('-cp');
    expect(cpIndex).toBeGreaterThanOrEqual(0);
    expect(args[cpIndex + 1]).toBe(['/ext/host.jar', '/cache/jars/a.jar', '/cache/jars/b.jar'].join(path.delimiter));
  });

  it('defaults the heap to 1024m when not specified (NFR-02)', () => {
    const { args } = buildJavaCommand({
      javaBin: 'java',
      hostJarPath: 'host.jar',
      classpathJars: [],
      layoutlibRuntimeRoot: 'r',
      layoutlibResourcesRoot: 's',
    });
    expect(args).toContain('-Xmx1024m');
  });
});
