import { describe, expect, it } from 'vitest';
import { captureState, restoreState } from './panelStateCache';
import { initialViewModel, PanelViewModel } from './viewmodel';
import { initialPanOffset, initialZoomState, PanOffset, ZoomState } from './viewport';

const ZOOM_150: ZoomState = { zoom: 150, percent: 150, pixelScale: 1, capped: false };
const PAN: PanOffset = { x: 12, y: -34 };

describe('panelStateCache — webview-side transient cache (T101, DF-6, UX-06 AC4)', () => {
  it('captures the image, its dimensions, and resultKind "image" for a successful render', () => {
    const vm: PanelViewModel = { ...initialViewModel, imageUri: 'vscode-webview://img/1.png', imageWidth: 100, imageHeight: 200 };
    expect(captureState(vm, ZOOM_150, PAN)).toEqual({
      imageUri: 'vscode-webview://img/1.png',
      width: 100,
      height: 200,
      resultKind: 'image',
      zoom: ZOOM_150,
      panX: 12,
      panY: -34,
    });
  });

  it('captures resultKind "error" when a stale image is shown under an error', () => {
    const vm: PanelViewModel = {
      ...initialViewModel,
      imageUri: 'vscode-webview://img/1.png',
      imageWidth: 100,
      imageHeight: 200,
      stale: true,
      error: { message: 'boom' },
    };
    expect(captureState(vm, ZOOM_150, PAN).resultKind).toBe('error');
  });

  it('captures resultKind "fileGone" when the file-gone notice is showing', () => {
    const vm: PanelViewModel = { ...initialViewModel, fileGone: true };
    expect(captureState(vm, initialZoomState, initialPanOffset).resultKind).toBe('fileGone');
  });

  it('captures resultKind "none" when nothing has ever been applied', () => {
    expect(captureState(initialViewModel, initialZoomState, initialPanOffset).resultKind).toBe('none');
  });

  it('restores the exact zoom and pan unconditionally, even with no cached image', () => {
    const restored = restoreState({
      imageUri: undefined,
      width: 0,
      height: 0,
      resultKind: 'none',
      zoom: ZOOM_150,
      panX: 12,
      panY: -34,
    });
    expect(restored.zoom).toEqual(ZOOM_150);
    expect(restored.pan).toEqual({ x: 12, y: -34 });
    expect(restored.viewModel).toBeUndefined();
  });

  it('restores a cached image at full opacity (resultKind "image") — repaints before any message arrives', () => {
    const restored = restoreState({
      imageUri: 'vscode-webview://img/1.png',
      width: 100,
      height: 200,
      resultKind: 'image',
      zoom: ZOOM_150,
      panX: 12,
      panY: -34,
    });
    expect(restored.viewModel).toEqual({
      imageUri: 'vscode-webview://img/1.png',
      imageWidth: 100,
      imageHeight: 200,
      stale: false,
      fileGone: false,
    });
  });

  it('restores a cached image dimmed (resultKind "error") — mirrors the stale-display opacity rule', () => {
    const restored = restoreState({
      imageUri: 'vscode-webview://img/1.png',
      width: 100,
      height: 200,
      resultKind: 'error',
      zoom: initialZoomState,
      panX: 0,
      panY: 0,
    });
    expect(restored.viewModel?.stale).toBe(true);
    expect(restored.viewModel?.fileGone).toBe(false);
  });

  it('restores fileGone without an image when none was ever cached', () => {
    const restored = restoreState({
      imageUri: undefined,
      width: 0,
      height: 0,
      resultKind: 'fileGone',
      zoom: initialZoomState,
      panX: 0,
      panY: 0,
    });
    // No imageUri to show — falls back to the zoom/pan-only restore (nothing paintable).
    expect(restored.viewModel).toBeUndefined();
  });

  it('round-trips capture -> restore for a typical image state', () => {
    const vm: PanelViewModel = { ...initialViewModel, imageUri: 'vscode-webview://img/2.png', imageWidth: 411, imageHeight: 891 };
    const restored = restoreState(captureState(vm, ZOOM_150, PAN));
    expect(restored.viewModel).toEqual({
      imageUri: 'vscode-webview://img/2.png',
      imageWidth: 411,
      imageHeight: 891,
      stale: false,
      fileGone: false,
    });
    expect(restored.zoom).toEqual(ZOOM_150);
    expect(restored.pan).toEqual(PAN);
  });
});
