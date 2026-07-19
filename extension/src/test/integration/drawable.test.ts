import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { InflateApi } from '../../extension';

/**
 * T49 drawable-toolbar integration test (DRW-07, P1-D AC1/AC2). Drives the real activation →
 * RenderScheduler → HostManager → PreviewPanelManager loop with the scripted fake host (which
 * reflects a selector as state-sensitive and returns the matched item for the picked state). Proves
 * the extension-side toolbar loop: a state pick re-renders and surfaces the matched item; the picker
 * is shown only for a state-sensitive drawable.
 */
suite('Inflate drawable toolbar (T49)', () => {
  const rootDir = path.join(os.tmpdir(), 'inflate-drawable-test');
  const drawableDir = path.join(rootDir, 'res', 'drawable');
  const selectorFile = path.join(drawableDir, 'sel.xml');
  const shapeFile = path.join(drawableDir, 'box.xml');

  const selectorXml =
    '<selector xmlns:android="http://schemas.android.com/apk/res/android">' +
    '<item android:state_pressed="true"><shape android:shape="rectangle"><solid android:color="#FFFF0000"/></shape></item>' +
    '<item><shape android:shape="rectangle"><solid android:color="#FF0000FF"/></shape></item></selector>';
  const shapeXml =
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">' +
    '<solid android:color="#FF00FF00"/></shape>';

  suiteSetup(() => {
    fs.mkdirSync(drawableDir, { recursive: true });
    fs.writeFileSync(selectorFile, selectorXml);
    fs.writeFileSync(shapeFile, shapeXml);
  });

  suiteTeardown(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  async function api(): Promise<InflateApi> {
    const ext = vscode.extensions.getExtension<InflateApi>('inflate.inflate');
    assert.ok(ext, 'extension inflate.inflate should be present');
    return ext.activate();
  }

  async function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) throw new Error('condition not met within timeout');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  test('picking pressed re-renders the selector and shows the matched item (P1-D AC2)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(selectorFile));
    await waitFor(() => a.panelManager.lastApplied(selectorFile)?.status === 'ok');

    const before = a.panelManager.lastApplied(selectorFile)!;
    assert.strictEqual(before.stateSensitive, true, 'a selector is state-sensitive (picker shown)');
    assert.deepStrictEqual(
      before.matchedStateItem,
      { index: 3, stateAttrs: [] },
      'default state matches the catch-all item',
    );
    const beforeId = before.responseId!;

    // Simulate the toolbar posting a state pick (the extension-side loop; no live webview DOM).
    a.panelManager.deliverWebviewMessage(selectorFile, {
      type: 'configChanged',
      drawable: { states: ['pressed'] },
    });

    await waitFor(() => (a.panelManager.lastApplied(selectorFile)?.responseId ?? 0) > beforeId);
    const after = a.panelManager.lastApplied(selectorFile)!;
    assert.strictEqual(after.status, 'ok');
    assert.ok(after.responseId! > beforeId, 'picking a state must trigger a new render');
    assert.deepStrictEqual(
      after.matchedStateItem,
      { index: 0, stateAttrs: ['state_pressed'] },
      'pressed selects the state_pressed item (matched-item indicator)',
    );
  });

  test('a non-state-sensitive drawable hides the picker (P1-D AC3)', async () => {
    const a = await api();
    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(shapeFile));
    await waitFor(() => a.panelManager.lastApplied(shapeFile)?.status === 'ok');

    const applied = a.panelManager.lastApplied(shapeFile)!;
    assert.strictEqual(applied.stateSensitive, false, 'a plain shape is not state-sensitive');
    assert.strictEqual(applied.matchedStateItem, undefined, 'a non-selector has no matched item');
  });
});
