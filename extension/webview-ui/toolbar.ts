/**
 * Pure drawable-toolbar logic (T49, DRW-07/08, P1-C AC1, P1-D AC1/AC3). The webview toolbar for a
 * drawable document offers a state picker (hidden when the drawable is not state-sensitive), a
 * backdrop toggle (checkerboard/solid — a CSS-only swap that never triggers a re-render), and a size
 * override. State/size changes emit a `configChanged` message the extension plumbs into the next
 * render; the static-preview badge and the selector matched-item are displayed from the render
 * response. Kept DOM-free so every rule is unit-testable without jsdom; `main.ts` applies it.
 */

export const DRAWABLE_STATES = [
  'default',
  'pressed',
  'checked',
  'disabled',
  'focused',
  'selected',
  'activated',
] as const;
export type DrawableStateName = (typeof DRAWABLE_STATES)[number];

export type Backdrop = 'checkerboard' | 'solid';

/** Drawable metadata carried by a render response (feeds the toolbar's picker/badge/matched display). */
export interface DrawableMeta {
  stateSensitive: boolean;
  staticPreviewBadge: boolean;
  matched?: { index: number; stateAttrs: string[] };
}

/** UI-local toolbar state (never re-rendered for backdrop; state/size flow to the extension). */
export interface ToolbarState {
  selectedState: DrawableStateName;
  backdrop: Backdrop;
  sizeText: string;
}

export const initialToolbarState: ToolbarState = {
  selectedState: 'default',
  backdrop: 'checkerboard',
  sizeText: '',
};

/** The state picker is shown only for state-sensitive drawables (P1-D AC3 — hidden otherwise). */
export function pickerVisible(meta: DrawableMeta | undefined): boolean {
  return meta?.stateSensitive === true;
}

/** The drawable state set for a picked option ('default' → no extra states). */
export function statesForSelection(state: DrawableStateName): DrawableStateName[] {
  return state === 'default' ? [] : [state];
}

/**
 * Parse a size-override input: empty → `undefined` (no override), `"WxH"` (or `W×H`) with positive
 * integers → the size, anything else → `null` (invalid — rejected, no message emitted).
 */
export function parseSizeOverride(text: string): { w: number; h: number } | undefined | null {
  const t = text.trim();
  if (t === '') return undefined;
  const m = /^(\d+)\s*[x×]\s*(\d+)$/.exec(t);
  if (!m) return null;
  const w = parseInt(m[1], 10);
  const h = parseInt(m[2], 10);
  if (w <= 0 || h <= 0) return null;
  return { w, h };
}

export type ConfigChangedMessage = {
  type: 'configChanged';
  drawable: { states: DrawableStateName[]; sizeDp?: { w: number; h: number } };
};

/** Build the `configChanged` payload for a state + size override; `{error}` if the size is invalid. */
export function buildConfigChanged(
  state: DrawableStateName,
  sizeText: string,
): ConfigChangedMessage | { error: 'invalidSize' } {
  const size = parseSizeOverride(sizeText);
  if (size === null) return { error: 'invalidSize' };
  const drawable: ConfigChangedMessage['drawable'] = { states: statesForSelection(state) };
  if (size) drawable.sizeDp = size;
  return { type: 'configChanged', drawable };
}

/** The selector matched-item label, e.g. "matched item #2, state_pressed" (P1-D AC2). */
export function matchedLabel(matched: DrawableMeta['matched']): string {
  if (!matched) return '';
  const attrs = matched.stateAttrs.length ? matched.stateAttrs.join(', ') : 'default';
  return `matched item #${matched.index}, ${attrs}`;
}

/** Toggle the (CSS-only) backdrop — never emits a render request (P1-C AC1). */
export function toggleBackdrop(b: Backdrop): Backdrop {
  return b === 'checkerboard' ? 'solid' : 'checkerboard';
}

/** CSS `background` value for a backdrop mode (checkerboard vs solid) — applied webview-side only. */
export function backdropCss(backdrop: Backdrop): string {
  return backdrop === 'solid'
    ? 'var(--vscode-editor-background, #1e1e1e)'
    : 'repeating-conic-gradient(#7f7f7f 0% 25%, #bfbfbf 0% 50%) 50% / 20px 20px';
}
