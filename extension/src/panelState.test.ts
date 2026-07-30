import { describe, expect, it } from 'vitest';
import { PanelStateStore, StoreMessage } from './panelState';

describe('PanelStateStore — replay-on-ready snapshot (DF-6, UX-06 AC7)', () => {
  it('replays every message type recorded, in canonical order: config, themes, result, busy', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setConfig', config: { night: false } });
    store.record({ type: 'setThemes', themes: ['a'] });
    store.record({ type: 'setImage', uri: 'img/1.png' });
    store.record({ type: 'setBusy', label: 'Rendering…' });

    expect(store.replay()).toEqual([
      { type: 'setConfig', config: { night: false } },
      { type: 'setThemes', themes: ['a'] },
      { type: 'setImage', uri: 'img/1.png' },
      { type: 'setBusy', label: 'Rendering…' },
    ]);
  });

  it('latest-wins: two setImage messages replay only the newest', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setImage', uri: 'img/1.png' });
    store.record({ type: 'setImage', uri: 'img/2.png' });

    expect(store.replay()).toEqual([{ type: 'setImage', uri: 'img/2.png' }]);
  });

  it('error-after-ok replays [last-good setImage, setError] — stale display (AC1)', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setImage', uri: 'img/1.png' });
    store.record({ type: 'setError', message: 'boom' });

    expect(store.replay()).toEqual([
      { type: 'setImage', uri: 'img/1.png' },
      { type: 'setError', message: 'boom' },
    ]);
  });

  it('fileGone after a good image replays only fileGone — no stale-image prefix (distinct from setError)', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setImage', uri: 'img/1.png' });
    store.record({ type: 'fileGone' });

    expect(store.replay()).toEqual([{ type: 'fileGone' }]);
  });

  it('busy replays only the latest label, and only while unsettled', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setBusy', label: 'Preparing…' });
    store.record({ type: 'setBusy', label: 'Rendering…' });

    expect(store.replay()).toEqual([{ type: 'setBusy', label: 'Rendering…' }]);
  });

  it('a settling message (setImage/setError/fileGone) clears busy — no stuck spinner on replay', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setBusy', label: 'Rendering…' });
    store.record({ type: 'setImage', uri: 'img/1.png' });

    expect(store.replay()).toEqual([{ type: 'setImage', uri: 'img/1.png' }]);
  });

  it('deriveConfig, when supplied, replaces the stored config slot at replay time (AC5)', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setConfig', config: { night: false } });

    const fresh: StoreMessage = { type: 'setConfig', config: { night: true } };
    expect(store.replay(() => fresh)).toEqual([fresh]);
  });

  it('no-loss: every message recorded while not-ready is represented in the replay (FP-1 AC7 heir)', () => {
    const store = new PanelStateStore();
    store.record({ type: 'setConfig', config: { night: true } });
    store.record({ type: 'setThemes', themes: ['a', 'b'] });
    store.record({ type: 'setBusy', label: 'Preparing engine…' });
    store.record({ type: 'setBusy', label: 'Rendering…' });
    store.record({ type: 'setImage', uri: 'img/1.png' });

    // Every slot (config, themes, result) is represented; busy was cleared by the settling setImage.
    expect(store.replay()).toEqual([
      { type: 'setConfig', config: { night: true } },
      { type: 'setThemes', themes: ['a', 'b'] },
      { type: 'setImage', uri: 'img/1.png' },
    ]);
  });

  it('replays nothing when no message was ever recorded', () => {
    expect(new PanelStateStore().replay()).toEqual([]);
  });
});
