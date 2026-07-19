# Inflate Extension ⇄ Host Protocol

**Status**: Authoritative contract (T10, Phase 2 / M1a). Both `extension/src/protocol.ts` (TypeScript)
and `host/src/main/kotlin/rpc/Dto.kt` (Kotlin/moshi) implement this contract and are tested against
the **same shared JSON fixtures** in `docs/protocol/fixtures/*.json` — a fixture is not "done" until
it round-trips byte-identically (modulo key order) on both sides.

Design references: `.specs/features/android-xml-preview/design.md` §Data Models, §D5. Decision log:
`.specs/STATE.md` AD-010 (protocol shape), AD-009 (why a subprocess host exists at all).

---

## 1. Transport & framing (AD-010)

- The extension spawns exactly one render-host JVM subprocess per VS Code window (`HostManager`, T17).
- Requests/responses/notifications are **JSON-RPC 2.0** messages, framed **LSP-style** over stdio:

  ```
  Content-Length: <byte-length-of-json-utf8>\r\n
  \r\n
  <json-utf8-bytes>
  ```

  - The header line is terminated by `\r\n`; the header block is terminated by a blank `\r\n`.
  - `Content-Length` counts the **UTF-8 byte length** of the JSON body only (not the headers).
  - Multiple headers are legal (e.g. an optional `Content-Type`) but only `Content-Length` is required
    or interpreted; unknown headers are ignored.
  - A reader MUST tolerate the body arriving fragmented across multiple OS reads, and MUST tolerate
    two or more complete frames arriving back-to-back in a single read (no assumption that one
    `read()` == one frame).
  - A malformed header block (missing/unparseable `Content-Length`) is a framing error: the reader
    MUST reject the stream rather than guess a length.

- **stdout is reserved exclusively for protocol frames.** The host never writes anything else to
  stdout. All host logging (including anything a dependency might print) is routed to **stderr**,
  which the extension captures into the "Inflate" output channel and the `HostManager` stderr ring
  buffer (T17) — never parsed as protocol.
- Transport library: the extension uses `vscode-jsonrpc`'s stream-based reader/writer (its native LSP
  framing) over the child's stdio; the host implements the equivalent ~100-line reader/writer itself
  (`host/src/main/kotlin/rpc/Framing.kt`) using moshi for the JSON layer — no protocol library
  dependency on the JVM side.

## 2. Methods (extension → host, request/response)

| Method | Params | Result | Notes |
| ------ | ------ | ------ | ----- |
| `initialize` | `InitializeParams` | `{ pinName: string, capabilities: string[] }` | First call after spawn; sets engine paths, output/overlay dirs, log level. Must precede `render`/`warmup`/`listThemes`. |
| `warmup` | `{ rootsHint?: string[] }` | `{}` | Optional pre-warm — builds the Bridge/session ahead of the first real render (NFR-01). Safe to call multiple times; a no-op once warm. |
| `render` | `RenderRequest` | `RenderResponse` | The only method that runs on the host's single render thread. At this phase (T13) the handler is **stubbed**: it always returns a structured `RenderResponse` with `status: 'error'` and `error.message` naming the method as not yet implemented — no crash, no protocol violation. Real rendering lands in Phase 6 (T35+). |
| `listThemes` | `{ roots: string[], packageName: string }` | `ThemeInfo[]` | Enumerates project + bundled themes (CFG-04). Stubbed identically to `render` at this phase. |
| `invalidate` | `{ paths: string[] }` | `{}` | Marks the app resource repository dirty; next `render` rebuilds it (D5 session caching). No-op acknowledgment at this phase. |
| `shutdown` | `{}` | `{}` | Graceful shutdown request; host SHOULD respond then exit. The extension also sends SIGTERM → 3s grace → SIGKILL regardless (belt-and-suspenders, T17). |

Unknown methods receive a JSON-RPC standard error response (`code: -32601`, "Method not found") —
never a crash, never a dropped connection.

## 3. Notifications (host → extension, no response expected)

| Notification | Params | Notes |
| ------------- | ------ | ----- |
| `progress` | `{ stage: string, renderId?: number }` | Staged progress during slow operations (cold start, artifact-dependent warmup). |
| `log` | `{ level: 'info' \| 'debug' \| 'warn' \| 'error', message: string, renderId?: number }` | Structured log lines the extension mirrors into the "Inflate" output channel (in addition to raw stderr capture). |

## 4. Cancellation & staleness (P1-F AC3)

- `RenderRequest.id` is a **monotonically increasing integer per document**, assigned by the
  extension's `RenderScheduler`.
- The extension never sends a request it has already superseded: a new render request for the same
  document replaces the pending one in the scheduler's queue *before* dispatch (coalescing). This
  means at most one `render` call per document is ever in flight from the extension's side.
- Because the host has a single render thread, a request already executing runs to completion (or
  hits its `timeoutMs` watchdog) — it is never interrupted mid-render.
- The extension is still responsible for **discarding stale responses on receipt**: if a
  `RenderResponse.id` is less than the last request ID the extension sent for that document, the
  response MUST be dropped and never applied to the preview panel. This handles the edge case of a
  response arriving after a newer request was already coalesced away by the time the older one's
  result comes back.
- `shutdown`/timeout paths never leave a request "hanging forever": a watchdog-killed host produces a
  synthetic error response (or the extension synthesizes one locally) so every dispatched request ID
  eventually resolves or is explicitly abandoned by a host restart.

## 5. Data Transfer Objects

Every DTO below has a field-level description here and at least one fixture under
`docs/protocol/fixtures/`. Fixtures are consumed verbatim by both `protocol.test.ts` (T11) and
`DtoTest.kt` (T12) — this file and the fixtures are the single source of truth; the TS/Kotlin types
are derived from it, never the other way around.

### 5.1 `RenderRequest` — fixture: `fixtures/render-request.json`

```typescript
interface RenderRequest {
  id: number                       // monotonic per document (see §4)
  docPath: string                  // absolute path of the previewed file
  docKind: 'layout' | 'drawableXml' | 'ninePatch' | 'color'
  inlineContent?: string           // dirty buffer content for `Refresh Preview` (P1-F AC4); omitted = read docPath from disk
  roots: string[]                  // ordered local resource roots (design §D3), absolute paths
  packageName: string              // resolved or fallback `com.inflate.preview`
  config: PreviewConfig
  timeoutMs: number                // per-render watchdog budget; default 15000
}
```

### 5.2 `PreviewConfig` — nested inside `RenderRequest.config`

```typescript
interface PreviewConfig {
  themeName: string                // e.g. "Theme.Material3.DayNight" or a project theme name
  isProjectTheme: boolean           // true if themeName resolves from the project's own resources
  night: boolean                   // → DeviceConfig.nightMode
  device: DevicePreset
  orientation: 'portrait' | 'landscape'
  density: 'mdpi' | 'hdpi' | 'xhdpi' | 'xxhdpi' | 'xxxhdpi'
  pixelScale: 1 | 2                 // zoom-crispness re-render (UX-03); 2 past the 200% zoom threshold
  drawable?: {
    states: string[]                // DrawableState values, e.g. ["pressed"]; empty/omitted = default state
    sizeDp?: { w: number, h: number } // override for non-intrinsic drawables
  }
}
```

`DrawableState` values: `'default' | 'pressed' | 'checked' | 'disabled' | 'focused' | 'selected' | 'activated'` (P1-D AC1).

### 5.3 `DevicePreset` — nested inside `PreviewConfig.device` — fixture: `fixtures/device-presets.json`

```typescript
interface DevicePreset {
  id: string
  label: string
  widthDp: number
  heightDp: number
  defaultDensity: string
  sizeBucket: 'normal' | 'large' | 'xlarge'
}
```

The 5 required built-ins (P1-E AC2): `smallPhone` (360×640), `phone` (411×891), `largePhone`
(480×1040), `tablet7` (600×960), `tablet10` (800×1280).

### 5.4 `RenderResponse` — fixtures: `fixtures/render-response-ok.json`, `fixtures/render-response-error.json`, `fixtures/render-response-warnings.json`

```typescript
interface Warning {
  kind: 'unresolvedRef' | 'substitutedClass' | 'bindingReplaced' | 'levelDefault' | 'notice' | 'materialAttrMissing'
  message: string                  // human-readable, shown in the warnings strip
  detail?: string                  // e.g. the missing reference name, substituted class name, attribute name
}

interface RenderResponse {
  id: number                       // echoes RenderRequest.id
  status: 'ok' | 'error'
  pngPath?: string                 // present iff status === 'ok'
  imageWidth?: number
  imageHeight?: number
  staticPreviewBadge?: boolean      // animated drawable rendered as its frame-0 (DRW-04)
  matchedStateItem?: { index: number, stateAttrs: string[] } // DRW-07, selector state matching
  canvasCapped?: boolean            // true if the 4096×4096 px cap clipped the output
  warnings: Warning[]                // always present, possibly empty
  error?: { message: string, file?: string, line?: number, column?: number } // present iff status === 'error'
  dependencies: string[]             // resolved files this render read, for hot-reload dependency tracking (UX-02)
  timings: { prepareMs: number, inflateMs: number, renderMs: number, totalMs: number }
  sessionRebuilt: boolean            // true if the app resource repository was rebuilt for this render
}
```

At **this phase (T13)**, `render` always returns the `error` variant with
`error.message` describing the method as not yet implemented, `warnings: []`, `dependencies: []`,
and `timings` all zero — a structurally valid, spec-shaped stub, never a bare protocol error.

### 5.5 `InitializeParams` — fixture: `fixtures/initialize-params.json`

```typescript
interface InitializeParams {
  layoutlibRuntimeRoot: string
  layoutlibResourcesRoot: string
  classpathNote: 'assembled-by-launcher'  // the classpath itself is passed at process spawn, not over the protocol; this field just documents that for Doctor
  libraryResDirs: string[]
  libraryPackages: string[]
  outputDir: string                       // where rendered PNGs are written (session dir under globalStorage)
  overlayDir: string                      // where the preprocessor writes its overlay copies
  compileSdkVersion: 34
  logLevel: 'info' | 'debug'
}
```

### 5.6 `ThemeInfo` — fixture: `fixtures/theme-info-list.json` (array; `listThemes` result shape)

```typescript
interface ThemeInfo {
  name: string
  isProjectTheme: boolean
  source: 'project' | 'material' | 'appcompat' | 'platform'
}
```

## 6. Fixture manifest

| Fixture | DTO | Variant |
| ------- | --- | ------- |
| `render-request.json` | `RenderRequest` | Happy path, full config incl. `drawable`, plus one tolerated unknown top-level field (`_extra`) proving unknown-field tolerance |
| `render-response-ok.json` | `RenderResponse` | `status: 'ok'`, no warnings, `sessionRebuilt: false` |
| `render-response-error.json` | `RenderResponse` | `status: 'error'`, `error` populated, no `pngPath` |
| `render-response-warnings.json` | `RenderResponse` | `status: 'ok'`, non-empty `warnings` (all 6 kinds), `canvasCapped: true`, `matchedStateItem` populated |
| `initialize-params.json` | `InitializeParams` | Happy path |
| `theme-info-list.json` | `ThemeInfo[]` | One entry per `source` value |
| `device-presets.json` | `DevicePreset[]` | All 5 required built-ins |
| `invalid/render-request-missing-id.json` | `RenderRequest` | Missing required field `id` — MUST be rejected |
| `invalid/render-response-missing-status.json` | `RenderResponse` | Missing required field `status` — MUST be rejected |

Both `protocol.test.ts` and `DtoTest.kt` load every non-`invalid/` fixture and assert it
parses/serializes back byte-equivalently (modulo key order), and load every `invalid/` fixture and
assert it is rejected with an error naming the missing/invalid field.
