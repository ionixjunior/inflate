import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { EXTENSION_ID } from './extensionId';
import type { InflateApi } from '../../extension';

/**
 * T18 walking-skeleton integration test (design M1, P1-I AC4/AC5). Drives `inflate.openPreview`
 * through the REAL activation/command/HostManager/panel wiring; the host process itself is the
 * scripted fake (T17's `fake-host.js`, injected via `INFLATE_TEST_FAKE_HOST` in `runTest.ts`) so
 * the test proves the extension's own wiring — spawn, initialize, warmup, a render round-trip,
 * and the resulting image appearing in the panel — without needing a real JDK or the ~170 MB engine
 * (the real host's `render` RPC is still stubbed to an error until Phase 6, T35).
 */
suite('Inflate walking skeleton (T18)', () => {
  const fixtureDir = path.join(os.tmpdir(), 'inflate-skeleton-test', 'res', 'layout');
  const fixtureFile = path.join(fixtureDir, 'hello.xml');

  suiteSetup(() => {
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(
      fixtureFile,
      '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />',
    );
  });

  suiteTeardown(() => {
    fs.rmSync(path.join(os.tmpdir(), 'inflate-skeleton-test'), { recursive: true, force: true });
  });

  test('openPreview spawns the host, initializes, renders, and shows the image in a panel', async () => {
    const ext = vscode.extensions.getExtension<InflateApi>(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} should be present`);

    const api = await ext.activate();
    assert.ok(api.activationMs <= 200, `activation took ${api.activationMs}ms (>200)`);
    assert.strictEqual(api.hostManager.getState(), 'stopped', 'host should not spawn until the first preview');

    await vscode.commands.executeCommand('inflate.openPreview', vscode.Uri.file(fixtureFile));

    assert.strictEqual(api.hostManager.getState(), 'ready', 'host should be ready after a successful render');
    const pid = api.hostManager.getChildPid();
    assert.ok(pid && pid > 0, 'host child process should have a real PID while ready');

    assert.ok(api.lastPanel, 'a preview panel should have been created');
    const html = api.lastPanel!.webview.html;
    assert.ok(html.includes('<img'), 'panel html should contain an img element for a successful render');
    assert.ok(!html.includes('id="error"'), 'panel should not show the error state');
  });

  test('deactivate() leaves no orphan process', async () => {
    const ext = vscode.extensions.getExtension<InflateApi>(EXTENSION_ID);
    const api = await ext!.activate();
    // Reuses the state from the previous test in this suite (activation happens once per host).
    const pid = api.hostManager.getChildPid();
    assert.ok(pid, 'expected a running host child before deactivation');

    // `deactivate()` is normally invoked by VS Code itself; call it directly here since the
    // Extension Development Host does not tear down the extension between tests in one run.
    // IMPORTANT: VS Code actually loaded the esbuild bundle at `dist/extension.js` (package.json's
    // "main") — that is a SEPARATE module instance from this test's own tsc-compiled
    // `out/extension.js`, each with its own module-level `currentApi`. Requiring the wrong one
    // would call deactivate() on a module that was never activated, leaving the real child alive.
    const distExtensionPath = path.join(__dirname, '../../../dist/extension.js');
    const extensionApi = require(distExtensionPath) as typeof import('../../extension');
    await extensionApi.deactivate();

    assert.ok(isProcessDead(pid!), 'host child process should have exited after deactivate()');
  });
});

function isProcessDead(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0: existence check only — throws ESRCH if the process is gone
    return false;
  } catch {
    return true;
  }
}
