import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ConfigMemento, ConfigStore, DEVICE_PRESETS } from './config';

/** A plain in-memory Memento — structurally the same surface `context.workspaceState` offers, so
 * ConfigStore is exercised the same way it will be by the real extension. */
function fakeMemento(): ConfigMemento {
  const data: Record<string, unknown> = {};
  return {
    get: <T>(key: string) => data[key] as T | undefined,
    update: (key: string, value: unknown) => {
      data[key] = value;
      return Promise.resolve();
    },
  };
}

describe('ConfigStore (T50, CFG-05, P1-E AC5, design #8 defaults chain)', () => {
  it('defaults to the bundled DayNight theme with no manifest hint', () => {
    const store = new ConfigStore(fakeMemento());
    const config = store.get('/proj/res/layout/main.xml');
    expect(config.preview.themeName).toBe('Theme.Material3.DayNight');
    expect(config.preview.isProjectTheme).toBe(false);
    expect(config.preview.night).toBe(false);
    expect(config.preview.device).toEqual(DEVICE_PRESETS.find((d) => d.id === 'phone'));
    expect(config.preview.orientation).toBe('portrait');
    expect(config.preview.density).toBe('xhdpi');
    expect(config.preview.pixelScale).toBe(1);
    expect(config.zoom).toBe('fit');
  });

  it('defaults to the manifest theme hint as a project theme when one is supplied', () => {
    const store = new ConfigStore(fakeMemento());
    const config = store.get('/proj/res/layout/main.xml', 'Theme.MyApp');
    expect(config.preview.themeName).toBe('Theme.MyApp');
    expect(config.preview.isProjectTheme).toBe(true);
  });

  it('persists a patch and returns it on a later get() (round-trips through the memento)', () => {
    const memento = fakeMemento();
    const store = new ConfigStore(memento);
    store.update('/proj/res/layout/main.xml', { night: true, density: 'xxhdpi' });

    // A brand new ConfigStore instance backed by the SAME memento proves this is real persistence,
    // not just in-memory instance state (mirrors workspaceState surviving a panel reopen).
    const reopened = new ConfigStore(memento);
    const config = reopened.get('/proj/res/layout/main.xml');
    expect(config.preview.night).toBe(true);
    expect(config.preview.density).toBe('xxhdpi');
  });

  it('isolates config per file — updating one document never affects another', () => {
    const store = new ConfigStore(fakeMemento());
    store.update('/proj/res/layout/a.xml', { night: true });
    store.update('/proj/res/layout/b.xml', { density: 'mdpi' });

    expect(store.get('/proj/res/layout/a.xml').preview.night).toBe(true);
    expect(store.get('/proj/res/layout/a.xml').preview.density).toBe('xhdpi'); // untouched default
    expect(store.get('/proj/res/layout/b.xml').preview.night).toBe(false); // untouched default
    expect(store.get('/proj/res/layout/b.xml').preview.density).toBe('mdpi');
  });

  it('normalizes two spellings of the same file path to a single stored entry', () => {
    const store = new ConfigStore(fakeMemento());
    store.update('/proj/res/layout/../layout/main.xml', { night: true });
    // A differently-spelled but equivalent path (redundant "layout/../layout" segment) must read
    // back the SAME entry, not a fresh default.
    const config = store.get('/proj/res/layout/main.xml');
    expect(config.preview.night).toBe(true);
  });

  it('resolves a device preset patch to the full DevicePreset object', () => {
    const store = new ConfigStore(fakeMemento());
    const config = store.update('/proj/res/layout/main.xml', { deviceId: 'tablet7' });
    expect(config.preview.device).toEqual(DEVICE_PRESETS.find((d) => d.id === 'tablet7'));
  });

  it('loads a previously persisted entry that still has the v1 backdrop field, ignoring it harmlessly (fix-pack POLISH-01)', () => {
    const key = path.resolve('/proj/res/layout/main.xml');
    // A raw stored entry shaped like data ConfigStore wrote before POLISH-01 removed the field.
    const legacyData: Record<string, unknown> = {
      [key]: {
        preview: {
          themeName: 'Theme.Material3.DayNight',
          isProjectTheme: false,
          night: true,
          device: DEVICE_PRESETS.find((d) => d.id === 'phone'),
          orientation: 'portrait',
          density: 'xhdpi',
          pixelScale: 1,
        },
        backdrop: 'solid',
        zoom: 'fit',
      },
    };
    const memento: ConfigMemento = {
      get: <T>(k: string) => (k === 'inflate.previewConfig' ? (legacyData as T) : undefined),
      update: () => Promise.resolve(),
    };
    const store = new ConfigStore(memento);
    const config = store.get('/proj/res/layout/main.xml');
    expect(config.preview.night).toBe(true);
    expect(config.preview.themeName).toBe('Theme.Material3.DayNight');
    expect(config.zoom).toBe('fit');
  });

  it('fires a change event with the document path and the resulting config on every update', () => {
    const store = new ConfigStore(fakeMemento());
    const events: Array<{ docPath: string; night: boolean }> = [];
    const sub = store.onChange((docPath, config) => events.push({ docPath, night: config.preview.night }));

    store.update('/proj/res/layout/main.xml', { night: true });
    expect(events).toHaveLength(1);
    expect(events[0].night).toBe(true);
    expect(events[0].docPath).toContain('main.xml');

    sub.dispose();
    store.update('/proj/res/layout/main.xml', { night: false });
    expect(events).toHaveLength(1); // no further events after disposing the subscription
  });
});
