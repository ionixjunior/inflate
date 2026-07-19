import { describe, expect, it } from 'vitest';
import { EngineManifest } from './artifacts';
import { DoctorHostManagerView, assembleDoctorReport, derivePinMatrix, formatDoctorReport } from './doctor';
import { GuidedError, JdkInfo } from './jdk';

const MANIFEST: EngineManifest = {
  pinName: 'paparazzi-1.3.5+layoutlib-14.0.11',
  artifacts: [
    { group: 'com.android.tools.layoutlib', name: 'layoutlib', version: '14.0.11', kind: 'jar', url: 'u', sha256: 's', sizeBytes: 1 },
    { group: 'com.android.tools.layoutlib', name: 'layoutlib-api', version: '31.4.2', kind: 'jar', url: 'u', sha256: 's', sizeBytes: 1 },
  ],
};

function fakeHostManager(overrides: Partial<DoctorHostManagerView> = {}): DoctorHostManagerView {
  return {
    getState: () => 'ready',
    getChildPid: () => 4242,
    stderrTail: () => [],
    ...overrides,
  };
}

const HEALTHY_JDK: JdkInfo = { javaBin: '/opt/jdk/bin/java', home: '/opt/jdk', version: 17, source: 'JAVA_HOME' };
const GUIDED_ERROR: GuidedError = {
  kind: 'guidedSetup',
  requiredVersion: 17,
  downloadUrl: 'https://learn.microsoft.com/en-us/java/openjdk/download',
  message: 'Inflate requires JDK 17 or later.',
};

describe('assembleDoctorReport (T19) — P1-H AC5 fields', () => {
  it('reports a fully healthy state: JDK found, cache ready, host ready with uptime', () => {
    const report = assembleDoctorReport({
      jdkResult: HEALTHY_JDK,
      cacheReport: { manifestHash: 'abc123', ready: true, artifacts: [{ key: 'g:layoutlib:14.0.11', installed: true, sizeBytes: 50_000_000 }] },
      hostManager: fakeHostManager(),
      manifest: MANIFEST,
      hostReadySince: 1_000,
      lastRenderTimings: { prepareMs: 10, inflateMs: 5, renderMs: 8, totalMs: 23 },
      logPointers: ['Inflate output channel'],
      now: () => 5_000,
    });

    expect(report.jdk).toEqual({ found: true, path: '/opt/jdk', version: 17, source: 'JAVA_HOME' });
    expect(report.cache.ready).toBe(true);
    expect(report.cache.artifacts).toEqual([{ key: 'g:layoutlib:14.0.11', installed: true, sizeBytes: 50_000_000 }]);
    expect(report.host).toEqual({ state: 'ready', pid: 4242, uptimeMs: 4000, lastCrashExcerpt: undefined });
    expect(report.roots.status).toBe('resolverPending');
    expect(report.lastRenderTimings).toEqual({ prepareMs: 10, inflateMs: 5, renderMs: 8, totalMs: 23 });
    expect(report.enginePinMatrix).toEqual({
      pinName: 'paparazzi-1.3.5+layoutlib-14.0.11',
      layoutlibVersion: '14.0.11',
      toolsVersion: '31.4.2',
      minJdk: 17,
      compileSdkVersion: 34,
    });
    expect(report.logPointers).toEqual(['Inflate output channel']);
  });

  it('reports the no-JDK state with the guided-setup message and download link (P1-H AC3)', () => {
    const report = assembleDoctorReport({
      jdkResult: GUIDED_ERROR,
      cacheReport: { manifestHash: 'abc123', ready: false, artifacts: [] },
      hostManager: fakeHostManager({ getState: () => 'stopped', getChildPid: () => undefined }),
      manifest: MANIFEST,
      logPointers: [],
    });

    expect(report.jdk.found).toBe(false);
    expect(report.jdk.guidedMessage).toBe('Inflate requires JDK 17 or later.');
    expect(report.jdk.downloadUrl).toBe('https://learn.microsoft.com/en-us/java/openjdk/download');
    expect(report.jdk.path).toBeUndefined();
    expect(report.host.state).toBe('stopped');
  });

  it('reports an incomplete-cache state: not ready, with per-artifact installed flags', () => {
    const report = assembleDoctorReport({
      jdkResult: HEALTHY_JDK,
      cacheReport: {
        manifestHash: 'abc123',
        ready: false,
        artifacts: [
          { key: 'g:layoutlib:14.0.11', installed: true, sizeBytes: 50_000_000 },
          { key: 'g:layoutlib-resources:14.0.11', installed: false },
        ],
      },
      hostManager: fakeHostManager({ getState: () => 'stopped', getChildPid: () => undefined }),
      manifest: MANIFEST,
      logPointers: [],
    });

    expect(report.cache.ready).toBe(false);
    expect(report.cache.artifacts.filter((a) => a.installed)).toHaveLength(1);
    expect(report.cache.artifacts.filter((a) => !a.installed)).toHaveLength(1);
  });

  it('reports a crashed-host state with the stderr excerpt and no uptime', () => {
    const stderrLines = Array.from({ length: 15 }, (_, i) => `line ${i}`);
    const report = assembleDoctorReport({
      jdkResult: HEALTHY_JDK,
      cacheReport: { manifestHash: 'abc123', ready: true, artifacts: [] },
      hostManager: fakeHostManager({ getState: () => 'crashed', getChildPid: () => undefined, stderrTail: () => stderrLines }),
      manifest: MANIFEST,
      hostReadySince: 1_000,
      logPointers: [],
      now: () => 5_000,
    });

    expect(report.host.state).toBe('crashed');
    expect(report.host.uptimeMs).toBeUndefined(); // not ready/rendering -> no uptime
    expect(report.host.lastCrashExcerpt).toEqual(stderrLines.slice(-10));
    expect(report.host.lastCrashExcerpt).toHaveLength(10);
  });
});

describe('derivePinMatrix', () => {
  it('reads layoutlib/tools versions straight from the bundled engine-manifest.json (never hand-maintained)', () => {
    const matrix = derivePinMatrix(MANIFEST);
    expect(matrix.layoutlibVersion).toBe('14.0.11');
    expect(matrix.toolsVersion).toBe('31.4.2');
    expect(matrix.minJdk).toBe(17);
    expect(matrix.compileSdkVersion).toBe(34);
  });

  it('falls back to "unknown" for a version whose artifact is absent from the manifest', () => {
    const matrix = derivePinMatrix({ pinName: 'p', artifacts: [] });
    expect(matrix.layoutlibVersion).toBe('unknown');
    expect(matrix.toolsVersion).toBe('unknown');
  });
});

describe('formatDoctorReport', () => {
  it('renders every P1-H AC5 section as human-readable lines', () => {
    const report = assembleDoctorReport({
      jdkResult: HEALTHY_JDK,
      cacheReport: { manifestHash: 'abc123', ready: true, artifacts: [{ key: 'g:layoutlib:14.0.11', installed: true, sizeBytes: 1 }] },
      hostManager: fakeHostManager(),
      manifest: MANIFEST,
      hostReadySince: 0,
      lastRenderTimings: { prepareMs: 1, inflateMs: 2, renderMs: 3, totalMs: 6 },
      logPointers: ['Inflate output channel'],
      now: () => 100,
    });
    const lines = formatDoctorReport(report).join('\n');

    expect(lines).toContain('/opt/jdk'); // JDK
    expect(lines).toContain('abc123'); // cache manifest hash
    expect(lines).toContain('state: ready'); // host
    expect(lines).toContain('Resource root resolution'); // roots stub
    expect(lines).toContain('total=6ms'); // render timings
    expect(lines).toContain('14.0.11'); // engine pin
    expect(lines).toContain('Inflate output channel'); // log pointers
  });
});
