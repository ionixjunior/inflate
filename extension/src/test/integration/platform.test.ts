import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from './extensionId';
import type { InflateApi } from '../../extension';

/**
 * AD-028: a platform with no published layoutlib natives (Windows or Linux on Arm, other OSes) is
 * refused when a preview opens, before the JDK lookup and the engine download. The runners are all
 * supported, so the test sets `InflateApi.platform` to win32/arm64 for the length of one preview.
 */
suite('Unsupported platform (AD-028)', () => {
  const rootDir = vscode.Uri.file(path.join(os.tmpdir(), 'inflate-platform-test')).fsPath;
  const layoutFile = path.join(rootDir, 'res', 'layout', 'refused.xml');

  suiteSetup(() => {
    fs.mkdirSync(path.dirname(layoutFile), { recursive: true });
    fs.writeFileSync(layoutFile, '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />');
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('refuses win32/arm64 before setup: panel error, a warning with no buttons, no engine folder', async () => {
    const api = await vscode.extensions.getExtension<InflateApi>(EXTENSION_ID)!.activate();
    const realPlatform = api.platform;
    api.platform = { platform: 'win32', arch: 'arm64' };
    try {
      await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(layoutFile));
    } finally {
      api.platform = realPlatform;
    }

    const message =
      'Inflate does not support Windows on arm64: the rendering engine is published for Windows x64, Linux x64 and macOS only.';
    const applied = api.panelManager.lastApplied(layoutFile);
    assert.strictEqual(applied?.status, 'hostError');
    assert.strictEqual(applied?.errorMessage, message);
    assert.deepStrictEqual(api.lastSetupNotice, { text: `Inflate: ${message}`, actions: [] });
    const globalStorageDir = path.dirname(api.panelManager.outputDirPath());
    assert.strictEqual(fs.existsSync(path.join(globalStorageDir, 'engine')), false);
  });
});
