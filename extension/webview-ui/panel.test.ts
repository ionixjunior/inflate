import { describe, expect, it } from 'vitest';
import {
  initialViewModel,
  reduce,
  toggleWarnings,
  warningCountsByKind,
} from './viewmodel';

describe('webview view model — message contract (T37, design #9)', () => {
  it('setImage shows a fresh, non-stale image and clears error/file-gone', () => {
    const errored = reduce(initialViewModel, {
      type: 'setError',
      message: 'boom',
      warnings: [],
    });
    const vm = reduce({ ...errored, fileGone: true }, {
      type: 'setImage',
      uri: 'vscode-webview://img/1.png',
      width: 100,
      height: 200,
      warnings: [{ kind: 'notice', message: 'ok' }],
    });
    expect(vm.imageUri).toBe('vscode-webview://img/1.png');
    expect(vm.imageWidth).toBe(100);
    expect(vm.stale).toBe(false);
    expect(vm.error).toBeUndefined();
    expect(vm.fileGone).toBe(false);
    expect(vm.warnings).toHaveLength(1);
  });

  it('setError keeps the last good image and marks it stale (UX-04)', () => {
    const withImage = reduce(initialViewModel, {
      type: 'setImage',
      uri: 'img/1.png',
      width: 10,
      height: 10,
      warnings: [],
    });
    const vm = reduce(withImage, {
      type: 'setError',
      message: 'syntax error',
      file: '/a.xml',
      line: 7,
      column: 3,
      warnings: [{ kind: 'unresolvedRef', message: 'x' }],
    });
    expect(vm.error).toEqual({ message: 'syntax error', file: '/a.xml', line: 7, column: 3 });
    expect(vm.imageUri).toBe('img/1.png'); // last good image retained
    expect(vm.stale).toBe(true); // dimmed as stale
  });

  it('setError with no prior image is not stale (nothing to retain)', () => {
    const vm = reduce(initialViewModel, { type: 'setError', message: 'boom', warnings: [] });
    expect(vm.stale).toBe(false);
    expect(vm.imageUri).toBeUndefined();
  });

  it('setImage carries canvasCapped through for the zoom viewport to stop escalating (T52, UX-03)', () => {
    const capped = reduce(initialViewModel, {
      type: 'setImage',
      uri: 'img/1.png',
      width: 10,
      height: 10,
      warnings: [],
      canvasCapped: true,
    });
    expect(capped.canvasCapped).toBe(true);

    const notCapped = reduce(initialViewModel, {
      type: 'setImage',
      uri: 'img/1.png',
      width: 10,
      height: 10,
      warnings: [],
    });
    expect(notCapped.canvasCapped).toBe(false);
  });

  it('setStatus sets a transient status without touching the image', () => {
    const withImage = reduce(initialViewModel, {
      type: 'setImage',
      uri: 'img/1.png',
      width: 1,
      height: 1,
      warnings: [],
    });
    const vm = reduce(withImage, { type: 'setStatus', status: 'rendering…' });
    expect(vm.status).toBe('rendering…');
    expect(vm.imageUri).toBe('img/1.png');
  });

  it('fileGone marks the file gone and dims the retained image', () => {
    const withImage = reduce(initialViewModel, {
      type: 'setImage',
      uri: 'img/1.png',
      width: 1,
      height: 1,
      warnings: [],
    });
    const vm = reduce(withImage, { type: 'fileGone' });
    expect(vm.fileGone).toBe(true);
    expect(vm.stale).toBe(true);
    expect(vm.imageUri).toBe('img/1.png');
  });

  it('setBusy shows the loading indicator with its phase label (POLISH-02)', () => {
    expect(initialViewModel.busy).toBe(false);
    const vm = reduce(initialViewModel, { type: 'setBusy', label: 'Rendering…' });
    expect(vm.busy).toBe(true);
    expect(vm.busyLabel).toBe('Rendering…');
  });

  it('setBusy without a label still shows busy (label undefined)', () => {
    const vm = reduce(initialViewModel, { type: 'setBusy' });
    expect(vm.busy).toBe(true);
    expect(vm.busyLabel).toBeUndefined();
  });

  it('setImage clears busy (POLISH-02/03)', () => {
    const busy = reduce(initialViewModel, { type: 'setBusy', label: 'Starting render host…' });
    const vm = reduce(busy, { type: 'setImage', uri: 'img/1.png', width: 1, height: 1, warnings: [] });
    expect(vm.busy).toBe(false);
    expect(vm.busyLabel).toBeUndefined();
  });

  it('setError clears busy even though the last good image is retained (POLISH-03)', () => {
    const busy = reduce(initialViewModel, { type: 'setBusy', label: 'Rendering…' });
    const vm = reduce(busy, { type: 'setError', message: 'boom', warnings: [] });
    expect(vm.busy).toBe(false);
    expect(vm.busyLabel).toBeUndefined();
  });
});

describe('webview view model — warnings strip', () => {
  it('toggles collapse state', () => {
    expect(initialViewModel.warningsCollapsed).toBe(true);
    const open = toggleWarnings(initialViewModel);
    expect(open.warningsCollapsed).toBe(false);
    expect(toggleWarnings(open).warningsCollapsed).toBe(true);
  });

  it('counts warnings by kind for the strip header', () => {
    const counts = warningCountsByKind([
      { kind: 'unresolvedRef', message: 'a' },
      { kind: 'unresolvedRef', message: 'b' },
      { kind: 'notice', message: 'c' },
    ]);
    expect(counts).toEqual({ unresolvedRef: 2, notice: 1 });
  });
});
