import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_PACKAGE_NAME, PreviewConfig, RenderRequest, RenderResponse } from './protocol';
import { RenderScheduler, SchedulerDeps, SchedulerHost } from './scheduler';

const CONFIG: PreviewConfig = {
  themeName: 'Theme.Material3.DayNight',
  isProjectTheme: false,
  night: false,
  device: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
  orientation: 'portrait',
  density: 'xhdpi',
  pixelScale: 1,
};

function okResponse(id: number, deps: string[] = []): RenderResponse {
  return {
    id,
    status: 'ok',
    pngPath: `/out/${id}.png`,
    imageWidth: 10,
    imageHeight: 20,
    warnings: [],
    dependencies: deps,
    timings: { prepareMs: 0, inflateMs: 0, renderMs: 0, totalMs: 0 },
    sessionRebuilt: false,
  };
}

function errorResponse(id: number): RenderResponse {
  return {
    id,
    status: 'error',
    warnings: [],
    error: { message: 'fake domain error' },
    dependencies: [],
    timings: { prepareMs: 0, inflateMs: 0, renderMs: 0, totalMs: 0 },
    sessionRebuilt: false,
  };
}

/** A fake host that records every call and, in `manual` mode, lets a test resolve/reject renders by
 * id (fix-pack: reject simulates a host-level failure — spawn/crash/timeout — distinct from a
 * resolved `status:'error'` domain error). */
class FakeHost implements SchedulerHost {
  events: string[] = [];
  renderCalls: RenderRequest[] = [];
  invalidateCalls: string[][] = [];
  mode: 'immediate' | 'manual' = 'immediate';
  depsFor = new Map<number, string[]>();
  private deferred = new Map<number, { resolve: (r: RenderResponse) => void; reject: (e: Error) => void }>();

  render(req: RenderRequest): Promise<RenderResponse> {
    this.renderCalls.push(req);
    this.events.push(`render:${req.id}`);
    if (this.mode === 'immediate') return Promise.resolve(okResponse(req.id, this.depsFor.get(req.id) ?? []));
    return new Promise<RenderResponse>((resolve, reject) => this.deferred.set(req.id, { resolve, reject }));
  }

  invalidate(paths: string[]): Promise<unknown> {
    this.invalidateCalls.push(paths);
    this.events.push(`invalidate:${paths.join(',')}`);
    return Promise.resolve({});
  }

  resolveRender(id: number, deps: string[] = []): void {
    this.resolveRenderWith(id, okResponse(id, deps));
  }

  resolveRenderWith(id: number, response: RenderResponse): void {
    const d = this.deferred.get(id);
    if (!d) throw new Error(`no deferred render for id ${id}`);
    this.deferred.delete(id);
    d.resolve(response);
  }

  rejectRender(id: number, error: Error): void {
    const d = this.deferred.get(id);
    if (!d) throw new Error(`no deferred render for id ${id}`);
    this.deferred.delete(id);
    d.reject(error);
  }
}

function makeScheduler(host: FakeHost, overrides: Partial<SchedulerDeps> = {}) {
  const results: Array<{ docPath: string; response: RenderResponse }> = [];
  const deps: SchedulerDeps = {
    host,
    resolveRoots: () => ({ roots: ['/proj/res'], packageName: 'com.example' }),
    classify: () => 'layout',
    getConfig: () => CONFIG,
    readBuffer: () => 'DIRTY-BUFFER',
    onResult: (docPath, response) => results.push({ docPath, response }),
    ...overrides,
  };
  return { scheduler: new RenderScheduler(deps), results };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RenderScheduler — coalescing and stale discard (P1-F AC3, NFR-05)', () => {
  let host: FakeHost;
  beforeEach(() => {
    host = new FakeHost();
  });

  it('always dispatches ENGINE_PACKAGE_NAME on the wire, never resolveRoots()\'s real project package (T60)', async () => {
    // resolveRoots() deliberately returns a real-looking, non-engine package ('com.example') — the
    // render pipeline only resolves resource ids under the fixed engine package (see
    // ENGINE_PACKAGE_NAME's doc in protocol.ts); sending the project's real package makes every id
    // resolve to 0 and the render fail. This asserts the DISPATCHED wire value, not just that some
    // packageName field is set.
    const { scheduler } = makeScheduler(host);
    scheduler.requestRender('/proj/res/layout/main.xml', 'save');
    await tick();

    expect(host.renderCalls).toHaveLength(1);
    expect(host.renderCalls[0].packageName).toBe(ENGINE_PACKAGE_NAME);
    expect(host.renderCalls[0].packageName).not.toBe('com.example');
  });

  it('collapses a 10-save burst to the latest content with zero stale displays', async () => {
    host.mode = 'manual';
    const { scheduler, results } = makeScheduler(host);
    const doc = '/proj/res/layout/main.xml';

    for (let i = 0; i < 10; i++) scheduler.requestRender(doc, 'save');
    // Exactly one render is in flight (id 1); the other 9 collapsed into one pending request.
    expect(host.renderCalls.map((r) => r.id)).toEqual([1]);

    host.resolveRender(1); // stale: a newer request (id 10) is pending
    await tick();

    // The in-flight completion dispatched the coalesced latest request (id 10) — never 2..9.
    expect(host.renderCalls.map((r) => r.id)).toEqual([1, 10]);
    host.resolveRender(10);
    await tick();

    // Only the final content was ever delivered — no stale frame reached the panel.
    expect(results.map((r) => r.response.id)).toEqual([10]);
  });

  it('discards an out-of-order stale response and delivers only the newest', async () => {
    host.mode = 'manual';
    const { scheduler, results } = makeScheduler(host);
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save'); // id 1 dispatched
    scheduler.requestRender(doc, 'config'); // id 2 pending
    host.resolveRender(1); // id 1 < latest id 2 → discarded
    await tick();
    host.resolveRender(2);
    await tick();

    expect(results.map((r) => r.response.id)).toEqual([2]);
  });
});

describe('RenderScheduler — dependency invalidation (P1-F AC2)', () => {
  let host: FakeHost;
  beforeEach(() => {
    host = new FakeHost();
  });

  it('invalidates the changed dependency before the dependent re-render', async () => {
    const { scheduler } = makeScheduler(host);
    const doc = '/proj/res/layout/main.xml';
    const colors = '/proj/res/values/colors.xml';

    // First render establishes the dependency set from the response.
    host.depsFor.set(1, [colors]);
    scheduler.requestRender(doc, 'save');
    await tick();
    expect(scheduler.dependenciesOf(doc)).toContain(path.resolve(colors));

    // Saving that dependency invalidates (with the path) THEN re-renders.
    host.events = [];
    scheduler.notifyFileSaved(colors);
    await tick();

    expect(host.invalidateCalls.at(-1)).toEqual([path.resolve(colors)]);
    // Ordering: invalidate strictly precedes the dependent render.
    const invIdx = host.events.findIndex((e) => e.startsWith('invalidate'));
    const renIdx = host.events.findIndex((e) => e.startsWith('render'));
    expect(invIdx).toBeGreaterThanOrEqual(0);
    expect(renIdx).toBeGreaterThan(invIdx);
  });

  it('treats any values-dir file under a root as a dependency, without invalidating on self-save', async () => {
    const { scheduler } = makeScheduler(host);
    const doc = '/proj/res/layout/main.xml';
    scheduler.requestRender(doc, 'save'); // no deps reported
    await tick();

    // A values file not in the explicit dependency list still triggers depSave (conservative watch).
    scheduler.notifyFileSaved('/proj/res/values-night/colors.xml');
    await tick();
    expect(host.invalidateCalls.length).toBe(1);

    // Saving the previewed file itself is a 'save' — never an invalidate.
    scheduler.notifyFileSaved(doc);
    await tick();
    expect(host.invalidateCalls.length).toBe(1);
  });
});

describe('RenderScheduler — refresh and per-document isolation (P1-F AC4, NFR-05)', () => {
  let host: FakeHost;
  beforeEach(() => {
    host = new FakeHost();
  });

  it('refresh carries the dirty buffer as inlineContent; other causes do not', async () => {
    const { scheduler } = makeScheduler(host);
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save');
    await tick();
    expect(host.renderCalls.at(-1)?.inlineContent).toBeUndefined();

    scheduler.refresh(doc);
    await tick();
    expect(host.renderCalls.at(-1)?.inlineContent).toBe('DIRTY-BUFFER');
  });

  it('keeps three documents fully isolated (independent ids, in-flight, results)', async () => {
    host.mode = 'manual';
    const { scheduler, results } = makeScheduler(host);
    const docs = ['/proj/res/layout/a.xml', '/proj/res/layout/b.xml', '/proj/res/layout/c.xml'];

    docs.forEach((d) => scheduler.requestRender(d, 'save'));
    // Each document dispatched its own render concurrently (one in flight per doc).
    expect(host.renderCalls.map((r) => r.id).sort()).toEqual([1, 2, 3]);

    // Resolve out of order — each result routes back to its own document.
    host.resolveRender(2);
    host.resolveRender(1);
    host.resolveRender(3);
    await tick();

    const byDoc = new Map(results.map((r) => [r.docPath, r.response.id]));
    expect(byDoc.size).toBe(3);
    expect(byDoc.get(path.resolve(docs[0]))).toBe(1);
    expect(byDoc.get(path.resolve(docs[1]))).toBe(2);
    expect(byDoc.get(path.resolve(docs[2]))).toBe(3);
  });
});

describe('RenderScheduler — automatic retry of a host-level failure (fix-pack POLISH-03, FP-1 AC3-AC6)', () => {
  let host: FakeHost;
  beforeEach(() => {
    host = new FakeHost();
    host.mode = 'manual';
  });

  it('retries a host-level failure of the latest request exactly once, then delivers success without ever surfacing onHostError (FP-1 AC3)', async () => {
    const hostErrors: Error[] = [];
    const retries: Error[] = [];
    const { scheduler, results } = makeScheduler(host, {
      onHostError: (_docPath, error) => hostErrors.push(error),
      onRetry: (_docPath, error) => retries.push(error),
    });
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save');
    expect(host.renderCalls.map((r) => r.id)).toEqual([1]);

    host.rejectRender(1, new Error('host crashed'));
    await tick();

    // The retry re-dispatched the SAME request id — not a new one.
    expect(host.renderCalls.map((r) => r.id)).toEqual([1, 1]);
    expect(retries).toHaveLength(1);
    expect(retries[0].message).toBe('host crashed');
    expect(hostErrors).toHaveLength(0);

    host.resolveRender(1);
    await tick();

    expect(results.map((r) => r.response.id)).toEqual([1]);
    expect(hostErrors).toHaveLength(0);
  });

  it('surfaces onHostError exactly once after the automatic retry also fails (FP-1 AC4)', async () => {
    const hostErrors: Error[] = [];
    const { scheduler } = makeScheduler(host, { onHostError: (_docPath, error) => hostErrors.push(error) });
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save');
    host.rejectRender(1, new Error('crash 1'));
    await tick();
    expect(host.renderCalls.map((r) => r.id)).toEqual([1, 1]); // the one retry happened

    host.rejectRender(1, new Error('crash 2'));
    await tick();

    expect(hostErrors).toHaveLength(1);
    expect(hostErrors[0].message).toBe('crash 2');
    // No further (third) attempt was dispatched.
    expect(host.renderCalls.map((r) => r.id)).toEqual([1, 1]);
  });

  it('discards a stale retry failure once a newer request supersedes it — no error ever surfaced (FP-1 AC5)', async () => {
    const hostErrors: Error[] = [];
    const { scheduler, results } = makeScheduler(host, { onHostError: (_docPath, error) => hostErrors.push(error) });
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save'); // id 1
    host.rejectRender(1, new Error('crash 1'));
    await tick(); // id 1's one retry is now in flight — renderCalls: [1, 1]

    scheduler.requestRender(doc, 'config'); // id 2 becomes latest while id 1's retry is still in flight
    host.rejectRender(1, new Error('stale crash')); // the retry also fails, but id 1 is no longer latest
    await tick();

    expect(hostErrors).toHaveLength(0); // the stale failure is discarded, never surfaced (AC5)
    expect(host.renderCalls.map((r) => r.id)).toEqual([1, 1, 2]); // latest (id 2) dispatched instead

    host.resolveRender(2);
    await tick();
    expect(results.map((r) => r.response.id)).toEqual([2]);
  });

  it('delivers a domain error (status: error) immediately with no retry (FP-1 AC6)', async () => {
    const retries: Error[] = [];
    const { scheduler, results } = makeScheduler(host, { onRetry: (_docPath, error) => retries.push(error) });
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save');
    host.resolveRenderWith(1, errorResponse(1));
    await tick();

    expect(results.map((r) => r.response.status)).toEqual(['error']);
    expect(host.renderCalls.map((r) => r.id)).toEqual([1]); // never retried
    expect(retries).toHaveLength(0);
  });

  it('fires onDispatch for every actual host dispatch, including the retry (fix-pack POLISH-02)', async () => {
    const dispatches: string[] = [];
    const { scheduler } = makeScheduler(host, { onDispatch: (_docPath, cause) => dispatches.push(cause) });
    const doc = '/proj/res/layout/main.xml';

    scheduler.requestRender(doc, 'save');
    expect(dispatches).toEqual(['save']);

    host.rejectRender(1, new Error('crash'));
    await tick();
    expect(dispatches).toEqual(['save', 'save']); // the retry re-dispatches with the same cause
  });
});
