import { describe, expect, it } from 'vitest';
import {
  DRAWABLE_STATES,
  backdropCss,
  buildConfigChanged,
  matchedLabel,
  parseSizeOverride,
  pickerVisible,
  statesForSelection,
  toggleBackdrop,
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
