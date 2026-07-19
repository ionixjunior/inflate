import { describe, it, expect } from 'vitest';
import { helloHtml } from './webview';

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
