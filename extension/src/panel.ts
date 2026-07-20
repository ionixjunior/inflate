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
import { RenderResponse, Warning } from './protocol';

interface PanelEntry {
  panel: vscode.WebviewPanel;
  ready: boolean;
  /** The most recent message posted (or queued until the webview signals ready). */
  lastMessage?: unknown;
  lastResponse?: RenderResponse;
  hostError?: string;
  /** True once any successful image has been shown (survives a later error as the stale render). */
  hasGoodImage: boolean;
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
  orientation?: 'portrait' | 'landscape';
  density?: string;
  themeName?: string;
  isProjectTheme?: boolean;
}

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
  ) {
    this.sweepPngs();
  }

  /** Number of live panels (test hook for reveal-not-duplicate). */
  panelCount(): number {
    return this.entries.size;
  }

  hasPanel(docPath: string): boolean {
    return this.entries.has(this.key(docPath));
  }

  /** The most recent state applied to a document's panel (test/observation hook). */
  lastApplied(docPath: string): AppliedState | undefined {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return undefined;
    if (entry.hostError) {
      return { status: 'hostError', hasStaleImage: entry.hasGoodImage, errorMessage: entry.hostError };
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
    };
  }

  /**
   * Route a webview → extension message for a document. Public so the extension-side integration
   * loop (T18/T37 fake-host pattern) can drive the toolbar's config-change path without a live DOM.
   */
  deliverWebviewMessage(docPath: string, msg: { type?: string } & ConfigPatch): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    this.handleWebviewMessage(entry, docPath, msg);
  }

  private handleWebviewMessage(
    entry: PanelEntry,
    docPath: string,
    msg: { type?: string } & ConfigPatch,
  ): void {
    if (msg?.type === 'ready') {
      entry.ready = true;
      if (entry.lastMessage) void entry.panel.webview.postMessage(entry.lastMessage);
    } else if (msg?.type === 'refresh') {
      this.onRefresh(docPath);
    } else if (msg?.type === 'configChanged') {
      const { type: _type, ...patch } = msg;
      this.onConfigChanged(docPath, patch);
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
    const entry: PanelEntry = { panel, ready: false, hasGoodImage: false };
    this.entries.set(key, entry);
    panel.webview.html = this.shellHtml(panel.webview);
    panel.webview.onDidReceiveMessage((msg: { type?: string } & ConfigPatch) => {
      this.handleWebviewMessage(entry, doc.uri.fsPath, msg);
    });
    panel.onDidDispose(() => {
      this.entries.delete(key);
      this.sweepPngs();
    });
    return panel;
  }

  /** Apply a completed render (ok or domain error) to the document's panel. */
  applyResult(docPath: string, response: RenderResponse): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    entry.lastResponse = response;
    entry.hostError = undefined;

    if (response.status === 'ok' && response.pngPath) {
      entry.hasGoodImage = true;
      const uri = entry.panel.webview.asWebviewUri(vscode.Uri.file(response.pngPath)).toString();
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

  /** Apply a host-level failure (crash / timeout) — keeps the last good render dimmed. */
  applyHostError(docPath: string, error: Error): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    entry.hostError = error.message;
    this.post(entry, { type: 'setError', message: `Render host error: ${error.message}`, warnings: [] });
  }

  /** Mark the document's source file as gone (deleted/renamed). */
  markFileGone(docPath: string): void {
    const entry = this.entries.get(this.key(docPath));
    if (!entry) return;
    this.post(entry, { type: 'fileGone' });
  }

  private post(entry: PanelEntry, message: unknown): void {
    entry.lastMessage = message;
    if (entry.ready) {
      void entry.panel.webview.postMessage(message);
    }
    // If not ready yet, the queued lastMessage is flushed on the webview's 'ready' signal.
  }

  /** Delete PNG files in the session output dir (activation + panel close, design component #9). */
  private sweepPngs(): void {
    try {
      if (!fs.existsSync(this.outputDir.fsPath)) return;
      for (const name of fs.readdirSync(this.outputDir.fsPath)) {
        if (name.endsWith('.png')) {
          try {
            fs.unlinkSync(path.join(this.outputDir.fsPath, name));
          } catch {
            /* best-effort sweep */
          }
        }
      }
    } catch (e) {
      this.output.appendLine(`[panel] png sweep skipped: ${(e as Error).message}`);
    }
  }

  private key(docPath: string): string {
    return path.resolve(docPath);
  }

  private shellHtml(webview: vscode.Webview): string {
    const nonce = nonceString();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    // NOTE: the error container is `id="errorPanel"` (not `id="error"`) and an <img> shell element is
    // always present, so the walking-skeleton assertions (image present, no error state) still hold.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    body { margin: 0; font-family: sans-serif; color: var(--vscode-foreground); }
    #toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 8px;
               border-bottom: 1px solid var(--vscode-panel-border, #444); font-size: 12px; }
    #toolbar label { display: inline-flex; align-items: center; gap: 4px; }
    #badge { background: var(--vscode-badge-background, #666); color: var(--vscode-badge-foreground, #fff);
             padding: 2px 8px; border-radius: 8px; }
    #matched { color: var(--vscode-descriptionForeground, #999); }
    #stage { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
    #preview { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
    #staleChip { position: fixed; top: 8px; right: 8px; background: var(--vscode-badge-background, #666);
                 color: var(--vscode-badge-foreground, #fff); padding: 2px 8px; border-radius: 8px; font-size: 11px; }
    #errorPanel { color: var(--vscode-errorForeground, #f14c4c); padding: 1em; white-space: pre-wrap; }
    #fileGone { color: var(--vscode-descriptionForeground, #999); padding: 1em; }
    #warnings { border-top: 1px solid var(--vscode-panel-border, #444); padding: 4px 8px; font-size: 12px; }
    #warningsHeader { cursor: pointer; user-select: none; }
    #warningsList { margin: 4px 0; padding-left: 1.2em; }
    #status { padding: 4px 8px; font-size: 12px; color: var(--vscode-descriptionForeground, #999); }
  </style>
</head>
<body>
  <div id="staleChip" style="display:none">stale</div>
  <div id="toolbar">
    <span id="statePickerWrap" style="display:none">
      <label>State <select id="statePicker"></select></label>
    </span>
    <label>Size <input id="sizeInput" type="text" size="8" placeholder="WxH" /></label>
    <button id="backdropToggle" type="button">Backdrop</button>
    <span id="badge" style="display:none">static preview</span>
    <span id="matched" style="display:none"></span>
  </div>
  <div id="stage"><img id="preview" alt="Inflate preview" style="display:none" /></div>
  <div id="errorPanel" style="display:none"></div>
  <div id="fileGone" style="display:none">The previewed file no longer exists.</div>
  <div id="status" style="display:none"></div>
  <div id="warnings" style="display:none">
    <div id="warningsHeader"></div>
    <ul id="warningsList" style="display:none"></ul>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function nonceString(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
