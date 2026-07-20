/**
 * Pure zoom/pan logic (T52, UX-03, P1-E FR-4 zoom). The preview stage supports 25-400% zoom
 * (fit-to-window by default), wheel/gesture pan, and crossing the 200% threshold requests a
 * `pixelScale: 2` re-render so the image stays crisp instead of blurring under CSS upscale — capped
 * by the 4096 px canvas rule (`canvasCapped` on the render response stops further escalation and
 * shows a notice rather than repeatedly re-requesting a scale the host can't deliver). The zoom
 * level is part of the per-file persisted config (CFG-05, P1-E AC5) via a `zoomChanged` message that
 * — unlike `configChanged` — never by itself triggers a re-render; only a pixel-scale escalation
 * does. Kept DOM-free (no jsdom) — `main.ts` wires real wheel/pointer events onto it.
 */

export const MIN_ZOOM_PERCENT = 25;
export const MAX_ZOOM_PERCENT = 400;
/** Crossing this threshold (exclusive) requests a crisper `pixelScale: 2` render (UX-03). */
const PIXEL_SCALE_THRESHOLD_PERCENT = 200;

export type PixelScale = 1 | 2;
/** `'fit'` = fit-to-window (default); a number is a manual zoom percent (25-400). */
export type ZoomSetting = 'fit' | number;

export interface ZoomState {
  zoom: ZoomSetting;
  /** The effective zoom percent last computed for `zoom` (resolves 'fit' against the viewport). */
  percent: number;
  pixelScale: PixelScale;
  /** True once a `pixelScale: 2` render came back `canvasCapped` — stops re-escalating (UX-03). */
  capped: boolean;
}

export const initialZoomState: ZoomState = { zoom: 'fit', percent: 100, pixelScale: 1, capped: false };

/** Clamp a zoom percent to the 25-400% range (UX-03, P1-E FR-4). */
export function clampZoomPercent(percent: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, Math.round(percent)));
}

/** The fit-to-window zoom percent for an image inside a viewport (letterboxed, never upscaled past
 * the 400% cap nor below the 25% floor). */
export function computeFitPercent(imageW: number, imageH: number, viewportW: number, viewportH: number): number {
  if (imageW <= 0 || imageH <= 0 || viewportW <= 0 || viewportH <= 0) return 100;
  const scale = Math.min(viewportW / imageW, viewportH / imageH);
  return clampZoomPercent(scale * 100);
}

/** Resolve a `ZoomSetting` to an effective percent for a given image/viewport size. */
export function resolveZoomPercent(
  zoom: ZoomSetting,
  imageW: number,
  imageH: number,
  viewportW: number,
  viewportH: number,
): number {
  return zoom === 'fit' ? computeFitPercent(imageW, imageH, viewportW, viewportH) : clampZoomPercent(zoom);
}

/**
 * Decide the pixel scale for a new effective zoom percent. Crossing above the 200% threshold
 * escalates to 2 (unless a prior escalation was capped by the 4096 px rule — no repeated re-request
 * of a scale the host can't deliver); dropping back to/under 200% reverts to 1 and clears `capped` so
 * a later legitimate escalation (e.g. after picking a smaller device) can retry.
 */
export function nextZoomState(state: ZoomState, zoom: ZoomSetting, effectivePercent: number): ZoomState {
  const percent = clampZoomPercent(effectivePercent);
  if (percent > PIXEL_SCALE_THRESHOLD_PERCENT) {
    const pixelScale: PixelScale = state.capped ? state.pixelScale : 2;
    return { zoom, percent, pixelScale, capped: state.capped };
  }
  return { zoom, percent, pixelScale: 1, capped: false };
}

/** Apply a `canvasCapped` render response: stop escalating past the last (uncapped) pixel scale. */
export function applyCanvasCapped(state: ZoomState): ZoomState {
  return { ...state, pixelScale: 1, capped: true };
}

/** Whether transitioning from `prev` to `next` should emit a `configChanged{pixelScale}` re-render
 * request — exactly once per threshold crossing (debounce: no repeat while already at the target
 * scale, UX-03 "debounced"). */
export function shouldRequestPixelScale(prev: ZoomState, next: ZoomState): boolean {
  return next.pixelScale !== prev.pixelScale;
}

export interface PanOffset {
  x: number;
  y: number;
}

export const initialPanOffset: PanOffset = { x: 0, y: 0 };

/**
 * Clamp a pan offset so the image can never be dragged entirely out of view: once the scaled image
 * is smaller than the viewport on an axis it is centered (no panning on that axis); otherwise the
 * offset is bounded so at least the viewport-sized window of the image stays visible.
 */
export function clampPan(
  offset: PanOffset,
  imageW: number,
  imageH: number,
  viewportW: number,
  viewportH: number,
  percent: number,
): PanOffset {
  const scale = percent / 100;
  const scaledW = imageW * scale;
  const scaledH = imageH * scale;
  const maxX = Math.max(0, (scaledW - viewportW) / 2);
  const maxY = Math.max(0, (scaledH - viewportH) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}
