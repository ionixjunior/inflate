import { describe, expect, it } from 'vitest';
import {
  DENSITIES,
  DEVICE_PRESETS,
  DRAWABLE_STATES,
  ORIENTATION_OPTIONS,
  ThemeOption,
  ToolbarState,
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
  pickerVisible,
  statesForSelection,
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

  it('builds a configChanged message for a picked state, states only (P1-D AC2, POLISH-06)', () => {
    expect(buildConfigChanged('pressed')).toEqual({
      type: 'configChanged',
      drawable: { states: ['pressed'] },
    });
    expect(buildConfigChanged('default')).toEqual({
      type: 'configChanged',
      drawable: { states: [] },
    });
  });

  it('labels the matched selector item (P1-D AC2)', () => {
    expect(matchedLabel({ index: 2, stateAttrs: ['state_pressed'] })).toBe('matched item #2, state_pressed');
    expect(matchedLabel({ index: 3, stateAttrs: [] })).toBe('matched item #3, default');
    expect(matchedLabel(undefined)).toBe('');
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

  it('builds a configChanged patch for an orientation pick (CFG-02, P1-E AC2)', () => {
    expect(buildOrientationChanged('landscape')).toEqual({ type: 'configChanged', orientation: 'landscape' });
    expect(buildOrientationChanged('portrait')).toEqual({ type: 'configChanged', orientation: 'portrait' });
  });

  it('offers exactly two orientation options, Portrait first (FP-4 AC1/AC2)', () => {
    expect(ORIENTATION_OPTIONS.map((o) => o.value)).toEqual(['portrait', 'landscape']);
    expect(ORIENTATION_OPTIONS[0]).toEqual({ value: 'portrait', label: 'Portrait' });
    expect(ORIENTATION_OPTIONS[1]).toEqual({ value: 'landscape', label: 'Landscape' });
    // Portrait is first/default (initialToolbarState.orientation, FP-4 AC2).
    expect(initialToolbarState.orientation).toBe('portrait');
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

  it('hydrates the toolbar config fields from a stored config, leaving the drawable state untouched', () => {
    const state: ToolbarState = { ...initialToolbarState, selectedState: 'pressed' };
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
    // Drawable-only fields are untouched by config hydration.
    expect(hydrated.selectedState).toBe('pressed');
  });
});
