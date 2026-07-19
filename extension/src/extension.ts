import * as path from 'path';
import * as vscode from 'vscode';
import { helloHtml } from './webview';

/** Test-visible API returned from activate() so integration tests can assert behavior. */
export interface InflateApi {
  /** Time spent inside activate() — proves lazy activation (NFR-02, ≤ 200 ms). */
  activationMs: number;
  /** The most recently created preview panel (M0 throwaway hook). */
  lastPanel?: vscode.WebviewPanel;
}

export function activate(context: vscode.ExtensionContext): InflateApi {
  const start = Date.now();
  const api: InflateApi = { activationMs: 0 };

  // Lazy activation: only a context-key stub + one command registration. No engine, host,
  // artifact, or JDK work happens here (that is all deferred to first preview in later phases).
  void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', false);

  const command = vscode.commands.registerCommand('inflate.helloPreview', () => {
    const mediaRoot = vscode.Uri.file(path.join(context.extensionPath, 'media'));
    const panel = vscode.window.createWebviewPanel(
      'inflate.hello',
      'Inflate Hello Preview',
      vscode.ViewColumn.Beside,
      { enableScripts: false, localResourceRoots: [mediaRoot] },
    );
    const imgUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'hello.png'));
    panel.webview.html = helloHtml(imgUri.toString(), panel.webview.cspSource);
    api.lastPanel = panel;
    return panel;
  });
  context.subscriptions.push(command);

  api.activationMs = Date.now() - start;
  return api;
}

export function deactivate(): void {
  // no-op in M0
}
