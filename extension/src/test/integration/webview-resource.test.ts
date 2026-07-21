import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanelManager } from '../../panel';

/**
 * Regression test for the real webview image-load seam — the one the fake-host integration tests
 * never exercised (a genuine rendered PNG loaded through a real VS Code webview via `asWebviewUri` +
 * `localResourceRoots`). A user hit HTTP 401 on every render PNG: the broken-image glyph with the
 * shell's alt text, while the toolbar/script rendered fine.
 *
 * Root cause: `context.globalStorageUri` is `vscode-userdata`-scheme on desktop VS Code, so the
 * panel's `outputDir` (joined onto it) is a `vscode-userdata` resource root. Building the image URI
 * as `Uri.file(pngPath)` produced a `file:`-scheme resource under that root → scheme mismatch →
 * the webview resource service returns 401 ("not in localResourceRoots"). The webview *script* loads
 * fine because it sits under `context.extensionUri`, which IS `file:`-scheme — hence shell-renders,
 * image-broken. Fix: `PreviewPanelManager.imageWebviewUri` joins the basename onto the SAME
 * `outputDir` Uri, so the resource inherits the root's scheme.
 *
 * This test loads through a real webview under a `vscode-userdata` root (mimicking globalStorage) and
 * proves (a) the naive `Uri.file(pngPath)` construction fails as it did in the wild, and (b) the
 * shipped helper loads.
 */
suite('webview resource loading (401 regression)', () => {
  // A valid 1x1 PNG (opaque red).
  const PNG_1X1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'inflate-webview-repro-'));
  // Mimic ".../Application Support/.../globalStorage/<ext>/renders" — a path with a space, exposed
  // under a `vscode-userdata`-scheme root exactly like the real ExtensionContext.globalStorageUri.
  const rendersDir = path.join(tmpRoot, 'Application Support', 'globalStorage', 'inflate', 'renders');
  const pngPath = path.join(rendersDir, 'render__11.png');
  const userdataRoot = vscode.Uri.file(rendersDir).with({ scheme: 'vscode-userdata' });

  suiteSetup(() => {
    fs.mkdirSync(rendersDir, { recursive: true });
    fs.writeFileSync(pngPath, PNG_1X1);
  });
  suiteTeardown(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

  /** Load `uri` as an <img> inside a webview rooted at `root` (CSP mirrors panel.ts); resolve outcome. */
  async function loadsInWebview(root: vscode.Uri, uri: string): Promise<boolean> {
    const panel = vscode.window.createWebviewPanel('inflate.repro', 'repro', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: false,
      localResourceRoots: [root],
    });
    try {
      const outcome = new Promise<boolean>((resolve) => {
        const sub = panel.webview.onDidReceiveMessage((m) => {
          sub.dispose();
          resolve(!!m.ok);
        });
        setTimeout(() => resolve(false), 8000);
      });
      panel.webview.html = `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; img-src ${panel.webview.cspSource} data:; script-src 'unsafe-inline';" />
        </head><body><img id="p" /><script>
          const vs = acquireVsCodeApi();
          const img = document.getElementById('p');
          img.onload = () => vs.postMessage({ ok: true });
          img.onerror = () => vs.postMessage({ ok: false });
          img.src = ${JSON.stringify(uri)};
        </script></body></html>`;
      return await outcome;
    } finally {
      panel.dispose();
    }
  }

  test('a file: resource under a vscode-userdata root fails (documents the 401)', async () => {
    const panel = vscode.window.createWebviewPanel('inflate.repro2', 'repro2', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [userdataRoot],
    });
    const naiveUri = panel.webview.asWebviewUri(vscode.Uri.file(pngPath)).toString() + '?v=11';
    panel.dispose();
    const loaded = await loadsInWebview(userdataRoot, naiveUri);
    assert.strictEqual(loaded, false, 'naive Uri.file(pngPath) under a vscode-userdata root should 401 (the bug)');
  });

  test('PreviewPanelManager.imageWebviewUri loads under a vscode-userdata root (the fix)', async () => {
    const panel = vscode.window.createWebviewPanel('inflate.repro3', 'repro3', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [userdataRoot],
    });
    const fixedUri = PreviewPanelManager.imageWebviewUri(panel.webview, userdataRoot, pngPath) + '?v=11';
    panel.dispose();
    const loaded = await loadsInWebview(userdataRoot, fixedUri);
    assert.strictEqual(loaded, true, 'imageWebviewUri (joined onto the root) must load under a vscode-userdata root');
  });
});
