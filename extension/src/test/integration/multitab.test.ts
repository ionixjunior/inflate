import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from './extensionId';
import type { InflateApi } from '../../extension';
import type { RenderResponse } from '../../protocol';

/**
 * DF-6 (UX-06) multi-tab preview fix. Drives REAL webview panels under test-electron — the fake-host
 * integration suite (hotreload/config/drawable) never opened two previews and hid one, and the
 * jsdom webview-ui suite never destroys its DOM, so both gates were structurally blind to webview
 * lifecycle (third real-webview-behavior escape after AD-017/AD-018). Root cause: every preview
 * panel is created with `retainContextWhenHidden: false`; opening a second preview stacks it in the
 * same tab group (both open via `inflate.openPreview` with no source editor shown, so neither has a
 * distinct "active editor" column to be `Beside`) and hides the first — VS Code destroys its webview
 * context, and pre-fix nothing re-delivers its state when it's revealed again (permanent blank).
 *
 * Reveal is simulated by calling `.reveal()` directly on the captured `vscode.WebviewPanel` — exactly
 * what a user's tab click does — rather than re-invoking `inflate.openPreview`, which always
 * dispatches an unconditional fresh render (its `'reopen'` cause) and would mask every hidden-state
 * scenario below under an unrelated, immediately-settling re-render.
 */
suite('Inflate multi-tab preview (DF-6, UX-06)', () => {
  const rootDir = path.join(os.tmpdir(), 'inflate-multitab-test');
  const layoutDir = path.join(rootDir, 'res', 'layout');
  const valuesDir = path.join(rootDir, 'res', 'values');
  const fileA = path.join(layoutDir, 'a.xml');
  const fileB = path.join(layoutDir, 'b.xml');
  const colorsFile = path.join(valuesDir, 'colors.xml');
  const validLayout = '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />';

  suiteSetup(() => {
    fs.mkdirSync(layoutDir, { recursive: true });
    fs.mkdirSync(valuesDir, { recursive: true });
    fs.writeFileSync(fileA, validLayout);
    fs.writeFileSync(fileB, validLayout);
    fs.writeFileSync(colorsFile, '<resources><color name="bg">#FFFFFF</color></resources>');
  });

  suiteTeardown(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  async function api(): Promise<InflateApi> {
    const ext = vscode.extensions.getExtension<InflateApi>(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be present`);
    return ext.activate();
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('condition not met within timeout');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /** Show `file`'s source editor in column one — mirrors the real repro: the user triggers "Open
   * Preview" from a focused source editor, and `preserveFocus` on the created panel leaves that same
   * editor (column one) active afterwards, so a SECOND `openPreview` (from another focused source
   * editor) resolves `ViewColumn.Beside` against column one both times and reuses the same side
   * group — stacking both previews as tabs there, exactly like the field report. */
  async function showEditor(file: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
  }

  /** Open `file` in an editor, apply `edit` (dirtying it), then save (fires onDidSaveTextDocument). */
  async function editAndSave(file: string, newContent: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    await editor.edit((b) => b.replace(new vscode.Range(0, 0, doc.lineCount, 0), newContent));
    const saved = await doc.save();
    assert.ok(saved, `expected ${path.basename(file)} to save`);
  }

  /** Pin a fixed (non-'fit') zoom before opening `file`. The webview's zoom-to-fit computation
   * against the fake host's 1x1 test PNG and a real (non-zero) stage viewport can escalate past the
   * 200% pixel-scale threshold (T52/UX-03, unrelated to DF-6) and post its own `configChanged` back —
   * a real, pre-existing side effect of running the ACTUAL bundled webview script that would
   * otherwise race the assertions below. A fixed percent short-circuits `resolveZoomPercent` (never
   * crosses the threshold), keeping these tests deterministic. */
  async function pinZoom(a: InflateApi, file: string): Promise<void> {
    a.configStore.update(file, { zoom: 100 });
  }

  /** Open A, then open B beside it — B stacks as a second tab in A's group (per `showEditor`'s doc
   * comment) and hides A's webview. Waits for both to settle, and returns A's panel (captured before
   * B steals it) so the caller can reveal it directly later without re-invoking the command. */
  async function openAThenHideWithB(a: InflateApi): Promise<vscode.WebviewPanel> {
    await pinZoom(a, fileA);
    await pinZoom(a, fileB);
    await showEditor(fileA);
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileA));
    await waitFor(
      () => a.panelManager.lastApplied(fileA)?.status === 'ok' && (a.panelManager.lastApplied(fileA)?.replayCount ?? 0) >= 1,
    );
    const panelA = a.lastPanel!;

    await showEditor(fileB);
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileB));
    await waitFor(() => a.panelManager.lastApplied(fileB)?.status === 'ok');

    return panelA;
  }

  /** Reveal A directly (a real tab click never goes through `inflate.openPreview` — that command
   * always dispatches an unconditional fresh render, which would contaminate every scenario below)
   * and wait for its next replay. */
  async function revealA(a: InflateApi, panelA: vscode.WebviewPanel, replaysBefore: number): Promise<void> {
    panelA.reveal(undefined, /* preserveFocus */ true);
    await waitFor(() => (a.panelManager.lastApplied(fileA)?.replayCount ?? 0) > replaysBefore);
  }

  test('revealing a hidden preview tab re-delivers its state instead of coming back blank (RED-first repro, AC1/AC2/AC7)', async function () {
    this.timeout(30000);
    const a = await api();

    const panelA = await openAThenHideWithB(a);
    const replaysAfterFirstOpen = a.panelManager.lastApplied(fileA)!.replayCount;
    assert.strictEqual(replaysAfterFirstOpen, 1, 'the first open replays exactly once');

    // Reveal A again. Pre-fix: the reloaded webview's `ready` flushes an empty pending queue —
    // replayCount never advances and the panel stays blank forever (this assertion is the RED repro,
    // recorded pre-fix in this task's commit body). Post-fix: the store replays A's full snapshot.
    await revealA(a, panelA, replaysAfterFirstOpen);

    const applied = a.panelManager.lastApplied(fileA)!;
    assert.strictEqual(applied.status, 'ok', 'A must still show its last successful render after being revealed');
    assert.ok(
      applied.replayCount > replaysAfterFirstOpen,
      'revealing A must trigger a fresh replay — its webview context was destroyed and reloaded',
    );
  });

  test("saving a hidden preview's file lands a fresh result, shown on reveal (T100, AC2)", async function () {
    this.timeout(30000);
    const a = await api();
    const panelA = await openAThenHideWithB(a);
    const replaysBefore = a.panelManager.lastApplied(fileA)!.replayCount;
    const beforeId = a.panelManager.lastApplied(fileA)!.responseId!;

    // A is hidden — the scheduler still renders on save (background/eager, user decision 2026-07-29);
    // the fresh result is applied but silently dropped webview-side (dead context) until reveal.
    await editAndSave(fileA, `<!-- touched while hidden -->\n${validLayout}`);
    await waitFor(() => (a.panelManager.lastApplied(fileA)?.responseId ?? 0) > beforeId);
    const freshId = a.panelManager.lastApplied(fileA)!.responseId!;

    await revealA(a, panelA, replaysBefore);

    const applied = a.panelManager.lastApplied(fileA)!;
    assert.strictEqual(applied.status, 'ok');
    assert.strictEqual(applied.responseId, freshId, 'reveal must show the result rendered while hidden, not a stale one');
  });

  test('a save fanning out to two open previews leaves both fresh, visible or hidden (T100, AC3)', async function () {
    this.timeout(30000);
    const a = await api();
    await openAThenHideWithB(a); // A hidden, B visible
    const beforeA = a.panelManager.lastApplied(fileA)!.responseId!;
    const beforeB = a.panelManager.lastApplied(fileB)!.responseId!;

    // A shared values dependency: saving it fans out to every open preview under the same res root
    // (UX-02), regardless of visibility.
    await editAndSave(colorsFile, '<resources><color name="bg">#000000</color></resources>');
    await waitFor(() => (a.panelManager.lastApplied(fileA)?.responseId ?? 0) > beforeA);
    await waitFor(() => (a.panelManager.lastApplied(fileB)?.responseId ?? 0) > beforeB);

    assert.strictEqual(a.panelManager.lastApplied(fileA)!.status, 'ok', 'the hidden dependent must land its fresh render too');
    assert.strictEqual(a.panelManager.lastApplied(fileB)!.status, 'ok', 'the visible dependent updates live as today');
  });

  test('a config change made after open survives a hide/reveal cycle — never a stale open-time copy (T100, AC5)', async function () {
    this.timeout(30000);
    const a = await api();

    await pinZoom(a, fileA);
    await pinZoom(a, fileB);
    await showEditor(fileA);
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileA));
    await waitFor(
      () => a.panelManager.lastApplied(fileA)?.status === 'ok' && (a.panelManager.lastApplied(fileA)?.replayCount ?? 0) >= 1,
    );
    assert.strictEqual(a.panelManager.lastConfigSent(fileA)?.night, false, 'A opens with night off by default');
    const panelA = a.lastPanel!;

    // Change the config WHILE A is still open and visible — mirrors the webview toolbar's own
    // configChanged message (bypassing the DOM, same as config.test.ts's CFG-01..05 suite).
    const beforeId = a.panelManager.lastApplied(fileA)!.responseId!;
    a.panelManager.deliverWebviewMessage(fileA, { type: 'configChanged', night: true });
    await waitFor(() => (a.panelManager.lastApplied(fileA)?.responseId ?? 0) > beforeId);
    assert.strictEqual(a.configStore.get(fileA).preview.night, true, 'ConfigStore must hold the new value');
    const replaysBefore = a.panelManager.lastApplied(fileA)!.replayCount;

    // Hide A behind B, then reveal it directly (no re-invocation of inflate.openPreview).
    await showEditor(fileB);
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileB));
    await waitFor(() => a.panelManager.lastApplied(fileB)?.status === 'ok');
    await revealA(a, panelA, replaysBefore);

    assert.strictEqual(
      a.panelManager.lastConfigSent(fileA)?.night,
      true,
      'the replayed config must reflect ConfigStore truth (post-change) — never a cached open-time copy',
    );
  });

  test('deleting the previewed file while its tab is hidden shows file-gone on reveal (T100, edge case)', async function () {
    this.timeout(30000);
    const a = await api();
    const panelA = await openAThenHideWithB(a); // A hidden, B visible
    const replaysBefore = a.panelManager.lastApplied(fileA)!.replayCount;

    // Simulates activation.ts's onDidDeleteFiles listener firing while A's tab is hidden.
    a.panelManager.markFileGone(fileA);

    await revealA(a, panelA, replaysBefore);

    assert.strictEqual(a.panelManager.lastApplied(fileA)!.status, 'fileGone', 'reveal must show the file-gone notice');
  });

  test('a host-level failure settling while hidden replays as an error over the dimmed prior image (T100, edge case)', async function () {
    this.timeout(30000);
    const a = await api();
    const panelA = await openAThenHideWithB(a); // A hidden, B visible
    const replaysBefore = a.panelManager.lastApplied(fileA)!.replayCount;

    a.panelManager.applyHostError(fileA, new Error('simulated host crash while hidden'));

    await revealA(a, panelA, replaysBefore);

    const applied = a.panelManager.lastApplied(fileA)!;
    assert.strictEqual(applied.status, 'hostError');
    assert.strictEqual(applied.hasStaleImage, true, 'the prior good image must still be flagged for stale display');
    assert.match(applied.errorMessage ?? '', /simulated host crash while hidden/);
  });

  test('revealing a tab mid-render shows the busy phase, then settles into the result (T100, edge case)', async function () {
    this.timeout(30000);
    const a = await api();
    const panelA = await openAThenHideWithB(a); // A hidden, B visible
    const replaysBefore = a.panelManager.lastApplied(fileA)!.replayCount;

    // A render is in flight for hidden A — recorded but never live-posted (dead webview context).
    a.panelManager.setBusy(fileA, 'Rendering…');
    assert.strictEqual(a.panelManager.lastApplied(fileA)!.busy, true);

    await revealA(a, panelA, replaysBefore); // reveal mid-render
    assert.strictEqual(a.panelManager.lastApplied(fileA)!.busy, true, 'the busy phase must still show right after reveal');

    // The in-flight render settles.
    const response: RenderResponse = {
      id: 999,
      status: 'ok',
      pngPath: path.join(rootDir, 'settled.png'),
      imageWidth: 1,
      imageHeight: 1,
      warnings: [],
      dependencies: [],
      timings: { prepareMs: 0, inflateMs: 0, renderMs: 0, totalMs: 0 },
      sessionRebuilt: false,
    };
    a.panelManager.applyResult(fileA, response);

    assert.strictEqual(a.panelManager.lastApplied(fileA)!.busy, false, 'settling must clear the busy phase — no stuck spinner');
    assert.strictEqual(a.panelManager.lastApplied(fileA)!.status, 'ok');
  });
});
