/**
 * ConfigStore (T50, design component #8, CFG-05, P1-E AC5). The single per-file preview
 * configuration store: the wire-level `PreviewConfig` (theme/night/device/orientation/density/
 * pixelScale/drawable — everything a render request needs) plus webview-only UI state (zoom) that
 * is still persisted per file but never crosses the render protocol. Normalized by resolved file
 * path in `workspaceState` so the same document reopened under a different path spelling still
 * lands on one entry (CFG-05 "restore it when the preview reopens").
 *
 * Replaces the ad-hoc `drawableConfigs` map + `defaultPreviewConfig()` that lived in `activation.ts`
 * before this task — this is now the only source of truth for per-file preview configuration.
 */

import * as path from 'path';
import { Density, DevicePreset, DrawableState, Orientation, PreviewConfig } from './protocol';

/** Minimal persistence surface ConfigStore needs — structurally matches `vscode.Memento`, so
 * `context.workspaceState` can be passed directly; tests supply a plain in-memory implementation. */
export interface ConfigMemento {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/** `'fit'` = fit-to-window (default); a number is a persisted manual zoom percent (25-400, UX-03). */
export type ZoomSetting = 'fit' | number;

/** Per-file stored config: the wire-level `PreviewConfig` plus webview-only UI state (design #8). */
export interface StoredPreviewConfig {
  preview: PreviewConfig;
  zoom: ZoomSetting;
}

/** The P1-E AC2 minimum device-preset set (small/modern/large phone, 7"/10" tablet). */
export const DEVICE_PRESETS: readonly DevicePreset[] = [
  { id: 'small', label: 'Small phone', widthDp: 360, heightDp: 640, defaultDensity: 'hdpi', sizeBucket: 'normal' },
  { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
  { id: 'large', label: 'Large phone', widthDp: 480, heightDp: 1040, defaultDensity: 'xxhdpi', sizeBucket: 'normal' },
  { id: 'tablet7', label: '7" Tablet', widthDp: 600, heightDp: 1024, defaultDensity: 'xhdpi', sizeBucket: 'large' },
  { id: 'tablet10', label: '10" Tablet', widthDp: 800, heightDp: 1280, defaultDensity: 'xhdpi', sizeBucket: 'xlarge' },
];
const DEFAULT_DEVICE = DEVICE_PRESETS[1]; // "phone", the design's stated default (411x891 dp)

/** The P1-E AC3 density bucket set. */
export const DENSITIES: readonly Density[] = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

const DEFAULT_THEME = 'Theme.Material3.DayNight';
const STORAGE_KEY = 'inflate.previewConfig';

/** A partial update to a document's stored config — only named fields change (CFG-01..04, UX-03). */
export interface PreviewConfigPatch {
  themeName?: string;
  isProjectTheme?: boolean;
  night?: boolean;
  deviceId?: string;
  /** A layout's edge-drag resize (fix-pack POLISH-07) — becomes a transient `'custom'` device
   * preset. A `deviceId` patch (picking any built-in preset) always takes precedence and drops it. */
  customSize?: { w: number; h: number };
  orientation?: Orientation;
  density?: Density;
  pixelScale?: 1 | 2;
  drawable?: { states: DrawableState[]; sizeDp?: { w: number; h: number } };
  zoom?: ZoomSetting;
}

function deviceById(id: string): DevicePreset {
  return DEVICE_PRESETS.find((d) => d.id === id) ?? DEFAULT_DEVICE;
}

/** The size-bucket threshold devices use (design's stated 7"/10" tablet cutoffs at 600/800 dp width;
 * `DEVICE_PRESETS`' own 600->large, 800->xlarge). */
function sizeBucketForWidth(widthDp: number): DevicePreset['sizeBucket'] {
  if (widthDp >= 720) return 'xlarge';
  if (widthDp >= 600) return 'large';
  return 'normal';
}

/** Builds the transient `'custom'` device preset for a layout's edge-drag resize (fix-pack
 * POLISH-07, FP-3 AC5) — `defaultDensity` mirrors the document's CURRENT density (not a fixed
 * default), since a custom size doesn't imply any particular density bucket. */
function customDevicePreset(size: { w: number; h: number }, density: Density): DevicePreset {
  return {
    id: 'custom',
    label: `Custom (${size.w}×${size.h} dp)`,
    widthDp: size.w,
    heightDp: size.h,
    defaultDensity: density,
    sizeBucket: sizeBucketForWidth(size.w),
  };
}

/** The defaults chain (design component #8): manifest theme hint (if any) else the bundled
 * DayNight theme; modern phone; xhdpi; portrait; day; fit zoom. */
function defaults(manifestThemeHint?: string): StoredPreviewConfig {
  return {
    preview: {
      themeName: manifestThemeHint ?? DEFAULT_THEME,
      isProjectTheme: manifestThemeHint !== undefined,
      night: false,
      device: DEFAULT_DEVICE,
      orientation: 'portrait',
      density: DEFAULT_DEVICE.defaultDensity as Density,
      pixelScale: 1,
    },
    zoom: 'fit',
  };
}

/** Normalizes a document path so two spellings of the same file (relative segments, redundant
 * separators, etc.) resolve to one persisted entry (CFG-05 per-file isolation). */
function normalize(docPath: string): string {
  return path.resolve(docPath);
}

type StoredMap = Record<string, StoredPreviewConfig>;

export class ConfigStore {
  private readonly listeners: Array<(docPath: string, config: StoredPreviewConfig) => void> = [];

  constructor(private readonly memento: ConfigMemento) {}

  /** The current stored config for `docPath`, or the defaults chain if nothing was ever persisted.
   * `manifestThemeHint` (`RootsInfo.manifestTheme`) affects only the *default* theme — once a config
   * has been persisted for this file (any field), the stored theme wins on every subsequent read. */
  get(docPath: string, manifestThemeHint?: string): StoredPreviewConfig {
    const all = this.memento.get<StoredMap>(STORAGE_KEY) ?? {};
    return all[normalize(docPath)] ?? defaults(manifestThemeHint);
  }

  /** Merge `patch` into the document's stored config (creating it from defaults if absent), persist
   * it, and notify listeners. Returns the resulting config. */
  update(docPath: string, patch: PreviewConfigPatch, manifestThemeHint?: string): StoredPreviewConfig {
    const key = normalize(docPath);
    const all = { ...(this.memento.get<StoredMap>(STORAGE_KEY) ?? {}) };
    const current = all[key] ?? defaults(manifestThemeHint);
    const density = patch.density ?? current.preview.density;
    const device =
      patch.deviceId !== undefined
        ? deviceById(patch.deviceId)
        : patch.customSize !== undefined
          ? customDevicePreset(patch.customSize, density)
          : current.preview.device;
    const next: StoredPreviewConfig = {
      preview: {
        themeName: patch.themeName ?? current.preview.themeName,
        isProjectTheme: patch.isProjectTheme ?? current.preview.isProjectTheme,
        night: patch.night ?? current.preview.night,
        device,
        orientation: patch.orientation ?? current.preview.orientation,
        density,
        pixelScale: patch.pixelScale ?? current.preview.pixelScale,
        drawable: patch.drawable ?? current.preview.drawable,
      },
      zoom: patch.zoom ?? current.zoom,
    };
    all[key] = next;
    void this.memento.update(STORAGE_KEY, all);
    for (const cb of this.listeners) cb(key, next);
    return next;
  }

  /** Subscribe to config changes for any document; returns a disposer. */
  onChange(cb: (docPath: string, config: StoredPreviewConfig) => void): { dispose(): void } {
    this.listeners.push(cb);
    return {
      dispose: () => {
        const i = this.listeners.indexOf(cb);
        if (i >= 0) this.listeners.splice(i, 1);
      },
    };
  }
}
