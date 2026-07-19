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
