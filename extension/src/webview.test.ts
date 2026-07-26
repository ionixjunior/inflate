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

describe('panelShellHtml — stage containment (fix-pack POLISH-05)', () => {
  function rule(html: string, selector: string): string {
    const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`);
    return re.exec(html)?.[0] ?? '';
  }

  it('never lets the page body scroll (html/body no-scroll rule)', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(rule(html, 'html, body')).toContain('overflow: hidden');
  });

  it('clips the stage at its bounds (overflow hidden) so the image cannot paint over the toolbar', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(rule(html, '#stage')).toContain('overflow: hidden');
  });

  it('keeps the toolbar in normal flow above the stage with an opaque background', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    const toolbarRule = rule(html, '#toolbar');
    expect(toolbarRule).toContain('flex: 0 0 auto');
    expect(toolbarRule).toContain('background:');
  });
});
