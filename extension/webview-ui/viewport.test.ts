import { describe, expect, it } from 'vitest';
import {
  DisplayRect,
  MIN_RESIZE_DP,
  ZoomState,
  applyCanvasCapped,
  clampPan,
  clampZoomPercent,
  computeFitPercent,
  dragSizeToDp,
  edgeHitTest,
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

describe('edgeHitTest — resize zone hit-testing (fix-pack FP-3 AC2)', () => {
  const rect: DisplayRect = { left: 100, top: 100, width: 200, height: 100 }; // right=300, bottom=200

  it('returns null outside the image on any side', () => {
    expect(edgeHitTest(50, 150, rect)).toBeNull(); // left of image
    expect(edgeHitTest(150, 50, rect)).toBeNull(); // above image
    expect(edgeHitTest(350, 150, rect)).toBeNull(); // right of image
    expect(edgeHitTest(150, 250, rect)).toBeNull(); // below image
  });

  it('returns null inside the image but away from every edge', () => {
    expect(edgeHitTest(200, 150, rect)).toBeNull();
  });

  it('returns "right" within the band of the right edge (not near the bottom)', () => {
    expect(edgeHitTest(295, 120, rect)).toBe('right');
    expect(edgeHitTest(300, 100, rect)).toBe('right'); // exactly at the edge, top corner of the band
  });

  it('returns "bottom" within the band of the bottom edge (not near the right)', () => {
    expect(edgeHitTest(150, 195, rect)).toBe('bottom');
    expect(edgeHitTest(100, 200, rect)).toBe('bottom'); // exactly at the edge, left corner of the band
  });

  it('returns "corner" when within the band of both the right and bottom edges', () => {
    expect(edgeHitTest(295, 195, rect)).toBe('corner');
    expect(edgeHitTest(300, 200, rect)).toBe('corner'); // exact bottom-right corner
  });

  it('honors a custom band width', () => {
    // 20px from the right edge: outside the default 8px band, inside a 24px band.
    expect(edgeHitTest(280, 150, rect)).toBeNull();
    expect(edgeHitTest(280, 150, rect, 24)).toBe('right');
  });
});

describe('dragSizeToDp — drag-to-resize dp conversion and clamps (fix-pack FP-3 AC4)', () => {
  it('converts proportionally through the current zoom (2x zoom, scale factor baked into start px)', () => {
    // Start: 100x200 dp shown at 200x400 displayed px (2x zoom) -> 2 displayed px per dp.
    const result = dragSizeToDp({ w: 100, h: 200 }, { w: 200, h: 400 }, { w: 240, h: 440 }, { densityDpi: 160, pixelScale: 1 });
    // 240 displayed px / 2 px-per-dp = 120 dp; 440 / 2 = 220 dp.
    expect(result).toEqual({ w: 120, h: 220 });
  });

  it('rounds to the nearest integer dp', () => {
    const result = dragSizeToDp({ w: 100, h: 100 }, { w: 300, h: 300 }, { w: 101, h: 305 }, { densityDpi: 160, pixelScale: 1 });
    // scale = 100/300 = 1/3 dp per displayed px. 101/3 = 33.67 -> 34; 305/3 = 101.67 -> 102.
    expect(result).toEqual({ w: 34, h: 102 });
  });

  it('clamps to the 16 dp floor per axis when dragged smaller', () => {
    const result = dragSizeToDp({ w: 100, h: 100 }, { w: 100, h: 100 }, { w: 5, h: 1 }, { densityDpi: 160, pixelScale: 1 });
    expect(result).toEqual({ w: MIN_RESIZE_DP, h: MIN_RESIZE_DP });
  });

  it('clamps to the 4096 px canvas cap at densityDpi (mdpi = 160, pixelScale 1 -> 1 px/dp)', () => {
    // At mdpi/pixelScale 1, 1 dp == 1 px, so the cap is exactly 4096 dp.
    const result = dragSizeToDp({ w: 100, h: 100 }, { w: 100, h: 100 }, { w: 5000, h: 5000 }, { densityDpi: 160, pixelScale: 1 });
    expect(result).toEqual({ w: 4096, h: 4096 });
  });

  it('clamps to a lower dp cap at a higher density and pixelScale (xhdpi=320, pixelScale 2 -> 4 px/dp)', () => {
    // 4096 px / 4 px-per-dp = 1024 dp cap.
    const result = dragSizeToDp({ w: 100, h: 100 }, { w: 100, h: 100 }, { w: 100000, h: 100000 }, { densityDpi: 320, pixelScale: 2 });
    expect(result).toEqual({ w: 1024, h: 1024 });
  });

  it('falls back to a 1:1 scale when the start displayed size is degenerate (0 px)', () => {
    const result = dragSizeToDp({ w: 50, h: 50 }, { w: 0, h: 0 }, { w: 200, h: 200 }, { densityDpi: 160, pixelScale: 1 });
    expect(result).toEqual({ w: 200, h: 200 });
  });
});
