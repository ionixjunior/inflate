/**
 * PreviewPanelManager (T37, design component #9, UX-02/04/05, P1-A/F). Owns one webview panel per
 * document (reveal-not-duplicate), applies render results to it via the webview message contract
 * (setImage / setError / setStatus / fileGone), and keeps the last good render visible (dimmed +
 * stale) when a newer attempt fails. It also sweeps stale PNG output on activation and panel close.
 *
 * Image/error state lives in the webview (updated by postMessage without reloading the panel, so a
 * save-triggered update never steals editor focus). The manager tracks the last applied result per
 * document synchronously so the extension (and integration tests) can observe the loop without
 * inspecting webview DOM.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PanelStateStore, pngTokenOf, StoreMessage } from './panelState';
import { RenderResponse, Warning } from './protocol';
import { panelShellHtml } from './webview';

interface PanelEntry {
  panel: vscode.WebviewPanel;
  /** True while the webview is live and has signalled `ready` — false from the moment it's hidden
   * (VS Code destroys its context, `retainContextWhenHidden: false`) until it reloads and signals
   * `ready` again (DF-6). */
  ready: boolean;
  /** Authoritative latest-wins snapshot of every message posted to this panel, replayed in full on
   * EVERY `ready` (DF-6, UX-06 AC7) — replaces the old `PendingMessageQueue`, which only ever held
   * messages posted before the FIRST ready and so left a reloaded (hidden→revealed) webview blank. */
  store: PanelStateStore;
  /** Incremented every time a `ready` message triggers a replay (test/observation hook, DF-6). */
  replayCount: number;
  /** Cumulative count of messages actually POSTED to the webview during a replay (test/observation
   * hook, DF-6). Unlike `replayCount` (incremented whenever a `ready` is handled, regardless of what
   * happens next), this only advances inside the post loop itself, so a regression that still fires
   * `ready` handling but skips the post loop (e.g. a queue-flush-only revert) can't leave it looking
   * like delivery happened. */
  replayPostedCount: number;
  /** The config object actually included in the most recent replay (test/observation hook, DF-6,
   * UX-06 AC5) — proves `deriveConfig` was re-invoked fresh at replay time rather than a stale
   * open-time copy being replayed. */
  lastConfigSent?: HydratedConfig;
  lastResponse?: RenderResponse;
  hostError?: string;
  /** True once the document's source file has been reported gone (test/observation hook, DF-6, so
   * `lastApplied` can surface it — cleared by the next settled render or host error). */
  fileGone: boolean;
  /** True once any successful image has been shown (survives a later error as the stale render). */
  hasGoodImage: boolean;
  /** True while engine prep / host start / a render is in progress (POLISH-02/03) — cleared the
   * moment a render settles (ok, domain error, or host error). */
  busy: boolean;
}

/** What the manager last applied for a document — the extension/tests' observation hook. */
export interface AppliedState {
  status: 'ok' | 'error' | 'hostError' | 'fileGone';
  responseId?: number;
  hasStaleImage: boolean;
  errorMessage?: string;
  /** Drawable metadata from the last successful render (T49 — toolbar/observability). */
  stateSensitive?: boolean;
  staticPreviewBadge?: boolean;
  matchedStateItem?: { index: number; stateAttrs: string[] };
  /** Warnings from the last render (T53 — integration tests observe the applied config through
   * these without a live DOM, e.g. a fake host echoing back the RenderRequest.config it received). */
  warnings?: Array<{ kind: string; message: string }>;
  /** True while a loading phase is in progress for this document (POLISH-02/03 observability). */
  busy?: boolean;
  /** Number of times this panel's state has been replayed on a `ready` signal — first load counts
   * as one (DF-6 observability hook: proves a hidden→revealed reload re-delivered state). */
  replayCount: number;
  /** Cumulative count of messages actually posted to the webview during a replay (DF-6 observability
   * hook) — advances only when a message is genuinely posted, unlike `replayCount` which advances on
   * every `ready` regardless of what the replay computed. */
  replayPostedCount: number;
}

/** A drawable config patch from the webview toolbar (state picker / size override). */
export interface DrawableConfigPatch {
  states: string[];
  sizeDp?: { w: number; h: number };
}

/**
 * A `configChanged` patch from the webview toolbar (T49 drawable controls + T51 config controls,
 * CFG-01..04). Every field is optional — a single control changing emits just its own field(s); the
 * extension merges whatever is present into ConfigStore and re-renders.
 */
export interface ConfigPatch {
  drawable?: DrawableConfigPatch;
  night?: boolean;
  deviceId?: string;
  /** A layout's edge-drag resize (fix-pack POLISH-07) — becomes a transient custom device size. */
  customSize?: { w: number; h: number };
  orientation?: 'portrait' | 'landscape';
  density?: string;
  themeName?: string;
  isProjectTheme?: boolean;
}

/** `'fit'` = fit-to-window; a number is a persisted manual zoom percent (25-400, T52/UX-03). */
export type ZoomSetting = 'fit' | number;

/** A theme offered by the picker (CFG-04) — `setThemes`, fed by the `listThemes` RPC result. */
export interface ThemeOption {
  name: string;
  isProjectTheme: boolean;
  source: string;
}

/** The persisted per-file config pushed to the webview on open/reopen (CFG-05, P1-E AC5). */
export interface HydratedConfig {
  themeName: string;
  isProjectTheme: boolean;
  night: boolean;
  deviceId: string;
  orientation: string;
  density: string;
  zoom: ZoomSetting;
  /** 'layout' vs 'drawable' — lets the webview route an edge-drag resize to a custom device size
   * (layout) vs `drawable.sizeDp` (drawable/nine-patch/color), fix-pack POLISH-07. */
  docKind: 'layout' | 'drawable';
  /** The active custom device's dp size, present only when `deviceId === 'custom'` (fix-pack
   * POLISH-07, FP-3 AC5) — lets the webview render the "Custom (W×H dp)" picker entry on reopen. */
  customSize?: { w: number; h: number };
}

/** The full webview → extension message shape this panel understands. `zoom` (a `zoomChanged`
 * message) is persisted only — unlike `configChanged` it never by itself triggers a re-render. */
type WebviewToExtensionMessage = { type?: string; zoom?: ZoomSetting } & ConfigPatch;

function warningsToVm(warnings: Warning[]): Array<{ kind: string; message: string }> {
  return warnings.map((w) => ({ kind: w.kind, message: w.message }));
}

export class PreviewPanelManager {
  private readonly entries = new Map<string, PanelEntry>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    /** Session PNG output dir (globalStorage) — a webview resource root and the sweep target. */
    private readonly outputDir: vscode.Uri,
    private readonly onRefresh: (docPath: string) => void = () => {},
    /** A toolbar config change (drawable state/size, day/night, device, orientation, density, theme
     * — T49/T51) → merge into ConfigStore and re-render. */
    private readonly onConfigChanged: (docPath: string, patch: ConfigPatch) => void = () => {},
    /** A zoom-level change (T52) → persist into ConfigStore only; never re-renders by itself. */
    private readonly onZoomChanged: (docPath: string, zoom: ZoomSetting) => void = () => {},
    /** Re-derives the document's persisted config fresh from ConfigStore (DF-6, UX-06 AC5) — called
     * on EVERY `ready`, so a toolbar change made after open is never reverted by replaying a stale
     * open-time copy. Replaces the old one-shot `hydrateConfig()` call activation used to make right
     * after `openFor`. */
    private readonly deriveConfig: (docPath: string) => HydratedConfig,
  ) {
    this.sweepPngs();
  }

  /** Number of live panels (test hook for reveal-not-duplicate). */
  panelCount(): number {
    return this.entries.size;
  }

  /**
   * Build the webview URI for a rendered PNG. The PNG lives in `outputDir`, a registered webview
   * resource root; the resource URI MUST be derived from that SAME root Uri so it inherits its
   * scheme. On desktop VS Code `context.globalStorageUri` is `vscode-userdata`-scheme, so `outputDir`
   * (joined onto it) is too. Building the resource as `Uri.file(pngPath)` instead yields a `file:`
   * resource that sits under a `vscode-userdata` root with a mismatched scheme — the webview resource
   * service then rejects it with HTTP 401 ("not within localResourceRoots") and the image shows as a
   * broken glyph. Joining the basename onto `outputDir` keeps scheme + root aligned. (Regression:
   * `src/test/integration/webview-resource.test.ts`.)
   */
  static imageWebviewUri(webview: vscode.Webview, outputDir: vscode.Uri, pngPath: string): string {
    return webview.asWebviewUri(vscode.Uri.joinPath(outputDir, path.basename(pngPath))).toString();
  }

  hasPanel(docPath: string): boolean {
    return this.entries.has(this.key(docPath));
  }

  /** The session PNG output dir's filesystem path (test/observation hook, DF-6, UX-06 AC6) — lets
   * integration tests seed/assert PNG files matching the host's naming convention, since the fake
   * host used in those tests never actually writes into it. */
  outputDirPath(): string {
    return this.outputDir.fsPath;
  }

  /** The most recent state applied to a document's panel (test/observation hook). */
  lastApplied(docPath: string): AppliedState | undefined {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return undefined;
    if (entry.fileGone) {
      return {
        status: 'fileGone',
        hasStaleImage: entry.hasGoodImage,
        busy: entry.busy,
        replayCount: entry.replayCount,
        replayPostedCount: entry.replayPostedCount,
      };
    }
    if (entry.hostError) {
      return {
        status: 'hostError',
        hasStaleImage: entry.hasGoodImage,
        errorMessage: entry.hostError,
        busy: entry.busy,
        replayCount: entry.replayCount,
        replayPostedCount: entry.replayPostedCount,
      };
    }
    const r = entry.lastResponse;
    if (!r) return undefined;
    return {
      status: r.status,
      responseId: r.id,
      hasStaleImage: r.status === 'error' && entry.hasGoodImage,
      errorMessage: r.error?.message,
      stateSensitive: r.stateSensitive,
      staticPreviewBadge: r.staticPreviewBadge,
      matchedStateItem: r.matchedStateItem,
      warnings: warningsToVm(r.warnings),
      busy: entry.busy,
      replayCount: entry.replayCount,
      replayPostedCount: entry.replayPostedCount,
    };
  }

  /** The config actually sent in the most recent replay (test/observation hook, DF-6, UX-06 AC5). */
  lastConfigSent(docPath: string): HydratedConfig | undefined {
    return this.entries.get(this.key(docPath))?.lastConfigSent;
  }

  /**
   * Route a webview → extension message for a document. Public so the extension-side integration
   * loop (T18/T37 fake-host pattern) can drive the toolbar's config-change path without a live DOM.
   */
  deliverWebviewMessage(docPath: string, msg: WebviewToExtensionMessage): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    this.handleWebviewMessage(entry, docPath, msg);
  }

  private handleWebviewMessage(entry: PanelEntry, docPath: string, msg: WebviewToExtensionMessage): void {
    if (msg?.type === 'ready') {
      entry.ready = true;
      entry.replayCount++;
      const config = this.deriveConfig(docPath);
      entry.lastConfigSent = config;
      const replay = entry.store.replay(() => ({ type: 'setConfig', config }));
      for (const m of replay) {
        void entry.panel.webview.postMessage(m);
        entry.replayPostedCount++;
      }
    } else if (msg?.type === 'refresh') {
      this.onRefresh(docPath);
    } else if (msg?.type === 'configChanged') {
      const { type: _type, zoom: _zoom, ...patch } = msg;
      this.onConfigChanged(docPath, patch);
    } else if (msg?.type === 'zoomChanged' && msg.zoom !== undefined) {
      this.onZoomChanged(docPath, msg.zoom);
    }
  }

  /** Open (or reveal) the panel for `doc`, beside the editor, without duplicating it. */
  openFor(doc: vscode.TextDocument): vscode.WebviewPanel {
    const key = this.key(doc.uri.fsPath);
    const existing = this.entries.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, /* preserveFocus */ true);
      return existing.panel;
    }

    const panel = vscode.window.createWebviewPanel(
      'inflate.preview',
      `Inflate: ${path.basename(doc.uri.fsPath)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [this.context.extensionUri, this.outputDir],
      },
    );
    const entry: PanelEntry = {
      panel,
      ready: false,
      hasGoodImage: false,
      fileGone: false,
      store: new PanelStateStore(),
      replayCount: 0,
      replayPostedCount: 0,
      busy: false,
    };
    this.entries.set(key, entry);
    panel.webview.html = this.shellHtml(panel.webview);
    panel.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
      this.handleWebviewMessage(entry, doc.uri.fsPath, msg);
    });
    // A hidden tab's webview context is destroyed (`retainContextWhenHidden: false`) — marking the
    // entry not-ready means every message recorded while hidden is still snapshotted (never live-
    // posted to a dead webview) and gets replayed in full the next time this panel signals `ready`
    // (DF-6, UX-06 AC1/AC2/AC7).
    panel.onDidChangeViewState((e) => {
      if (!e.webviewPanel.visible) entry.ready = false;
    });
    panel.onDidDispose(() => {
      this.entries.delete(key);
      this.sweepPngs(doc.uri.fsPath);
    });
    return panel;
  }

  /** Apply a completed render (ok or domain error) to the document's panel. */
  applyResult(docPath: string, response: RenderResponse): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    entry.lastResponse = response;
    entry.hostError = undefined;
    entry.fileGone = false;
    entry.busy = false;

    if (response.status === 'ok' && response.pngPath) {
      entry.hasGoodImage = true;
      const uri = PreviewPanelManager.imageWebviewUri(entry.panel.webview, this.outputDir, response.pngPath);
      this.post(entry, {
        type: 'setImage',
        uri: `${uri}?v=${response.id}`,
        width: response.imageWidth ?? 0,
        height: response.imageHeight ?? 0,
        warnings: warningsToVm(response.warnings),
        canvasCapped: response.canvasCapped ?? false,
        drawable: {
          stateSensitive: response.stateSensitive ?? false,
          staticPreviewBadge: response.staticPreviewBadge ?? false,
          matched: response.matchedStateItem,
        },
      });
    } else {
      this.post(entry, {
        type: 'setError',
        message: response.error?.message ?? 'render failed',
        file: response.error?.file,
        line: response.error?.line,
        column: response.error?.column,
        warnings: warningsToVm(response.warnings),
      });
    }
  }

  /** Push the theme list (project + bundled) to the toolbar's picker (CFG-04, `listThemes` RPC). */
  setThemes(docPath: string, themes: ThemeOption[]): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    this.post(entry, { type: 'setThemes', themes });
  }

  /** Apply a host-level failure (crash / timeout) — keeps the last good render dimmed. */
  applyHostError(docPath: string, error: Error): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    entry.hostError = error.message;
    entry.fileGone = false;
    entry.busy = false;
    this.post(entry, { type: 'setError', message: `Render host error: ${error.message}`, warnings: [] });
  }

  /** Signal a busy/loading phase (POLISH-02/03, e.g. "Rendering…") — cleared automatically by the
   * next {@link applyResult} or {@link applyHostError}. Queued like any other message if the webview
   * isn't ready yet. */
  setBusy(docPath: string, label?: string): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    entry.busy = true;
    this.post(entry, { type: 'setBusy', label });
  }

  /** Mark the document's source file as gone (deleted/renamed). */
  markFileGone(docPath: string): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    entry.fileGone = true;
    entry.hostError = undefined;
    this.post(entry, { type: 'fileGone' });
  }

  private post(entry: PanelEntry, message: StoreMessage): void {
    // Always recorded, so a later replay (this panel's next `ready`) can redeliver it even if it
    // arrives while hidden and is never live-posted (DF-6, UX-06 AC2/AC3).
    entry.store.record(message);
    if (entry.ready) void entry.panel.webview.postMessage(message);
  }

  /**
   * Delete PNG files in the session output dir. Called with no `docPath` once, at activation
   * (sweep-all of a fresh session, unchanged) — with a `docPath`, only that document's PNGs
   * (`<pngTokenOf(docPath)>__*.png`) are removed, so closing one preview never touches another's
   * current/previous frames (DF-6, UX-06 AC6; the host's `PngWriter` already names + prunes files
   * per-document — `keepPerDoc = 2`, `PngWriter.kt:11-45` — specifically so this scoping works).
   */
  private sweepPngs(docPath?: string): void {
    try {
      if (!fs.existsSync(this.outputDir.fsPath)) return;
      const prefix = docPath !== undefined ? `${pngTokenOf(docPath)}__` : undefined;
      for (const name of fs.readdirSync(this.outputDir.fsPath)) {
        if (!name.endsWith('.png')) continue;
        if (prefix !== undefined && !name.startsWith(prefix)) continue;
        try {
          fs.unlinkSync(path.join(this.outputDir.fsPath, name));
        } catch {
          /* best-effort sweep */
        }
      }
    } catch (e) {
      this.output.appendLine(`[panel] png sweep skipped: ${(e as Error).message}`);
    }
  }

  private key(docPath: string): string {
    return path.resolve(docPath);
  }

  // NOTE: the error container is `id="errorPanel"` (not `id="error"`) and an <img> shell element is
  // always present, so the walking-skeleton assertions (image present, no error state) still hold.
  // The markup/CSS itself lives in `webview.ts`'s `panelShellHtml` (vscode-free, unit-testable).
  private shellHtml(webview: vscode.Webview): string {
    const nonce = nonceString();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    return panelShellHtml({ scriptUri: scriptUri.toString(), cspSource: webview.cspSource, nonce });
  }
}

function nonceString(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
