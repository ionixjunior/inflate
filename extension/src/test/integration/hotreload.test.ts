import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from './extensionId';
import type { InflateApi } from '../../extension';

/**
 * T37 hot-reload integration test (P1-A/F, UX-02/04). Drives the real activation → RenderScheduler →
 * HostManager → PreviewPanelManager loop; the host is the scripted fake (`fake-host.js`, injected in
 * runTest.ts) which reflects document content so ok/error transitions are observable. Render fidelity
 * itself is covered host-side (engineTest, T35); here we prove the extension-side loop.
 */
suite('Inflate hot reload (T37)', () => {
  const rootDir = path.join(os.tmpdir(), 'inflate-hotreload-test');
  const layoutDir = path.join(rootDir, 'res', 'layout');
  const valuesDir = path.join(rootDir, 'res', 'values');
  const mainFile = path.join(layoutDir, 'main.xml');
  const colorsFile = path.join(valuesDir, 'colors.xml');

  const validLayout = '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />';

  suiteSetup(() => {
    fs.mkdirSync(layoutDir, { recursive: true });
    fs.mkdirSync(valuesDir, { recursive: true });
    fs.writeFileSync(mainFile, validLayout);
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

  /** Open `file` in an editor, apply `edit` (dirtying it), then save (fires onDidSaveTextDocument). */
  async function editAndSave(file: string, newContent: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    await editor.edit((b) =>
      b.replace(new vscode.Range(0, 0, doc.lineCount, 0), newContent),
    );
    const saved = await doc.save();
    assert.ok(saved, `expected ${path.basename(file)} to save`);
  }

  test('openPreview renders an image and reveals (not duplicates) on re-open', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));

    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    assert.strictEqual(a.panelManager.lastApplied(mainFile)!.status, 'ok');
    const countAfterFirst = a.panelManager.panelCount();

    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    assert.strictEqual(
      a.panelManager.panelCount(),
      countAfterFirst,
      'a second openPreview on the same document must reveal, not duplicate, the panel',
    );
  });

  test('saving the layout re-renders the preview', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    await editAndSave(mainFile, `<!-- touched -->\n${validLayout}`);
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    assert.strictEqual(a.panelManager.lastApplied(mainFile)!.status, 'ok');
    assert.ok(a.panelManager.lastApplied(mainFile)!.responseId! > beforeId, 'save should trigger a new render');
  });

  test('saving a values dependency re-renders the open preview', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');
    const beforeId = a.panelManager.lastApplied(mainFile)!.responseId!;

    await editAndSave(colorsFile, '<resources><color name="bg">#000000</color></resources>');
    await waitFor(() => (a.panelManager.lastApplied(mainFile)?.responseId ?? 0) > beforeId);

    assert.ok(
      a.panelManager.lastApplied(mainFile)!.responseId! > beforeId,
      'a dependency (values) save should re-render the dependent preview',
    );
  });

  test('a syntax error shows the error while retaining the last good render (stale)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(mainFile));
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'ok');

    // The fake host returns a structured error for content carrying the INFLATE_ERROR sentinel.
    await editAndSave(mainFile, `<!-- INFLATE_ERROR -->\n${validLayout}`);
    await waitFor(() => a.panelManager.lastApplied(mainFile)?.status === 'error');

    const applied = a.panelManager.lastApplied(mainFile)!;
    assert.strictEqual(applied.status, 'error');
    assert.strictEqual(applied.hasStaleImage, true, 'the last good render must be retained as stale');
  });
});
