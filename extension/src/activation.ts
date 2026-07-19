/**
 * Activation & Commands (T18, design component #1, UX-01/HOST-01, P1-I AC4/AC5). Wires the real
 * commands, the `inflate:eligibleDocument` context key (a path-heuristic stub until the full
 * `DocumentClassifier` lands in T33), the "Inflate" output channel, and the walking-skeleton
 * preview panel — replacing T6's throwaway `inflate.helloPreview` command with real host wiring.
 *
 * `render` is still stubbed to a structured error on the real host (T13) until Phase 6 (T35), so
 * this walking skeleton proves the FULL wire end-to-end (spawn, initialize, warmup, a real render
 * request/response round-trip, and the resulting image showing in the panel) using an injectable
 * host command — production resolves a real `java` invocation; `extensionTestsEnv` lets the
 * integration test point at `test/fake-host.js` instead (no JDK/JVM needed for the gate).
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { HostManager, HostState } from './host';
import { PreviewConfig, RenderRequest } from './protocol';
import { previewHtml } from './webview';

/** Test-visible API returned from activate() so integration tests can assert behavior. */
export interface InflateApi {
  /** Time spent inside activate() — proves lazy activation (NFR-02, ≤ 200 ms). */
  activationMs: number;
  /** The most recently created/revealed preview panel. */
  lastPanel?: vscode.WebviewPanel;
  /** The HostManager instance backing every command (test hook: state, PID, dispose). */
  hostManager: HostManager;
}

const OUTPUT_CHANNEL_NAME = 'Inflate';

/** Path-heuristic stub for document eligibility (design component #2; full classifier is T33). */
function isPathHeuristicallyEligible(fsPath: string): boolean {
  const normalized = fsPath.replace(/\\/g, '/').toLowerCase();
  const hasResourceDir = /\/(res|resources)\/(layout|drawable|mipmap)[a-z0-9._-]*\//.test(normalized);
  const hasEligibleExtension = /\.(xml|axml)$/.test(normalized);
  return hasResourceDir && hasEligibleExtension;
}

function defaultPreviewConfig(): PreviewConfig {
  return {
    themeName: 'Theme.Material3.DayNight',
    isProjectTheme: false,
    night: false,
    device: { id: 'phone', label: 'Phone', widthDp: 411, heightDp: 891, defaultDensity: 'xhdpi', sizeBucket: 'normal' },
    orientation: 'portrait',
    density: 'xhdpi',
    pixelScale: 1,
  };
}

/** Resolves the host spawn command. In test mode (`INFLATE_TEST_FAKE_HOST` set via
 * `extensionTestsEnv`, T18/T17), spawns the scripted fake host instead of a real JVM — the render
 * RPC is still stubbed on the real host at this phase (T13), so no test needs the real engine. */
function resolveHostCommand(): { command: string; args: string[] } {
  const fakeHostScript = process.env.INFLATE_TEST_FAKE_HOST;
  if (fakeHostScript) {
    return { command: process.execPath, args: [fakeHostScript, process.env.INFLATE_TEST_FAKE_HOST_MODE ?? 'normal'] };
  }
  // Production path: a real JDK (JdkLocator, T14) + installed engine (ArtifactManager, T16) are
  // required before this is reachable; wiring that guided-setup flow into openPreview and
  // assembling the real `java` invocation (host.ts's buildJavaCommand, T17) lands with packaging
  // (the host fat-jar isn't bundled into the VSIX until a later phase).
  throw new Error('Inflate: no render engine configured yet (guided setup lands with packaging).');
}

let renderRequestCounter = 0;
let panelsByDoc = new Map<string, vscode.WebviewPanel>();

export function activate(context: vscode.ExtensionContext): InflateApi {
  const start = Date.now();
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(output);

  const hostManager = new HostManager({
    ...resolveHostCommandOrDeferred(output),
  });
  hostManager.onStateChange((s: HostState) => output.appendLine(`[host] state -> ${s}`));
  hostManager.onStderrLine((line) => output.appendLine(`[host:stderr] ${line}`));

  const api: InflateApi = { activationMs: 0, hostManager };

  void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', false);

  const updateEligibility = (editor: vscode.TextEditor | undefined) => {
    const eligible = editor ? isPathHeuristicallyEligible(editor.document.uri.fsPath) : false;
    void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', eligible);
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateEligibility));
  updateEligibility(vscode.window.activeTextEditor);

  async function openPreviewFor(doc: vscode.TextDocument): Promise<void> {
    const key = doc.uri.toString();
    output.appendLine(`[preview] openPreview requested for ${doc.uri.fsPath}`);

    const existing = panelsByDoc.get(key);
    if (existing) {
      existing.reveal(vscode.ViewColumn.Beside);
    }

    await hostManager.ensureReady();

    const id = ++renderRequestCounter;
    const request: RenderRequest = {
      id,
      docPath: doc.uri.fsPath,
      docKind: 'layout',
      roots: [],
      packageName: 'com.inflate.preview',
      config: defaultPreviewConfig(),
      timeoutMs: 15000,
    };
    output.appendLine(`[render#${id}] dispatching render for ${doc.uri.fsPath}`);
    const response = await hostManager.render(request);
    output.appendLine(`[render#${id}] status=${response.status}`);

    const panel =
      existing ??
      vscode.window.createWebviewPanel('inflate.preview', `Inflate: ${path.basename(doc.uri.fsPath)}`, vscode.ViewColumn.Beside, {
        enableScripts: false,
        localResourceRoots: [context.extensionUri],
      });
    panelsByDoc.set(key, panel);
    api.lastPanel = panel;

    if (response.status === 'ok' && response.pngPath) {
      const imgUri = panel.webview.asWebviewUri(vscode.Uri.file(response.pngPath));
      panel.webview.html = previewHtml({ kind: 'image', imgSrc: imgUri.toString() }, panel.webview.cspSource);
    } else {
      panel.webview.html = previewHtml(
        { kind: 'error', message: response.error?.message ?? 'render failed' },
        panel.webview.cspSource,
      );
    }
    panel.onDidDispose(() => panelsByDoc.delete(key));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('inflate.openPreview', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        void vscode.window.showWarningMessage('Inflate: no active document to preview.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(targetUri);
      await openPreviewFor(doc);
    }),
    vscode.commands.registerCommand('inflate.refreshPreview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await openPreviewFor(editor.document);
    }),
    vscode.commands.registerCommand('inflate.doctor', () => {
      output.appendLine(`[doctor] host state: ${hostManager.getState()}`);
      output.appendLine(`[doctor] host pid: ${hostManager.getChildPid() ?? '(not running)'}`);
      output.show();
    }),
    vscode.commands.registerCommand('inflate.clearEngineCache', () => {
      output.appendLine('[clearEngineCache] requested (ArtifactManager wiring lands with packaging)');
    }),
    vscode.commands.registerCommand('inflate.restartHost', async () => {
      output.appendLine('[restartHost] requested');
      await hostManager.restart();
    }),
  );

  api.activationMs = Date.now() - start;
  return api;
}

/** Wraps {@link resolveHostCommand} so a missing production engine doesn't crash activation
 * itself — errors surface lazily, on the first `ensureReady()` call, via the output channel. */
function resolveHostCommandOrDeferred(output: vscode.OutputChannel): { command: string; args: string[] } {
  try {
    return resolveHostCommand();
  } catch (e) {
    output.appendLine(`[host] deferred configuration error: ${(e as Error).message}`);
    // A command/args pair that will itself fail fast on spawn, surfacing the same message via the
    // host's crash path rather than throwing during activation (NFR-02: activation stays cheap).
    return { command: process.execPath, args: ['-e', `process.stderr.write(${JSON.stringify((e as Error).message)});process.exit(1);`] };
  }
}

/** Terminates the host process (no orphans — NFR-05) and is called by `extension.ts`'s
 * zero-argument `deactivate()` export with the `hostManager` it got back from {@link activate}. */
export function deactivateHost(hostManager: HostManager): Thenable<void> {
  panelsByDoc = new Map();
  return hostManager.dispose();
}
