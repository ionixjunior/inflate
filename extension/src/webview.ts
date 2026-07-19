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
