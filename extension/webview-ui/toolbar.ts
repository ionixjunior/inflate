/**
 * Pure drawable + config toolbar logic (T49/T51, DRW-07/08, P1-C AC1, P1-D AC1/AC3, CFG-01..04,
 * P1-E AC1-AC4). The webview toolbar for a document offers a drawable state picker (hidden when the
 * drawable is not state-sensitive), a backdrop toggle (checkerboard/solid — a CSS-only swap that
 * never triggers a re-render), a size override, and the configuration controls: day/night, a device
 * preset dropdown (5 built-ins), an orientation toggle, a density dropdown (5 buckets), and a theme
 * picker fed by the `listThemes` RPC (project themes first, then bundled). Every config control emits
 * a `configChanged` message the extension plumbs into the next render (unlike the CSS-only backdrop);
 * the static-preview badge and the selector matched-item are displayed from the render response. Kept
 * DOM-free so every rule is unit-testable without jsdom; `main.ts` applies it.
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

export type Orientation = 'portrait' | 'landscape';
export type Density = 'mdpi' | 'hdpi' | 'xhdpi' | 'xxhdpi' | 'xxxhdpi';
export const DENSITIES: readonly Density[] = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

export interface DevicePresetOption {
  id: string;
  label: string;
  widthDp: number;
  heightDp: number;
}

/** The P1-E AC2 minimum device-preset set (kept in sync by hand with `extension/src/config.ts`'s
 * `DEVICE_PRESETS` — the webview bundle never imports the Node extension source, T37 convention). */
export const DEVICE_PRESETS: readonly DevicePresetOption[] = [
  { id: 'small', label: 'Small phone', widthDp: 360, heightDp: 640 },
  { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891 },
  { id: 'large', label: 'Large phone', widthDp: 480, heightDp: 1040 },
  { id: 'tablet7', label: '7" Tablet', widthDp: 600, heightDp: 1024 },
  { id: 'tablet10', label: '10" Tablet', widthDp: 800, heightDp: 1280 },
];

export type ThemeSource = 'project' | 'material' | 'appcompat' | 'platform';

/** A theme offered by the picker (CFG-04) — fed by the `listThemes` RPC result. */
export interface ThemeOption {
  name: string;
  isProjectTheme: boolean;
  source: ThemeSource;
}

/** UI-local toolbar state: drawable state/size/backdrop (T49) plus the config controls (T51). Every
 * field except `backdrop` and `sizeText`'s CSS-only siblings flows to the extension via
 * `configChanged` and triggers a re-render. */
export interface ToolbarState {
  selectedState: DrawableStateName;
  backdrop: Backdrop;
  sizeText: string;
  night: boolean;
  deviceId: string;
  orientation: Orientation;
  density: Density;
  themeName: string;
  isProjectTheme: boolean;
}

export const initialToolbarState: ToolbarState = {
  selectedState: 'default',
  backdrop: 'checkerboard',
  sizeText: '',
  night: false,
  deviceId: 'phone',
  orientation: 'portrait',
  density: 'xhdpi',
  themeName: 'Theme.Material3.DayNight',
  isProjectTheme: false,
};

/** Hydrate the toolbar's config fields from a persisted/stored config (ConfigStore, CFG-05, P1-E
 * AC5) — leaves the drawable-only fields (`selectedState`, `sizeText`) and `backdrop` untouched, since
 * they are addressed by the drawable toolbar's own hydration path. */
export function hydrateToolbarState(
  state: ToolbarState,
  stored: {
    night: boolean;
    deviceId: string;
    orientation: Orientation;
    density: Density;
    themeName: string;
    isProjectTheme: boolean;
  },
): ToolbarState {
  return {
    ...state,
    night: stored.night,
    deviceId: stored.deviceId,
    orientation: stored.orientation,
    density: stored.density,
    themeName: stored.themeName,
    isProjectTheme: stored.isProjectTheme,
  };
}

/** Orders a theme list for the picker: project themes first (P1-E AC4), preserving each group's
 * relative order otherwise. */
export function orderThemesForPicker(themes: readonly ThemeOption[]): ThemeOption[] {
  return [...themes.filter((t) => t.isProjectTheme), ...themes.filter((t) => !t.isProjectTheme)];
}

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

/**
 * `configChanged` covers the drawable state/size patch (T49) and the T51 config controls — every
 * field is optional so each control can emit just its own change; the extension merges whatever
 * fields are present into ConfigStore and always re-renders (CFG-01..04, P1-E AC1-AC4).
 */
export type ConfigChangedMessage = {
  type: 'configChanged';
  drawable?: { states: DrawableStateName[]; sizeDp?: { w: number; h: number } };
  night?: boolean;
  deviceId?: string;
  orientation?: Orientation;
  density?: Density;
  themeName?: string;
  isProjectTheme?: boolean;
};

/** Build the `configChanged` payload for a state + size override; `{error}` if the size is invalid. */
export function buildConfigChanged(
  state: DrawableStateName,
  sizeText: string,
): ConfigChangedMessage | { error: 'invalidSize' } {
  const size = parseSizeOverride(sizeText);
  if (size === null) return { error: 'invalidSize' };
  const drawable: NonNullable<ConfigChangedMessage['drawable']> = { states: statesForSelection(state) };
  if (size) drawable.sizeDp = size;
  return { type: 'configChanged', drawable };
}

/** Build the `configChanged` payload for the day/night toggle (CFG-01, P1-E AC1). */
export function buildNightChanged(night: boolean): ConfigChangedMessage {
  return { type: 'configChanged', night };
}

/** Build the `configChanged` payload for a device-preset pick (CFG-02, P1-E AC2). */
export function buildDeviceChanged(deviceId: string): ConfigChangedMessage {
  return { type: 'configChanged', deviceId };
}

/** Build the `configChanged` payload for the orientation toggle (CFG-02, P1-E AC2). */
export function buildOrientationChanged(orientation: Orientation): ConfigChangedMessage {
  return { type: 'configChanged', orientation };
}

/** Build the `configChanged` payload for a density pick (CFG-03, P1-E AC3). */
export function buildDensityChanged(density: Density): ConfigChangedMessage {
  return { type: 'configChanged', density };
}

/** Build the `configChanged` payload for a theme pick (CFG-04, P1-E AC4). */
export function buildThemeChanged(theme: ThemeOption): ConfigChangedMessage {
  return { type: 'configChanged', themeName: theme.name, isProjectTheme: theme.isProjectTheme };
}

/** Toggle the orientation (CFG-02). */
export function toggleOrientation(o: Orientation): Orientation {
  return o === 'portrait' ? 'landscape' : 'portrait';
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
