import { describe, expect, it } from 'vitest';
import {
  DENSITIES,
  DEVICE_PRESETS,
  DRAWABLE_STATES,
  ThemeOption,
  ToolbarState,
  backdropCss,
  buildConfigChanged,
  buildDensityChanged,
  buildDeviceChanged,
  buildNightChanged,
  buildOrientationChanged,
  buildThemeChanged,
  hydrateToolbarState,
  initialToolbarState,
  matchedLabel,
  orderThemesForPicker,
  parseSizeOverride,
  pickerVisible,
  statesForSelection,
  toggleBackdrop,
  toggleOrientation,
} from './toolbar';

describe('drawable toolbar logic (T49, DRW-07/08, P1-C/P1-D)', () => {
  it('offers exactly the P1-D AC1 state set', () => {
    expect([...DRAWABLE_STATES]).toEqual([
      'default',
      'pressed',
      'checked',
      'disabled',
      'focused',
      'selected',
      'activated',
    ]);
  });

  it('shows the picker only for state-sensitive drawables (P1-D AC3)', () => {
    expect(pickerVisible({ stateSensitive: true, staticPreviewBadge: false })).toBe(true);
    expect(pickerVisible({ stateSensitive: false, staticPreviewBadge: false })).toBe(false);
    expect(pickerVisible(undefined)).toBe(false);
  });

  it('maps the default selection to no states, others to a single state', () => {
    expect(statesForSelection('default')).toEqual([]);
    expect(statesForSelection('pressed')).toEqual(['pressed']);
    expect(statesForSelection('disabled')).toEqual(['disabled']);
  });

  it('parses a size override and rejects invalid input', () => {
    expect(parseSizeOverride('')).toBeUndefined();
    expect(parseSizeOverride('  ')).toBeUndefined();
    expect(parseSizeOverride('128x256')).toEqual({ w: 128, h: 256 });
    expect(parseSizeOverride('128 x 256')).toEqual({ w: 128, h: 256 });
    expect(parseSizeOverride('64×64')).toEqual({ w: 64, h: 64 });
    expect(parseSizeOverride('abc')).toBeNull();
    expect(parseSizeOverride('0x10')).toBeNull();
    expect(parseSizeOverride('10x')).toBeNull();
  });

  it('builds a configChanged message for a picked state (P1-D AC2)', () => {
    expect(buildConfigChanged('pressed', '')).toEqual({
      type: 'configChanged',
      drawable: { states: ['pressed'] },
    });
  });

  it('carries a valid size override in the configChanged message (DRW-08)', () => {
    expect(buildConfigChanged('default', '96x96')).toEqual({
      type: 'configChanged',
      drawable: { states: [], sizeDp: { w: 96, h: 96 } },
    });
  });

  it('rejects a configChanged with an invalid size override', () => {
    expect(buildConfigChanged('pressed', 'nope')).toEqual({ error: 'invalidSize' });
  });

  it('labels the matched selector item (P1-D AC2)', () => {
    expect(matchedLabel({ index: 2, stateAttrs: ['state_pressed'] })).toBe('matched item #2, state_pressed');
    expect(matchedLabel({ index: 3, stateAttrs: [] })).toBe('matched item #3, default');
    expect(matchedLabel(undefined)).toBe('');
  });

  it('toggles the backdrop as a CSS-only change (no render request, P1-C AC1)', () => {
    expect(toggleBackdrop('checkerboard')).toBe('solid');
    expect(toggleBackdrop('solid')).toBe('checkerboard');
    // The two backdrops produce distinct CSS and toggling never yields a configChanged message.
    expect(backdropCss('checkerboard')).not.toEqual(backdropCss('solid'));
    expect(backdropCss('checkerboard')).toContain('gradient');
  });
});

describe('configuration toolbar controls (T51, CFG-01..04, P1-E AC1-AC4)', () => {
  it('offers the P1-E AC2 minimum device-preset set', () => {
    expect(DEVICE_PRESETS.map((d) => d.id)).toEqual(['small', 'phone', 'large', 'tablet7', 'tablet10']);
    expect(DEVICE_PRESETS.find((d) => d.id === 'small')).toMatchObject({ widthDp: 360, heightDp: 640 });
    expect(DEVICE_PRESETS.find((d) => d.id === 'phone')).toMatchObject({ widthDp: 411, heightDp: 891 });
    expect(DEVICE_PRESETS.find((d) => d.id === 'large')).toMatchObject({ widthDp: 480, heightDp: 1040 });
  });

  it('offers the P1-E AC3 density bucket set', () => {
    expect([...DENSITIES]).toEqual(['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']);
  });

  it('builds a configChanged patch for the day/night toggle (CFG-01, P1-E AC1)', () => {
    expect(buildNightChanged(true)).toEqual({ type: 'configChanged', night: true });
    expect(buildNightChanged(false)).toEqual({ type: 'configChanged', night: false });
  });

  it('builds a configChanged patch for a device-preset pick (CFG-02, P1-E AC2)', () => {
    expect(buildDeviceChanged('tablet7')).toEqual({ type: 'configChanged', deviceId: 'tablet7' });
  });

  it('toggles and builds a configChanged patch for orientation (CFG-02, P1-E AC2)', () => {
    expect(toggleOrientation('portrait')).toBe('landscape');
    expect(toggleOrientation('landscape')).toBe('portrait');
    expect(buildOrientationChanged('landscape')).toEqual({ type: 'configChanged', orientation: 'landscape' });
  });

  it('builds a configChanged patch for a density pick (CFG-03, P1-E AC3)', () => {
    expect(buildDensityChanged('xxhdpi')).toEqual({ type: 'configChanged', density: 'xxhdpi' });
  });

  it('builds a configChanged patch for a theme pick (CFG-04, P1-E AC4)', () => {
    const theme: ThemeOption = { name: 'Theme.MyApp', isProjectTheme: true, source: 'project' };
    expect(buildThemeChanged(theme)).toEqual({
      type: 'configChanged',
      themeName: 'Theme.MyApp',
      isProjectTheme: true,
    });
  });

  it('orders the theme picker with project themes first (P1-E AC4)', () => {
    const themes: ThemeOption[] = [
      { name: 'Theme.Material3.DayNight', isProjectTheme: false, source: 'material' },
      { name: 'Theme.AppCompat.Light', isProjectTheme: false, source: 'appcompat' },
      { name: 'Theme.MyApp', isProjectTheme: true, source: 'project' },
      { name: 'Theme.MyApp.NoActionBar', isProjectTheme: true, source: 'project' },
    ];
    expect(orderThemesForPicker(themes).map((t) => t.name)).toEqual([
      'Theme.MyApp',
      'Theme.MyApp.NoActionBar',
      'Theme.Material3.DayNight',
      'Theme.AppCompat.Light',
    ]);
  });

  it('hydrates the toolbar config fields from a stored config, leaving drawable/backdrop untouched', () => {
    const state: ToolbarState = { ...initialToolbarState, selectedState: 'pressed', backdrop: 'solid' };
    const hydrated = hydrateToolbarState(state, {
      night: true,
      deviceId: 'tablet10',
      orientation: 'landscape',
      density: 'xxxhdpi',
      themeName: 'Theme.MyApp',
      isProjectTheme: true,
    });
    expect(hydrated.night).toBe(true);
    expect(hydrated.deviceId).toBe('tablet10');
    expect(hydrated.orientation).toBe('landscape');
    expect(hydrated.density).toBe('xxxhdpi');
    expect(hydrated.themeName).toBe('Theme.MyApp');
    expect(hydrated.isProjectTheme).toBe(true);
    // Drawable-only / CSS-only fields are untouched by config hydration.
    expect(hydrated.selectedState).toBe('pressed');
    expect(hydrated.backdrop).toBe('solid');
  });

  it('still builds the drawable configChanged patch without the new config fields present', () => {
    // Backward-compat: T49's message shape (drawable only) must still be exactly what's built.
    expect(buildConfigChanged('pressed', '')).toEqual({
      type: 'configChanged',
      drawable: { states: ['pressed'] },
    });
  });
});
