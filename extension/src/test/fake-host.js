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

const { createMessageConnection, StreamMessageReader, StreamMessageWriter } = require('vscode-jsonrpc/node');

const mode = process.argv[2] || 'normal';

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
  return {
    id: params.id,
    status: 'ok',
    pngPath: '/tmp/fake.png',
    imageWidth: 1,
    imageHeight: 1,
    warnings: [],
    dependencies: [],
    timings: { prepareMs: 0, inflateMs: 0, renderMs: 0, totalMs: 0 },
    sessionRebuilt: false,
  };
});

connection.onRequest('listThemes', () => []);
connection.onRequest('invalidate', () => ({}));
connection.onRequest('shutdown', () => {
  setTimeout(() => process.exit(0), 5);
  return {};
});

connection.listen();
