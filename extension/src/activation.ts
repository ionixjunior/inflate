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
import * as path from 'path';
import * as vscode from 'vscode';
import { ArtifactManager, EngineManifest, HostArch } from './artifacts';
import { classify, isEligible } from './classifier';
import { ConfigStore, PreviewConfigPatch } from './config';
import { assembleDoctorReport, DoctorRenderTimings, formatDoctorReport } from './doctor';
import { singleFlight } from './gate';
import { HostManager, HostState, buildJavaCommand } from './host';
import { GuidedError, isGuidedError, JdkLocator } from './jdk';
import { PHASE_PREPARING_ENGINE, PHASE_RENDERING, PHASE_STARTING_HOST, preparingEnginePhase } from './loadingPhases';
import { HydratedConfig, PreviewPanelManager, ThemeOption } from './panel';
import { Density, DocKind, ENGINE_PACKAGE_NAME, Orientation, parseThemeInfoList } from './protocol';
import { defaultDeps as defaultRootsDeps, ResourceRootResolver } from './roots';
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
  /** The per-file config store (test hook: assert persistence/restore, T50/T53). */
  configStore: ConfigStore;
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
  let hostReadySince: number | undefined;
  hostManager.onStateChange((s: HostState) => {
    output.appendLine(`[host] state -> ${s}`);
    hostReadySince = s === 'ready' ? Date.now() : undefined;
  });
  hostManager.onStderrLine((line) => output.appendLine(`[host:stderr] ${line}`));

  // Real JDK detection + engine-artifact install (T14/T16) — lazy, first-preview-triggered
  // (P1-H AC1, NFR-02). Skipped entirely under the fake-host test harness (T17/T18).
  const jdkLocator = new JdkLocator();
  const isFakeHostMode = Boolean(process.env.INFLATE_TEST_FAKE_HOST);
  let lastRenderTimings: DoctorRenderTimings | undefined;

  // T79 (HOST-04 AC4): every real-host configuration attempt — whichever caller triggers it first
  // (openPreview, a scheduler retry, restartHost) — funnels through this ONE single-flight gate, so
  // a render landing mid-download joins the running install instead of racing a second one. A
  // settled (including failed) attempt is never memoized — the next call always re-runs setup, so a
  // no-JDK/offline failure retries on the next request rather than sticking forever.
  const configureRealHostGated = singleFlight((onPhase?: (label: string) => void) =>
    prepareRealHost(context, output, hostManager, jdkLocator, onPhase),
  );

  /** Runs {@link prepareRealHost} (gated, no-op under the fake-host test harness) and, on failure,
   * shows the guided JDK setup message with download/re-check actions (P1-H AC2/AC3) instead of
   * attempting a render. Returns whether the caller may proceed to `ensureReady()`. `onPhase` (fix-
   * pack POLISH-02) mirrors the "Preparing render engine…" loading phase — including download
   * artifact/percent — into the panel's busy indicator (only the FIRST concurrent caller's `onPhase`
   * actually drives it, per the shared gate). `docPath`, when supplied, clears that busy indicator
   * into a settled error on failure (fix-pack POLISH-02/03 edge case: "the in-panel indicator SHALL
   * clear to the error state, not spin forever") — omitted by callers with no specific panel (e.g.
   * `inflate.restartHost`). */
  async function ensureRealHostConfigured(docPath?: string, onPhase?: (label: string) => void): Promise<boolean> {
    if (isFakeHostMode) return true;
    const result = await configureRealHostGated(onPhase);
    if (result.ok) return true;
    if (docPath) panelManager.applyHostError(docPath, new Error(result.guidedMessage));
    const actions = result.downloadUrl ? ['Open Download Page', 'Re-check'] : ['Re-check'];
    void vscode.window.showWarningMessage(`Inflate: ${result.guidedMessage}`, ...actions).then((choice) => {
      if (choice === 'Open Download Page' && result.downloadUrl) {
        void vscode.env.openExternal(vscode.Uri.parse(result.downloadUrl));
      } else if (choice === 'Re-check') {
        jdkLocator.invalidate();
      }
    });
    return false;
  }

  // T60: wire the real `inflate.resourceRoots` setting + workspace root (previously always `[]` /
  // undefined via roots.ts's defaultDeps() — the setting was designed and tested at the unit level
  // but never actually read from real VS Code configuration until now).
  const rootsResolver = new ResourceRootResolver({
    ...defaultRootsDeps(),
    getConfiguredRoots: () => vscode.workspace.getConfiguration('inflate').get<string[]>('resourceRoots') ?? [],
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  });
  const outputDir = vscode.Uri.joinPath(context.globalStorageUri, 'renders');
  try {
    fs.mkdirSync(outputDir.fsPath, { recursive: true });
  } catch {
    /* created lazily by the host otherwise */
  }

  // Single per-file preview-config store (T50, CFG-05) — absorbs the ad-hoc drawableConfigs map +
  // defaultPreviewConfig() that used to live here; workspaceState persists it across reopens.
  const configStore = new ConfigStore(context.workspaceState);

  /** Re-derive the persisted per-file config (ConfigStore) fresh — passed to `PreviewPanelManager`
   * so it can re-hydrate the toolbar/viewport on EVERY webview `ready` (DF-6, UX-06 AC5), not just
   * once at open time; ConfigStore is the source of truth, so replaying a stale open-time copy after
   * a post-open toolbar change would revert it. Also tells the webview the document's kind (layout
   * vs drawable) and any active custom device size, so an edge-drag resize (fix-pack POLISH-07)
   * routes correctly and restores its "Custom (W×H dp)" picker entry on reopen. */
  function hydratePanelConfig(docPath: string): HydratedConfig {
    const manifestTheme = rootsResolver.resolve(docPath).manifestTheme;
    const stored = configStore.get(docPath, manifestTheme);
    // Mirrors the scheduler's own classify() mapping just below: unsupported documents preview as
    // layouts (T60 convention).
    const classified = classify(docPath);
    const docKind: 'layout' | 'drawable' = classified.kind === 'layout' || classified.kind === 'unsupported' ? 'layout' : 'drawable';
    return {
      themeName: stored.preview.themeName,
      isProjectTheme: stored.preview.isProjectTheme,
      night: stored.preview.night,
      deviceId: stored.preview.device.id,
      orientation: stored.preview.orientation,
      density: stored.preview.density,
      zoom: stored.zoom,
      docKind,
      customSize:
        stored.preview.device.id === 'custom'
          ? { w: stored.preview.device.widthDp, h: stored.preview.device.heightDp }
          : undefined,
    };
  }

  const scheduler = new RenderScheduler({
    host: {
      render: (req) => hostManager.render(req),
      invalidate: (paths) => hostManager.invalidate({ paths }),
      // Awaited before the scheduler's one automatic retry (fix-pack POLISH-03) — HostManager's own
      // ensureReady() immediately (re)spawns a crashed host rather than waiting out its backoff timer.
      // T79/HOST-04 AC4: configuration must complete FIRST — a retry landing mid-download must never
      // boot the still-configured placeholder; a configuration failure rejects here, which the
      // scheduler already treats like any other retry failure (render() then fails against the
      // unconfigured/placeholder host, surfacing as a host error — no infinite spin, no crash loop).
      ensureReady: async () => {
        const configured = await ensureRealHostConfigured();
        if (!configured) throw new Error('Inflate: render engine not configured');
        await hostManager.ensureReady();
      },
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
      lastRenderTimings = response.timings;
      panelManager.applyResult(docPath, response);
    },
    onHostError: (docPath, error) => {
      output.appendLine(`[render] ${docPath} host error: ${error.message}`);
      panelManager.applyHostError(docPath, error);
    },
    onDispatch: (docPath) => {
      // Every actual host dispatch (initial attempt AND the automatic retry) is "Rendering…"
      // (fix-pack POLISH-02).
      panelManager.setBusy(docPath, PHASE_RENDERING);
    },
    onRetry: (docPath, error) => {
      // The suppressed first failure still needs a record (fix-pack POLISH-03) — the settled
      // (second) failure, if any, is already logged by onHostError above.
      output.appendLine(`[render] ${docPath} host-level failure, retrying: ${error.message}`);
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
        customSize: patch.customSize,
        orientation: patch.orientation as Orientation | undefined,
        density: patch.density as Density | undefined,
        themeName: patch.themeName,
        isProjectTheme: patch.isProjectTheme,
      });
      scheduler.notifyConfigChanged(docPath);
    },
    (docPath, zoom) => {
      // Zoom is persisted per file (CFG-05, P1-E AC5) but never re-renders by itself — only a
      // resulting pixel-scale escalation (sent as a separate configChanged) does (T52, UX-03).
      configStore.update(docPath, { zoom });
    },
    hydratePanelConfig,
  );

  const api: InflateApi = { activationMs: 0, hostManager, panelManager, configStore };

  void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', false);

  const updateEligibility = (editor: vscode.TextEditor | undefined) => {
    void vscode.commands.executeCommand('setContext', 'inflate:eligibleDocument', isEligibleDocument(editor));
  };
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateEligibility));
  updateEligibility(vscode.window.activeTextEditor);

  /** Best-effort push of the project + bundled theme list to the toolbar's picker (CFG-04). Never
   * blocks or fails the render loop — a host that doesn't answer just leaves the picker unpopulated. */
  async function pushThemes(docPath: string): Promise<void> {
    try {
      const { roots } = rootsResolver.resolve(docPath);
      // ENGINE_PACKAGE_NAME, not the project's real package — see its doc in protocol.ts.
      const raw = await hostManager.listThemes({ roots, packageName: ENGINE_PACKAGE_NAME });
      const themes: ThemeOption[] = parseThemeInfoList(raw);
      panelManager.setThemes(docPath, themes);
    } catch (e) {
      output.appendLine(`[themes] listThemes failed for ${docPath}: ${(e as Error).message}`);
    }
  }

  async function openPreviewFor(doc: vscode.TextDocument): Promise<void> {
    output.appendLine(`[preview] openPreview requested for ${doc.uri.fsPath}`);
    const docPath = doc.uri.fsPath;
    // The panel's `ready` handler re-derives + delivers the persisted config itself on every reveal
    // (DF-6, UX-06 AC5/AC7) — no explicit hydrate call needed here.
    api.lastPanel = panelManager.openFor(doc);
    // guided setup message already shown on failure; "Preparing render engine…" mirrors into the
    // panel's busy indicator via onPhase (fix-pack POLISH-02).
    if (!(await ensureRealHostConfigured(docPath, (label) => panelManager.setBusy(docPath, label)))) return;
    panelManager.setBusy(docPath, PHASE_STARTING_HOST);
    await hostManager.ensureReady();
    scheduler.requestRender(docPath, 'reopen');
    void pushThemes(docPath);
    // Await the first render so callers (and the walking-skeleton test) observe a settled host.
    await scheduler.settled(docPath);
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
      // Read-only report (T19/P1-H AC5) — assembled fresh from JdkLocator/ArtifactManager/HostManager
      // every invocation; a throwaway ArtifactManager is enough for cache-state reporting (no
      // javaBin/hostJarPath needed — those only matter for the generation step, T60).
      const manifest = loadBundledManifest(context.extensionPath);
      const artifactManager = new ArtifactManager({
        manifest,
        globalStorageDir: context.globalStorageUri.fsPath,
        arch: detectHostArch(),
      });
      const report = assembleDoctorReport({
        jdkResult: jdkLocator.locate(vscode.workspace.getConfiguration('inflate').get<string>('javaHome') || undefined),
        cacheReport: artifactManager.cacheState(),
        hostManager,
        manifest,
        hostReadySince,
        lastRenderTimings,
        logPointers: [`"${OUTPUT_CHANNEL_NAME}" output channel`],
      });
      for (const line of formatDoctorReport(report)) output.appendLine(line);
      output.show();
    }),
    vscode.commands.registerCommand('inflate.clearEngineCache', async () => {
      output.appendLine('[clearEngineCache] requested');
      // Host stopped first (design: "host stopped first is the caller's responsibility") — a running
      // host has the old cache's jars/natives already loaded; clearing under it would be incoherent.
      await hostManager.dispose();
      const manifest = loadBundledManifest(context.extensionPath);
      const artifactManager = new ArtifactManager({
        manifest,
        globalStorageDir: context.globalStorageUri.fsPath,
        arch: detectHostArch(),
      });
      artifactManager.clear();
      output.appendLine('[clearEngineCache] done — the next preview re-downloads and re-verifies the engine.');
      void vscode.window.showInformationMessage('Inflate: engine cache cleared.');
    }),
    vscode.commands.registerCommand('inflate.restartHost', async () => {
      output.appendLine('[restartHost] requested');
      if (!isFakeHostMode) jdkLocator.invalidate(); // a manual restart is exactly the P1-H AC3 "re-check"
      if (!(await ensureRealHostConfigured())) return;
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

/** Detects the current process's macOS architecture as the `HostArch` the manifest/ArtifactManager
 * understand (AD-004: macOS arm64/x64 only in v1). */
function detectHostArch(): HostArch {
  return process.arch === 'arm64' ? 'mac-arm' : 'mac';
}

/** The bundled engine manifest (T15/AD-011) — read once; a small, static JSON file shipped in the
 * VSIX, never regenerated at runtime. */
function loadBundledManifest(extensionPath: string): EngineManifest {
  const manifestPath = path.join(extensionPath, 'engine-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as EngineManifest;
}

/** Result of a real-host preparation attempt (T60, closes debt #1's `resolveHostCommand` real path):
 * either the host is now `reconfigure`d and ready for `ensureReady()`, or setup could not proceed
 * and [guidedMessage] should be shown instead of attempting a render (P1-H AC2/AC3). */
export type PrepareRealHostResult = { ok: true } | { ok: false; guidedMessage: string; downloadUrl?: string };

/**
 * Real render-engine setup, run lazily on the FIRST preview request (P1-H AC1: "WHEN a preview is
 * first requested and no engine cache exists...") rather than at `activate()` time, so a one-time
 * ~170 MB download never blocks activation (NFR-02). Resolves a JDK (JdkLocator, T14), ensures the
 * pinned engine artifacts are installed (ArtifactManager, T16 — with a progress UI on a real
 * download), assembles the real `java` invocation (`buildJavaCommand`, T17) against the bundled host
 * fat-jar, and `reconfigure`s [hostManager] with it plus the real `InitializeParams`. Idempotent and
 * cheap to call again once already configured (JdkLocator caches; ArtifactManager's `.complete`
 * check short-circuits; `reconfigure` no-ops once the host has started). `onPhase` (fix-pack
 * POLISH-02) mirrors "Preparing render engine…" — plus the artifact/percent during an actual
 * download — into the caller's panel busy indicator, alongside the existing progress notification.
 */
async function prepareRealHost(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  hostManager: HostManager,
  jdkLocator: JdkLocator,
  onPhase?: (label: string) => void,
): Promise<PrepareRealHostResult> {
  const config = vscode.workspace.getConfiguration('inflate');
  const jdkResult = jdkLocator.locate(config.get<string>('javaHome') || undefined);
  if (isGuidedError(jdkResult)) {
    const g = jdkResult as GuidedError;
    output.appendLine(`[setup] ${g.message}`);
    return { ok: false, guidedMessage: g.message, downloadUrl: g.downloadUrl };
  }

  onPhase?.(PHASE_PREPARING_ENGINE);
  const manifest = loadBundledManifest(context.extensionPath);
  const hostJarPath = path.join(context.extensionPath, 'host.jar');
  const artifactManager = new ArtifactManager({
    manifest,
    globalStorageDir: context.globalStorageUri.fsPath,
    arch: detectHostArch(),
    javaBin: jdkResult.javaBin,
    hostJarPath,
  });

  let enginePaths;
  try {
    enginePaths = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Inflate: preparing render engine (one-time ~170 MB download)', cancellable: false },
      (progress) =>
        artifactManager.ensureInstalled((event) => {
          const pct = event.totalBytes > 0 ? Math.round((event.bytesDownloaded / event.totalBytes) * 100) : undefined;
          progress.report({ message: `${event.artifactKey}${pct !== undefined ? ` ${pct}%` : ''}` });
          onPhase?.(preparingEnginePhase(event.artifactKey, pct));
        }),
    );
  } catch (e) {
    output.appendLine(`[setup] engine install failed: ${(e as Error).message}`);
    return { ok: false, guidedMessage: (e as Error).message };
  }

  const renderOutputDir = path.join(context.globalStorageUri.fsPath, 'renders');
  const overlayDir = path.join(context.globalStorageUri.fsPath, 'overlay');
  fs.mkdirSync(renderOutputDir, { recursive: true });
  fs.mkdirSync(overlayDir, { recursive: true });

  const { command, args } = buildJavaCommand({
    javaBin: jdkResult.javaBin,
    hostJarPath,
    classpathJars: enginePaths.classpathJars,
    layoutlibRuntimeRoot: enginePaths.layoutlibRuntimeRoot,
    layoutlibResourcesRoot: enginePaths.layoutlibResourcesRoot,
    maxHeapMb: config.get<number>('hostMaxHeap'),
  });

  hostManager.reconfigure({
    command,
    args,
    renderTimeoutMs: config.get<number>('renderTimeoutMs'),
    initializeParams: {
      layoutlibRuntimeRoot: enginePaths.layoutlibRuntimeRoot,
      layoutlibResourcesRoot: enginePaths.layoutlibResourcesRoot,
      classpathNote: 'assembled-by-launcher',
      libraryResDirs: enginePaths.libraryResDirs,
      libraryPackages: enginePaths.libraryPackages,
      outputDir: renderOutputDir,
      overlayDir,
      compileSdkVersion: 34,
      logLevel: 'info',
    },
  });

  return { ok: true };
}

/** Terminates the host process (no orphans — NFR-05) and is called by `extension.ts`'s
 * zero-argument `deactivate()` export with the `hostManager` it got back from {@link activate}. */
export function deactivateHost(hostManager: HostManager): Thenable<void> {
  return hostManager.dispose();
}
