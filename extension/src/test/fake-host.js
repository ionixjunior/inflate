// A scripted, protocol-speaking child process for HostManager unit tests (T17). It speaks the same
// LSP-framed JSON-RPC protocol as the real render host (T13/AD-010) — via `vscode-jsonrpc` itself,
// which is fine here since this is test-only infrastructure, never shipped host code — so
// HostManager's real spawn/state-machine/timeout logic is exercised against a REAL child process,
// not a mock.
//
// Usage: `node fake-host.js <mode>`
//   normal                  — initialize/warmup/render/listThemes/invalidate/shutdown all succeed.
//   crash-on-start          — exits(1) immediately, before reading any input (spawn-time failure).
//   crash-after-initialize  — initialize/warmup succeed, then the process exits(1) ~50ms later
//                             (simulates a host that dies shortly after reaching "ready").
//   crash-on-render         — initialize/warmup succeed; any `render` request exits(1) immediately
//                             instead of responding.
//   hang-on-render          — initialize/warmup succeed; any `render` request never responds
//                             (triggers the client-side render-timeout watchdog).
'use strict';

const fs = require('fs');
const path = require('path');
const { createMessageConnection, StreamMessageReader, StreamMessageWriter } = require('vscode-jsonrpc/node');

const mode = process.argv[2] || 'normal';
// A real, tiny, already-committed PNG (T6) stands in for the host's rendered output — T18's
// walking skeleton proves the wire end-to-end without needing the real LayoutRenderer (Phase 6).
const FAKE_RENDERED_PNG = path.join(__dirname, '..', '..', 'media', 'hello.png');

if (mode === 'crash-on-start') {
  process.stderr.write('fake-host: crash-on-start\n');
  process.exit(1);
}

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);

connection.onRequest('initialize', (...args) => {
  process.stderr.write('fake-host: initialize\n');
  if (mode === 'crash-after-initialize') {
    setTimeout(() => {
      process.stderr.write('fake-host: crash-after-initialize firing\n');
      process.exit(1);
    }, 50);
  }
  return { pinName: 'fake-host-pin', capabilities: [] };
});

connection.onRequest('warmup', () => {
  process.stderr.write('fake-host: warmup\n');
  return {};
});

connection.onRequest('render', (...args) => {
  const params = args[0] || {};
  process.stderr.write(`fake-host: render id=${params.id}\n`);
  if (mode === 'crash-on-render') {
    process.exit(1);
  }
  if (mode === 'hang-on-render') {
    return new Promise(() => {}); // never resolves — triggers the client watchdog
  }
  // Reflect the document content so the hot-reload integration test can drive ok/error transitions:
  // inlineContent (refresh) wins, else the file on disk. A "INFLATE_ERROR" sentinel yields a
  // structured error RenderResponse (P1-A AC3 shape); anything else renders the committed PNG.
  let content = params.inlineContent;
  if (content === undefined && params.docPath) {
    try {
      content = fs.readFileSync(params.docPath, 'utf8');
    } catch {
      content = '';
    }
  }
  if (typeof content === 'string' && content.includes('INFLATE_ERROR')) {
    return {
      id: params.id,
      status: 'error',
      warnings: [],
      error: { message: 'fake-host: simulated syntax error', file: params.docPath, line: 2, column: 1 },
      dependencies: [],
      timings: { prepareMs: 0, inflateMs: 0, renderMs: 0, totalMs: 0 },
      sessionRebuilt: false,
    };
  }
  // Drawable state reflection (T49): a <selector>/<ripple>/<animated-selector> is state-sensitive;
  // the picked state chooses the matched selector item so the toolbar loop can be driven end to end.
  const text = typeof content === 'string' ? content : '';
  const stateSensitive = /<\s*(selector|ripple|animated-selector)\b/.test(text);
  const states = (params.config && params.config.drawable && params.config.drawable.states) || [];
  let matchedStateItem;
  if (stateSensitive) {
    matchedStateItem = states.includes('pressed')
      ? { index: 0, stateAttrs: ['state_pressed'] }
      : { index: 3, stateAttrs: [] };
  }
  // T53 config-toolbar plumbing: echo the applied PreviewConfig back as a 'notice' warning so an
  // extension-side integration test (no real qualifier-selection/rendering here — that's covered
  // host-side by engineTest, T25 QualifierTest) can assert the extension sent the right config for
  // each toolbar control (night/device/orientation/density/theme/pixelScale) without needing real
  // pixels. Emitted for every ok render, not just drawables.
  const cfg = params.config || {};
  const device = cfg.device || {};
  const configNotice = {
    kind: 'notice',
    message:
      `config: theme=${cfg.themeName} night=${cfg.night} device=${device.id} ` +
      `widthDp=${device.widthDp} heightDp=${device.heightDp} density=${cfg.density} ` +
      `orientation=${cfg.orientation} pixelScale=${cfg.pixelScale}`,
  };
  return {
    id: params.id,
    status: 'ok',
    pngPath: FAKE_RENDERED_PNG,
    imageWidth: 1,
    imageHeight: 1,
    stateSensitive,
    matchedStateItem,
    warnings: [configNotice],
    dependencies: [],
    timings: { prepareMs: 0, inflateMs: 0, renderMs: 0, totalMs: 0 },
    sessionRebuilt: false,
  };
});

connection.onRequest('listThemes', () => [
  { name: 'Theme.Material3.DayNight', isProjectTheme: false, source: 'material' },
  { name: 'Theme.AppCompat.Light', isProjectTheme: false, source: 'appcompat' },
]);
connection.onRequest('invalidate', () => ({}));
connection.onRequest('shutdown', () => {
  setTimeout(() => process.exit(0), 5);
  return {};
});

connection.listen();
