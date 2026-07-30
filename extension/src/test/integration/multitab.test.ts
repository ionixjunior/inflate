import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from './extensionId';
import type { InflateApi } from '../../extension';

/**
 * DF-6 (UX-06) multi-tab preview fix. Drives REAL webview panels under test-electron — the fake-host
 * integration suite (hotreload/config/drawable) never opened two previews and hid one, and the
 * jsdom webview-ui suite never destroys its DOM, so both gates were structurally blind to webview
 * lifecycle (third real-webview-behavior escape after AD-017/AD-018). Root cause: every preview
 * panel is created with `retainContextWhenHidden: false`; opening a second preview stacks it in the
 * same tab group (both open via `inflate.openPreview` with no source editor shown, so neither has a
 * distinct "active editor" column to be `Beside`) and hides the first — VS Code destroys its webview
 * context, and pre-fix nothing re-delivers its state when it's revealed again (permanent blank).
 */
suite('Inflate multi-tab preview (DF-6, UX-06)', () => {
  const rootDir = path.join(os.tmpdir(), 'inflate-multitab-test');
  const layoutDir = path.join(rootDir, 'res', 'layout');
  const fileA = path.join(layoutDir, 'a.xml');
  const fileB = path.join(layoutDir, 'b.xml');
  const validLayout = '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />';

  suiteSetup(() => {
    fs.mkdirSync(layoutDir, { recursive: true });
    fs.writeFileSync(fileA, validLayout);
    fs.writeFileSync(fileB, validLayout);
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

  test('revealing a hidden preview tab re-delivers its state instead of coming back blank (RED-first repro, AC1/AC2/AC7)', async function () {
    this.timeout(30000);
    const a = await api();

    await showEditor(fileA);
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileA));
    // The render can settle before the (real, Electron) webview finishes loading and signals its
    // first `ready` — wait for both, so `replaysAfterFirstOpen` reflects an actual completed replay.
    await waitFor(
      () => a.panelManager.lastApplied(fileA)?.status === 'ok' && (a.panelManager.lastApplied(fileA)?.replayCount ?? 0) >= 1,
    );
    const replaysAfterFirstOpen = a.panelManager.lastApplied(fileA)!.replayCount;
    assert.strictEqual(replaysAfterFirstOpen, 1, 'the first open replays exactly once');

    // Opens B beside column one (still active — preserveFocus kept it there) — VS Code reuses the
    // existing side group where A's panel lives, stacking B as a second tab there and hiding A's
    // webview (destroyed, retainContextWhenHidden: false).
    await showEditor(fileB);
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileB));
    await waitFor(() => a.panelManager.lastApplied(fileB)?.status === 'ok');

    // Reveal A again. Pre-fix: the reloaded webview's `ready` flushes an empty pending queue —
    // replayCount never advances and the panel stays blank forever (this assertion is the RED repro,
    // recorded pre-fix in this task's commit body). Post-fix: the store replays A's full snapshot.
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fileA));
    await waitFor(() => (a.panelManager.lastApplied(fileA)?.replayCount ?? 0) > replaysAfterFirstOpen);

    const applied = a.panelManager.lastApplied(fileA)!;
    assert.strictEqual(applied.status, 'ok', 'A must still show its last successful render after being revealed');
    assert.ok(
      applied.replayCount > replaysAfterFirstOpen,
      'revealing A must trigger a fresh replay — its webview context was destroyed and reloaded',
    );
  });
});
