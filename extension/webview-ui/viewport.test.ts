import { describe, expect, it } from 'vitest';
import {
  ZoomState,
  applyCanvasCapped,
  clampPan,
  clampZoomPercent,
  computeFitPercent,
  initialZoomState,
  nextZoomState,
  resolveZoomPercent,
  shouldRequestPixelScale,
} from './viewport';

describe('zoom clamp and fit (T52, UX-03, P1-E FR-4)', () => {
  it('clamps zoom to the 25-400% range', () => {
    expect(clampZoomPercent(10)).toBe(25);
    expect(clampZoomPercent(25)).toBe(25);
    expect(clampZoomPercent(150)).toBe(150);
    expect(clampZoomPercent(400)).toBe(400);
    expect(clampZoomPercent(500)).toBe(400);
  });

  it('computes fit-to-window percent from image and viewport size', () => {
    // Image exactly half the viewport on both axes -> fits at 200%? No: scale = min(vp/img) = 2 -> 200%.
    expect(computeFitPercent(100, 100, 200, 200)).toBe(200);
    // Image larger than viewport -> scales down.
    expect(computeFitPercent(1000, 1000, 250, 250)).toBe(25);
    // Non-uniform: the limiting axis wins.
    expect(computeFitPercent(400, 100, 200, 200)).toBe(50); // width-limited: 200/400=50%
  });

  it('resolves "fit" against the viewport and clamps a manual percent', () => {
    expect(resolveZoomPercent('fit', 100, 100, 200, 200)).toBe(200);
    expect(resolveZoomPercent(500, 100, 100, 200, 200)).toBe(400);
    expect(resolveZoomPercent(150, 100, 100, 200, 200)).toBe(150);
  });
});

describe('pixel-scale escalation past 200% (T52, UX-03)', () => {
  it('escalates to pixelScale 2 when crossing above 200%', () => {
    const next = nextZoomState(initialZoomState, 250, 250);
    expect(next.pixelScale).toBe(2);
    expect(next.percent).toBe(250);
  });

  it('stays at pixelScale 1 at or below 200%', () => {
    expect(nextZoomState(initialZoomState, 200, 200).pixelScale).toBe(1);
    expect(nextZoomState(initialZoomState, 150, 150).pixelScale).toBe(1);
  });

  it('reverts to pixelScale 1 and clears capped when zooming back to <= 200%', () => {
    const escalated = nextZoomState(initialZoomState, 250, 250);
    const capped = applyCanvasCapped(escalated);
    const reverted = nextZoomState(capped, 150, 150);
    expect(reverted.pixelScale).toBe(1);
    expect(reverted.capped).toBe(false);
  });

  it('emits exactly one pixelScale request per direction crossing (debounce)', () => {
    let state: ZoomState = initialZoomState;
    const requests: PixelScaleTransition[] = [];
    for (const percent of [150, 210, 220, 230, 180, 90]) {
      const next = nextZoomState(state, percent, percent);
      if (shouldRequestPixelScale(state, next)) requests.push({ from: state.pixelScale, to: next.pixelScale });
      state = next;
    }
    // Up-crossing at 210 (1->2), then no more requests through 220/230 (already 2), then
    // down-crossing at 180 (2->1), then no more through 90 (already 1).
    expect(requests).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 1 },
    ]);
  });

  it('stops escalating once canvasCapped is reported, even if zoom increases further', () => {
    const escalated = nextZoomState(initialZoomState, 250, 250);
    expect(escalated.pixelScale).toBe(2);
    const capped = applyCanvasCapped(escalated);
    expect(capped.pixelScale).toBe(1);
    expect(capped.capped).toBe(true);

    // Zooming in further while capped must not request pixelScale 2 again.
    const stillCapped = nextZoomState(capped, 300, 300);
    expect(stillCapped.pixelScale).toBe(1);
    expect(shouldRequestPixelScale(capped, stillCapped)).toBe(false);
  });
});

describe('pan bounds (T52, UX-03)', () => {
  it('centers (no pan allowed) when the scaled image fits inside the viewport', () => {
    const clamped = clampPan({ x: 50, y: 50 }, 100, 100, 400, 400, 100);
    expect(clamped).toEqual({ x: 0, y: 0 });
  });

  it('clamps pan so the image can never be dragged entirely out of view', () => {
    // Image scaled to 800x800 in a 200x200 viewport -> max offset = (800-200)/2 = 300 per axis.
    const withinBounds = clampPan({ x: 100, y: -100 }, 400, 400, 200, 200, 200);
    expect(withinBounds).toEqual({ x: 100, y: -100 });

    const overBounds = clampPan({ x: 1000, y: -1000 }, 400, 400, 200, 200, 200);
    expect(overBounds).toEqual({ x: 300, y: -300 });
  });
});

interface PixelScaleTransition {
  from: number;
  to: number;
}
