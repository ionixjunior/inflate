// @vitest-environment jsdom
/**
 * main.ts's actual boot-time wiring to the setState/getState cache (T101, DF-6, UX-06 AC4). The
 * pure capture/restore logic lives in `panelStateCache.ts` (unit-tested there without a DOM); this
 * file proves `main.ts` itself calls it correctly — stub `acquireVsCodeApi`, load the real shell
 * markup (`panelShellHtml`, vscode-free), and import the real bundled entry script under jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { panelShellHtml } from '../src/webview';
import type { CachedPanelState } from './panelStateCache';

interface FakeVsCodeApi {
  postMessage: ReturnType<typeof vi.fn>;
  getState: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
}

function setupDom(): void {
  const html = panelShellHtml({ scriptUri: 'https://example.test/webview.js', cspSource: 'https://example.test', nonce: 'n' });
  document.documentElement.innerHTML = html.replace(/^<!DOCTYPE[^>]*>/i, '');
}

function installFakeVsCodeApi(initialState?: unknown): FakeVsCodeApi {
  let stored = initialState;
  const api: FakeVsCodeApi = {
    postMessage: vi.fn(),
    getState: vi.fn(() => stored),
    setState: vi.fn((next: unknown) => {
      stored = next;
    }),
  };
  (globalThis as unknown as { acquireVsCodeApi: () => FakeVsCodeApi }).acquireVsCodeApi = () => api;
  return api;
}

describe("main.ts boot wiring — repaints the setState cache before 'ready' round-trips (T101, DF-6, UX-06 AC4)", () => {
  beforeEach(() => {
    vi.resetModules();
    setupDom();
  });

  afterEach(() => {
    delete (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
  });

  it('with no cached state, boots blank (no crash, no image shown) and still signals ready', async () => {
    const api = installFakeVsCodeApi(undefined);
    await import('./main');

    const img = document.getElementById('preview') as HTMLImageElement;
    expect(img.style.display).toBe('none');
    expect(api.postMessage).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('repaints a cached image and restores the exact pan/zoom synchronously at boot, before any message arrives', async () => {
    const cached: CachedPanelState = {
      imageUri: 'https://example.test/img/cached.png',
      width: 400,
      height: 800,
      resultKind: 'image',
      zoom: { zoom: 150, percent: 150, pixelScale: 1, capped: false },
      panX: 12,
      panY: -34,
    };
    installFakeVsCodeApi(cached);
    await import('./main');

    const img = document.getElementById('preview') as HTMLImageElement;
    expect(img.src).toBe('https://example.test/img/cached.png');
    expect(img.style.display).not.toBe('none');
    expect(img.style.transform).toBe('translate(12px, -34px) scale(1.5)');
  });

  it('restores a dimmed (stale) image for a cached error result', async () => {
    const cached: CachedPanelState = {
      imageUri: 'https://example.test/img/cached.png',
      width: 100,
      height: 200,
      resultKind: 'error',
      zoom: { zoom: 'fit', percent: 100, pixelScale: 1, capped: false },
      panX: 0,
      panY: 0,
    };
    installFakeVsCodeApi(cached);
    await import('./main');

    const img = document.getElementById('preview') as HTMLImageElement;
    expect(img.style.opacity).toBe('0.4');
  });

  it("persists the applied image + viewport via setState when a 'setImage' message arrives", async () => {
    const api = installFakeVsCodeApi(undefined);
    await import('./main');
    api.setState.mockClear(); // isolate the post-boot persist from any boot-time call

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'setImage', uri: 'https://example.test/img/1.png', width: 100, height: 200, warnings: [] },
      }),
    );

    expect(api.setState).toHaveBeenCalled();
    const lastCall = api.setState.mock.calls.at(-1)?.[0] as CachedPanelState;
    expect(lastCall.imageUri).toBe('https://example.test/img/1.png');
    expect(lastCall.resultKind).toBe('image');
  });

  it('a replayed newer image supersedes whatever was cached at boot', async () => {
    const cached: CachedPanelState = {
      imageUri: 'https://example.test/img/old.png',
      width: 1,
      height: 1,
      resultKind: 'image',
      zoom: { zoom: 'fit', percent: 100, pixelScale: 1, capped: false },
      panX: 0,
      panY: 0,
    };
    installFakeVsCodeApi(cached);
    await import('./main');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'setImage', uri: 'https://example.test/img/new.png', width: 50, height: 50, warnings: [] },
      }),
    );

    const img = document.getElementById('preview') as HTMLImageElement;
    expect(img.src).toBe('https://example.test/img/new.png');
  });
});
