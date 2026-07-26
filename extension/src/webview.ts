/**
 * Pure webview HTML builders (no `vscode` import so they are unit-testable under vitest).
 */

/** Minimal M0 preview page: a single image loaded from a webview URI under a strict CSP. */
export function helloHtml(imgSrc: string, cspSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline';" />
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
    img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
  </style>
</head>
<body>
  <img id="preview" src="${imgSrc}" alt="Inflate preview" />
</body>
</html>`;
}

/** T18 walking-skeleton preview page: shows either the rendered image or an error message. Real
 * zoom/pan/warnings-strip/stale handling is `PreviewPanelManager` (design component #9, later). */
export type PreviewContent = { kind: 'image'; imgSrc: string } | { kind: 'error'; message: string };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function previewHtml(content: PreviewContent, cspSource: string): string {
  const body =
    content.kind === 'image'
      ? `<img id="preview" src="${content.imgSrc}" alt="Inflate preview" />`
      : `<div id="error">${escapeHtml(content.message)}</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${cspSource}; style-src 'unsafe-inline';" />
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }
    img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
    #error { color: var(--vscode-errorForeground, #f14c4c); padding: 1em; white-space: pre-wrap; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

/** Inputs `PreviewPanelManager.shellHtml` needs to build the real preview panel's markup — kept as
 * primitive values (not a `vscode.Webview`) so the template itself stays unit-testable under vitest
 * (fix-pack amendment, POLISH-01/05/08 — see `PreviewPanelManager.shellHtml` in `panel.ts`). */
export interface PanelShellParams {
  scriptUri: string;
  cspSource: string;
  nonce: string;
}

/** The real preview panel's shell markup (design component #9): toolbar (theme/night/device/
 * orientation/density/state picker), the image stage (permanently checkerboard, POLISH-01), and the
 * error/file-gone/warnings/status strips. `PreviewPanelManager.shellHtml` supplies the webview-derived
 * values; `main.ts` (bundled to `dist/webview.js`) owns all DOM behavior. */
export function panelShellHtml(params: PanelShellParams): string {
  const { scriptUri, cspSource, nonce } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    html, body { height: 100%; overflow: hidden; }
    body { margin: 0; font-family: sans-serif; color: var(--vscode-foreground);
           display: flex; flex-direction: column; }
    #toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 8px;
               border-bottom: 1px solid var(--vscode-panel-border, #444); font-size: 12px;
               background: var(--vscode-editor-background, #1e1e1e); }
    #toolbar label { display: inline-flex; align-items: center; gap: 4px; }
    #badge { background: var(--vscode-badge-background, #666); color: var(--vscode-badge-foreground, #fff);
             padding: 2px 8px; border-radius: 8px; }
    #matched { color: var(--vscode-descriptionForeground, #999); }
    #stage { flex: 1 1 0; min-height: 0; overflow: hidden; position: relative;
             display: flex; align-items: center; justify-content: center;
             background: repeating-conic-gradient(#7f7f7f 0% 25%, #bfbfbf 0% 50%) 50% / 20px 20px; }
    #preview { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
    #busyOverlay { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center;
                   justify-content: center; gap: 8px; }
    #busySpinner { width: 24px; height: 24px; border-radius: 50%;
                   border: 3px solid var(--vscode-descriptionForeground, #999); border-top-color: transparent;
                   animation: inflate-spin 0.8s linear infinite; }
    @keyframes inflate-spin { to { transform: rotate(360deg); } }
    #busyLabel { font-size: 12px; color: var(--vscode-foreground);
                 background: var(--vscode-editor-background, #1e1e1e); padding: 2px 8px; border-radius: 4px; }
    #staleChip { position: fixed; top: 8px; right: 8px; background: var(--vscode-badge-background, #666);
                 color: var(--vscode-badge-foreground, #fff); padding: 2px 8px; border-radius: 8px; font-size: 11px; }
    #errorPanel { flex: 0 0 auto; color: var(--vscode-errorForeground, #f14c4c); padding: 1em;
                  white-space: pre-wrap; max-height: 30vh; overflow-y: auto; }
    #fileGone { flex: 0 0 auto; color: var(--vscode-descriptionForeground, #999); padding: 1em; }
    #warnings { flex: 0 0 auto; border-top: 1px solid var(--vscode-panel-border, #444); padding: 4px 8px;
                font-size: 12px; max-height: 20vh; overflow-y: auto; }
    #warningsHeader { cursor: pointer; user-select: none; }
    #warningsList { margin: 4px 0; padding-left: 1.2em; }
    #status { flex: 0 0 auto; padding: 4px 8px; font-size: 12px; color: var(--vscode-descriptionForeground, #999); }
  </style>
</head>
<body>
  <div id="staleChip" style="display:none">stale</div>
  <div id="toolbar">
    <label>Theme <select id="themePicker"></select></label>
    <label><input id="nightToggle" type="checkbox" /> Night</label>
    <label>Device <select id="devicePicker"></select></label>
    <label>Orientation <select id="orientationPicker"></select></label>
    <label>Density <select id="densityPicker"></select></label>
    <span id="statePickerWrap" style="display:none">
      <label>State <select id="statePicker"></select></label>
    </span>
    <label>Size <input id="sizeInput" type="text" size="8" placeholder="WxH" /></label>
    <span id="badge" style="display:none">static preview</span>
    <span id="matched" style="display:none"></span>
  </div>
  <div id="stage">
    <img id="preview" alt="Inflate preview" style="display:none" />
    <div id="busyOverlay" style="display:none">
      <div id="busySpinner"></div>
      <div id="busyLabel"></div>
    </div>
  </div>
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
