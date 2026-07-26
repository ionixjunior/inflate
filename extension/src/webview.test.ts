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

describe('panelShellHtml — busy overlay (fix-pack POLISH-02)', () => {
  it('contains a busy overlay with a spinner and a phase label, hidden by default', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(html).toContain('<div id="busyOverlay" style="display:none">');
    expect(html).toContain('id="busySpinner"');
    expect(html).toContain('id="busyLabel"');
  });
});

describe('panelShellHtml — edge-drag ghost outline (fix-pack POLISH-07, FP-3 AC3)', () => {
  it('contains a resize ghost element, hidden by default and non-interactive', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(html).toContain('<div id="resizeGhost" style="display:none">');
    const ghostRule = /#resizeGhost\s*\{[^}]*\}/.exec(html)?.[0] ?? '';
    expect(ghostRule).toContain('pointer-events: none');
  });

  it('has no Size text input (POLISH-06 removed it in favor of the drag gesture)', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(html).not.toContain('sizeInput');
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

describe('panelShellHtml — native-drag suppression on the gesture surface (defect fix POLISH-09, AC1)', () => {
  it('marks the preview image non-draggable', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    expect(html).toContain('<img id="preview" alt="Inflate preview" style="display:none" draggable="false" />');
  });

  it('suppresses the native drag ghost and text/image selection on #preview', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    const previewRule = /#preview\s*\{[^}]*\}/.exec(html)?.[0] ?? '';
    expect(previewRule).toContain('-webkit-user-drag: none');
    expect(previewRule).toContain('user-select: none');
  });

  it('suppresses text/image selection on #stage', () => {
    const html = panelShellHtml(SHELL_PARAMS);
    const stageRule = /#stage\s*\{[^}]*\}/.exec(html)?.[0] ?? '';
    expect(stageRule).toContain('user-select: none');
  });
});
