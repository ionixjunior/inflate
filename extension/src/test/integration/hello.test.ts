import * as assert from 'assert';
import * as vscode from 'vscode';
import type { InflateApi } from '../../extension';

suite('Inflate M0 hello preview', () => {
  test('activation is lazy and helloPreview opens a panel showing an image', async () => {
    const ext = vscode.extensions.getExtension<InflateApi>('inflate.inflate');
    assert.ok(ext, 'extension inflate.inflate should be present');

    const api = await ext.activate();
    // Lazy activation: our activate() does only trivial work (NFR-02, ≤ 200 ms).
    assert.ok(api.activationMs <= 200, `activation took ${api.activationMs}ms (>200)`);

    await vscode.commands.executeCommand('inflate.helloPreview');
    assert.ok(api.lastPanel, 'a preview panel should have been created');

    const html = api.lastPanel!.webview.html;
    assert.ok(html.includes('<img'), 'panel html should contain an img element');
    assert.ok(html.includes('hello.png'), 'img should point at the sample png');
  });
});
