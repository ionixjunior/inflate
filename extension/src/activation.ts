/**
 * Activation & Commands (T18/T37, design component #1, UX-01/02/HOST-01, P1-A/F/I). Wires the real
 * commands, the `inflate:eligibleDocument` context key (real DocumentClassifier, T33), the "Inflate"
 * output channel, and the hot-reload preview loop: RenderScheduler (T36) → HostManager → render →
 * PreviewPanelManager (T37). Saves and refreshes flow through the scheduler; results are applied to
 * the per-document panel via the webview message contract.
 *
 * The host command is injectable — production resolves a real `java` invocation; `extensionTestsEnv`
 * points the integration tests at `test/fake-host.js` (no JDK/JVM needed for the gate).
 */

import * as fs from 'fs';
import * as vscode from 'vscode';
import { classify, isEligible } from './classifier';
import { ConfigStore, PreviewConfigPatch } from './config';
import { HostManager, HostState } from './host';
import { PreviewPanelManager } from './panel';
import { Density, DocKind, Orientation } from './protocol';
import { ResourceRootResolver } from './roots';
import { RenderScheduler } from './scheduler';

/** Test-visible API returned from activate() so integration tests can assert behavior. */
export interface InflateApi {
  /** Time spent inside activate() — proves lazy activation (NFR-02, ≤ 200 ms). */
  activationMs: number;
  /** The most recently created/revealed preview panel. */
  lastPanel?: vscode.WebviewPanel;
  /** The HostManager instance backing every command (test hook: state, PID, dispose). */
  hostManager: HostManager;
  /** The panel manager (test hook: panel count, last applied result per document). */
  panelManager: PreviewPanelManager;
}

const OUTPUT_CHANNEL_NAME = 'Inflate';

/**
 * Document eligibility for the `inflate:eligibleDocument` context key (T33, design component #2). A
 * cheap path-only classify is enough to gate the editor-title button / context menu: a file whose
 * path already places it under a previewable resource-type dir is eligible; for anything else we
 * sniff the document's first bytes (open documents are already in memory) so a `<vector>` outside a
 * standard tree still lights up.
 */
function isEligibleDocument(editor: vscode.TextEditor | undefined): boolean {
  if (!editor) return false;
  const fsPath = editor.document.uri.fsPath;
  const byPath = classify(fsPath);
  if (isEligible(byPath)) return true;
  // Fall back to a root-element sniff of the in-memory buffer (first ~40 lines).
  const lastLine = Math.min(editor.document.lineCount - 1, 40);
  const firstKb = editor.document.getText(new vscode.Range(0, 0, lastLine, 0));
  return isEligible(classify(fsPath, firstKb));
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

export function activate(context: vscode.ExtensionContext): InflateApi {
  const start = Date.now();
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(output);

  const hostManager = new HostManager({
    ...resolveHostCommandOrDeferred(output),
  });
  hostManager.onStateChange((s: HostState) => output.appendLine(`[host] state -> ${s}`));
  hostManager.onStderrLine((line) => output.appendLine(`[host:stderr] ${line}`));

  const rootsResolver = new ResourceRootResolver();
  const outputDir = vscode.Uri.joinPath(context.globalStorageUri, 'renders');
  try {
    fs.mkdirSync(outputDir.fsPath, { recursive: true });
  } catch {
    /* created lazily by the host otherwise */
  }

  // Single per-file preview-config store (T50, CFG-05) — absorbs the ad-hoc drawableConfigs map +
  // defaultPreviewConfig() that used to live here; workspaceState persists it across reopens.
  const configStore = new ConfigStore(context.workspaceState);

  const scheduler = new RenderScheduler({
    host: {
      render: (req) => hostManager.render(req),
      invalidate: (paths) => hostManager.invalidate({ paths }),
    },
    resolveRoots: (docPath) => {
      const info = rootsResolver.resolve(docPath);
      return { roots: info.roots, packageName: info.packageName };
    },
    classify: (docPath) => {
      const c = classify(docPath);
      return (c.kind === 'unsupported' ? 'layout' : c.kind) as DocKind;
    },
    getConfig: (docPath: string) => {
      const manifestTheme = rootsResolver.resolve(docPath).manifestTheme;
      return configStore.get(docPath, manifestTheme).preview;
    },
    readBuffer: (docPath) =>
      vscode.workspace.textDocuments.find((d) => d.uri.fsPath === docPath)?.getText() ?? '',
    onResult: (docPath, response) => {
      output.appendLine(`[render] ${docPath} -> ${response.status} (id=${response.id})`);
      panelManager.applyResult(docPath, response);
    },
    onHostError: (docPath, error) => {
      output.appendLine(`[render] ${docPath} host error: ${error.message}`);
      panelManager.applyHostError(docPath, error);
    },
  });

  const panelManager = new PreviewPanelManager(
    context,
    output,
    outputDir,
    (docPath) => scheduler.refresh(docPath),
    (docPath, patch) => {
      configStore.update(docPath, {
        drawable: patch.drawable as PreviewConfigPatch['drawable'],
        night: patch.night,
        deviceId: patch.deviceId,
        orientation: patch.orientation as Orientation | undefined,
        density: patch.density as Density | undefined,
        themeName: patch.themeName,
        isProjectTheme: patch.isProjectTheme,
      });
      scheduler.notifyConfigChanged(docPath);
    },
  );

  const api: InflateApi = { activationMs: 0, hostManager, panelManager };

  void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', false);

  const updateEligibility = (editor: vscode.TextEditor | undefined) => {
    void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', isEligibleDocument(editor));
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateEligibility));
  updateEligibility(vscode.window.activeTextEditor);

  async function openPreviewFor(doc: vscode.TextDocument): Promise<void> {
    output.appendLine(`[preview] openPreview requested for ${doc.uri.fsPath}`);
    api.lastPanel = panelManager.openFor(doc);
    await hostManager.ensureReady();
    scheduler.requestRender(doc.uri.fsPath, 'reopen');
    // Await the first render so callers (and the walking-skeleton test) observe a settled host.
    await scheduler.settled(doc.uri.fsPath);
  }

  // Hot reload: a save re-renders the document itself and every open preview that depends on it.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((d) => scheduler.notifyFileSaved(d.uri.fsPath)),
  );
  // File-gone: mark previews whose source was deleted.
  context.subscriptions.push(
    vscode.workspace.onDidDeleteFiles((e) => {
      for (const uri of e.files) panelManager.markFileGone(uri.fsPath);
    }),
  );

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
      scheduler.refresh(editor.document.uri.fsPath);
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
  return hostManager.dispose();
}
