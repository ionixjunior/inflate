import { describe, it, expect } from 'vitest';
import { helloHtml, panelShellHtml } from './webview';

const SHELL_PARAMS = { scriptUri: 'https://example/dist/webview.js', cspSource: 'vscode-webview://x', nonce: 'abc123' };

describe('helloHtml', () => {
  it('embeds the image uri in an img element', () => {
    const html = helloHtml('vscode-webview://host/hello.png', 'vscode-webview:');
    expect(html).toContain('<img');
    expect(html).toContain('src="vscode-webview://host/hello.png"');
  });

  it('restricts image loading to the webview csp source', () => {
    const html = helloHtml('u', 'vscode-webview://abc');
    expect(html).toContain('img-src vscode-webview://abc');
    expect(html).toContain("default-src 'none'");
  });
});

describe('panelShellHtml — Backdrop removal (fix-pack POLISH-01)', () => {
  it('contains no backdrop toggle button', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(html).not.toContain('backdropToggle');
    expect(html.toLowerCase()).not.toContain('backdrop');
  });

  it('bakes the checkerboard permanently into the #stage rule (no toggle path)', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    const stageRule = /#stage\s*\{[^}]*\}/.exec(html)?.[0] ?? '';
    expect(stageRule).toContain('repeating-conic-gradient');
  });
});

describe('panelShellHtml — Orientation dropdown (fix-pack POLISH-08)', () => {
  it('has an orientationPicker <select>, no orientationToggle button', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(html).toContain('<select id="orientationPicker">');
    expect(html).not.toContain('orientationToggle');
  });
});
