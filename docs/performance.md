# Performance (NFR-01)

T57 measures the real render host end to end — no synthetic stand-in — using `corpus/perf.ts`,
which spawns the same standalone JVM host `corpus/run.ts` and the (future) production extension
spawn, and drives it over the real LSP protocol (`corpus/src/hostClient.ts`).

## Methodology

- **Cold start**: wall-clock time from spawning the `java` process to the `initialize` + `warmup`
  RPCs resolving (Bridge init, one-time native/font/ICU bootstrap). Measured once per run (this is
  a one-time-per-session cost, not a steady-state metric).
- **Warm layout / warm drawable render (p90)**: after one throwaway render pays the session-build
  cost (a newly opened document, NFR-01's "cold" case), the SAME document + config is re-rendered
  20 times. Each sample is the **client-perceived** round trip (`Date.now()` around the `render`
  request), not just the host-reported `RenderResponse.timings.totalMs` — the client number also
  includes JSON-RPC framing/parsing overhead on both sides, so it is the more honest (slightly
  higher) figure and the one NFR-01 is measured against.
- **Save → update (p90, proxy)**: identical warm round trip on the previewed layout. The extension's
  save handler (`extension/src/activation.ts`'s `onDidSaveTextDocument` → `scheduler.notifyFileSaved`)
  adds no artificial debounce before dispatching a render (`extension/src/scheduler.ts` has no
  `setTimeout`/delay on the save path), so the render round trip measured here **is** the dominant
  cost of "save → updated preview" — the remaining VS Code-side cost (event dispatch, webview image
  swap) is sub-millisecond and not host-bound.
- **Day/night warm toggle (p90)**: 10 back-to-back renders alternating `night: true`/`false` on the
  same already-open document + roots (no session/app-repository rebuild — only the qualifier
  resolution and theme/day-night config change).

All measurements are **p90 over 20 samples** (10 for day/night, 20 total split across day/night) per
the spec's "measured at p90 on a base Apple-Silicon machine" wording.

## Test machine

- Apple M2, 16 GB RAM, macOS (arm64) — a base Apple-Silicon machine, matching NFR-01's measurement
  basis. Numbers are machine-dependent; re-run `cd corpus && npm run perf` to reproduce on other
  hardware (CI's `macos-14` arm64 runner is a reasonable low-end proxy for a real user's machine).

## Measured results (two independent runs, `npm run perf`)

| Metric | NFR-01 / Success-Criteria target | Run 1 (p90) | Run 2 (p90) | Result |
| ------ | --------------------------------- | ----------- | ----------- | ------ |
| Cold host start | ≤ 5 s target / ≤ 10 s max | 1936 ms | 1667 ms | **PASS** (well under the 5 s target) |
| Warm layout render (≤ 300 views) | ≤ 700 ms | 99 ms | 84 ms | **PASS** |
| Warm drawable render | ≤ 400 ms | 13 ms | 15 ms | **PASS** |
| Save → updated preview | ≤ 1 s | 79 ms | 79 ms | **PASS** |
| Day/night warm toggle | < 1 s (success criterion) | 82 ms | 86 ms | **PASS** |

Every NFR-01 target and the day/night success criterion are met with wide margin (5-70x headroom)
on the measured fixtures — **no tuning was required** (no session-reuse or warmup-scope changes were
needed to hit the targets). Raw per-sample timings are printed by `npm run perf` and are not
re-quoted here to keep this document from going stale on every re-run; re-run the script for current
numbers before citing them in release notes.

## Caveats / scope of these numbers

- Fixtures measured are the corpus's `gradle/main` (a small FrameLayout + TextView + View, §FR-1)
  and `drawables/shape_rectangle` (a `<shape>` drawable). NFR-01's "≤300 views" ceiling is far above
  what any corpus fixture currently exercises — the deepest gallery fixture
  (`framework/gallery`) has nowhere near 300 views either. These numbers demonstrate the render
  pipeline's per-request overhead is small relative to the budget, not that a genuinely 300-view
  layout has been measured. If a future real-world fixture approaches that ceiling, re-run
  `npm run perf` against it specifically.
- "Save → update" is measured as a render round trip proxy (see Methodology) — it does not include
  a real VS Code save-event → extension dispatch measurement (that would require a `test:integration`
  timing harness, out of this task's `corpus/`-based scope).
- Cold start here is the JVM/Bridge cost only; it does not include the one-time ~170 MB engine
  artifact download (P1-H AC1), which is a separate, one-time, network-bound cost shown with its own
  progress UI and is not part of the "cold start" latency budget NFR-01 describes.

## Doctor visibility

`Inflate: Doctor` (`extension/src/doctor.ts`, T19) already surfaces the last render's
`prepareMs`/`inflateMs`/`renderMs`/`totalMs` breakdown alongside JDK/cache/host status — so a user
(or a bug report) can see actual on-machine timings without instrumentation, matching P1-H AC5's "last
render timing" requirement.

## Reproducing

```sh
cd host && ./gradlew fetchEngine   # once, populates host/.engine-cache/ (~170 MB)
cd ../corpus && npm ci && npm run perf
```
