# android-xml-preview Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/android-xml-preview/design.md`
**Spec**: `.specs/features/android-xml-preview/spec.md`
**Status**: Approved (user, 2026-07-19) — **IN EXECUTION**
**Date**: 2026-07-19

**Execution progress** (orchestrator-maintained):
- ✅ **Phase 1 (M0), T1–T9** — complete 2026-07-19. Commits 857a4b8…0fb303c. M0 gate PASSED (architecture validated); item 4 fallback → AD-013. Timings: cold 1956 ms / warm 30 ms / rebuild 9 ms; engine download 159.9 MB.
- ✅ **Phase 2 (T10–T13) + Phase 3 (T14–T19)** — complete 2026-07-19 (Batch 2, sonnet). Commits 2551dfc…05f2bdc. Ext 53 vitest + 2 integration; host 51 JUnit. Debt tracked in STATE.md (real host spawn wiring deferred to T39/T60; manifest coords duplicated → T38).
- ✅ **Phase 4 (T20–T27)** — complete 2026-07-19 (Batch 3, session). Commits 8793ee8…4122268. Ext 79 vitest; host 66 JUnit + 8 engineTest. RES-02 priority = reversed roots; use `appResourceExists` not `getIdentifier`. Verifier flag: T24 SessionTest weak lines (pixel assertions are the real proof).
- ✅ **Phase 5 (T28–T32)** — complete 2026-07-19 (Batch 4, sonnet). Commits 557e22d…114ee35. Host unit 66→96. UnknownViewSubstitutor absorbed into Scan.kt. T35 carry-forward: wire EngineAdapter.overlayDir = Preprocessor overlayBaseDir; map lineMap for errors; PreprocessResult.warnings → RenderResponse.warnings.
- ✅ **Phase 6 (T33–T37)** — complete 2026-07-19 (Batch 5, session). Commits f0f36b0…8520957. Ext 109 vitest + 6 integration; host 102 JUnit + 17 engineTest. Warm render 207 ms. **2 open functional gaps for Verifier fix tasks:** (1) Preprocessor not comment-aware (correctness bug); (2) Degradation (T27) not wired into live LayoutRenderer path (RES-04 gap). See STATE.md.
- ◐ **Batch 6 = Phase 7 (T38–T42)** — IN PROGRESS (session). **T38 ✅** (`7052c25`, debt #2 resolved). **T39–T42 BLOCKED** on layoutlib framework-class delegation gap (AD-014 in STATE.md) — androidx/Material views fail with `NoClassDefFoundError: android/os/Build$VERSION` because the published layoutlib jar omits the delegated framework classes. **Inserted task T38b** (resolve delegation, investigation-first: mirror Paparazzi 1.3.5's own androidx-render mechanism, reuse WIP patch) re-dispatched with T39–T42.
- ⬜ Phases 8–10 pending. Batch plan: B7=P8(session) · B8=P9(sonnet) · B9=P10(sonnet) → Verifier.

**Inserted task — T38b: Resolve layoutlib framework-class delegation for library views**
- **What**: Enable app/library view classes (androidx/Material) to load the delegated framework classes (`android.os.Build` etc.) that the published layoutlib jar omits. INVESTIGATION-FIRST: determine how Paparazzi 1.3.5 renders androidx/Material in its own tests, then mirror the minimal mechanism (candidate approaches in AD-014 — choose by evidence). Reuse `scratchpad/T39-wip.patch` (proven RClassGenerator + library-repo wiring). **Where**: `host/src/main/kotlin/engine/*` (classloader/delegation), `host/build.gradle.kts` (`fetchEngine`/engineTest libs if setup-time generation is chosen), `host/src/engineTest/kotlin/engine/*`. **Depends on**: T38. **Requirement**: LAY-05 precondition, AD-014. **Done when**: an engineTest inflates a real `MaterialButton` (and `ConstraintLayout`) as the actual class (no NoClassDefFoundError, no MockView) under `Theme.Material3.DayNight`; mechanism documented in ENGINE_SURFACE.md. **Gate**: full (`cd host && ./gradlew test engineTest`). **Commit**: `Resolve layoutlib framework-class delegation for library views`

**Commit policy (user requirement)**: one atomic commit per task, committed immediately when the task's gate passes. Commit titles start with an imperative verb ("Create", "Add", "Implement", "Update", "Wire", "Document", "Pin", …), ≤ 72 chars, body explains what/why when non-obvious. Never batch tasks into one commit.

---

## Test Coverage Matrix

> Generated from design + user answers (2026-07-19) — greenfield repo, no existing tests. Guidelines found: none — strong defaults applied. Stack confirmed by user: **Vitest** (extension), **JUnit 5** (host), **separate `engineTest` source set + Node corpus runner** (engine/e2e).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Extension pure logic (classifier, roots, scheduler, host state machine via fake child, jdk, artifacts, config, doctor report) | unit (Vitest) | All branches; 1:1 to spec ACs; every listed edge case | `extension/src/**/*.test.ts` | `cd extension && npm test` |
| Protocol DTOs — TS side | unit (Vitest) | Every DTO round-trips the shared JSON fixtures | `extension/src/protocol.test.ts` | `cd extension && npm test` |
| Webview UI logic (toolbar state, zoom, messages) | unit (Vitest + jsdom) | Message contract + state logic branches | `extension/webview-ui/**/*.test.ts` | `cd extension && npm test` |
| Extension ⇄ VS Code integration (activation, commands, panel, hot-reload loop) | integration (@vscode/test-electron) | Commands + render loop: happy + error + stale paths | `extension/src/test/integration/**/*.test.ts` | `cd extension && npm run test:integration` |
| Host pure logic (RPC framing, DTOs, Preprocessor, ThemeCatalog logic, LogBridge, manifest task) | unit (JUnit 5) | All branches; 1:1 to spec ACs; every listed edge case | `host/src/test/kotlin/**` | `cd host && ./gradlew test` |
| Host engine integration (EngineAdapter, LayoutRenderer, DrawableRenderer — needs cached layoutlib artifacts) | integration (JUnit 5, `engineTest` source set) | Every render-path AC: happy + edge + error | `host/src/engineTest/kotlin/**` | `cd host && ./gradlew engineTest` |
| Golden-image corpus (NFR-07) | e2e (Node runner + pixelmatch) | ≥30 fixtures render; pixel-diff within AA tolerance | `corpus/**` + `fixtures/**` | `npm run corpus` (repo root) |
| Fixtures, docs, CI config, package manifests, engine-manifest.json | none | — (build gate only) | — | build gate only |

## Gate Check Commands

> Generated from the confirmed stack — greenfield, so commands are established by Phase 1–2 tasks and used verbatim thereafter.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `cd extension && npm test` and/or `cd host && ./gradlew test` (side(s) touched) |
| Full | After tasks with engineTest/integration tests | Quick + `cd host && ./gradlew engineTest` and/or `cd extension && npm run test:integration` |
| Build | After phase completion or config/fixture/docs-only tasks | `cd extension && npm run build && npm test && cd ../host && ./gradlew build engineTest` (+ `npm run corpus` once it exists, Phase 10) |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order. Phases map to the spec's internal milestones M0–M7 (M1 and M3 split at cohesion seams to stay near the ~7-task worker budget).

Diagrams below show **dependency arrows** (`A → B` = B depends on A). Execution within a phase is strictly sequential in task-number order regardless of the arrows; cross-phase inputs are marked `(Pn)`.

### Phase 1 (M0): Engine Spike — proves AD-009 before anything builds on it

Order: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9

```
T1 → T2 ; T1 → T3
T2 → T4 ; T3 → T4
T4 → T5
T5 → T6 ; T5 → T7 ; T5 → T8
T4 → T9 ; T5 → T9 ; T6 → T9 ; T7 → T9 ; T8 → T9
```

### Phase 2 (M1a): Protocol Contract

Order: T10 → T11 → T12 → T13

```
T9 (P1) → T10
T10 → T11 ; T10 → T12
T12 → T13
```

### Phase 3 (M1b): Setup & Host Lifecycle

Order: T14 → T15 → T16 → T17 → T18 → T19

```
T9 (P1) → T14 ; T9 (P1) → T15
T15 → T16
T13 (P2) → T17 ; T14 → T17 ; T16 → T17
T13 (P2) → T18 ; T16 → T18 ; T17 → T18
T18 → T19
```

### Phase 4 (M2): Resource Resolution

Order: T20 → T21 → T22 → T23 → T24 → T25 → T26 → T27

```
T9 (P1) → T20
T20 → T21 → T22 → T23
T13 (P2) → T24 ; T20 → T24
T24 → T25 ; T24 → T26 ; T24 → T27
```

### Phase 5 (M3a): Preprocessing

Order: T28 → T29 → T30 → T31 → T32

```
T9 (P1) → T28
T28 → T29 ; T28 → T30
T29 → T31 ; T30 → T31
T31 → T32
```

### Phase 6 (M3b): Layout Render Loop

Order: T33 → T34 → T35 → T36 → T37

```
T28 (P5) → T33
T9 (P1) → T34
T32 (P5) → T35 ; T33 → T35 ; T34 → T35 ; T24 (P4) → T35
T17 (P3) → T36 ; T22 (P4) → T36
T35 → T37 ; T36 → T37
```

### Phase 7 (M4): androidx/Material

Order: T38 → T39 → T40 → T41 → T42

```
T15 (P3) → T38 ; T16 (P3) → T38
T38 → T39 ; T24 (P4) → T39
T39 → T40 → T41 → T42
```

### Phase 8 (M5): Drawables

Order: T43 → T44 → T45 → T46 → T47 → T48 → T49

```
T9 (P1) → T43
T43 → T44 ; T35 (P6) → T44
T44 → T45 → T46
T44 → T47 ; T44 → T48
T45 → T49 ; T46 → T49 ; T37 (P6) → T49
```

### Phase 9 (M6): Config Toolbar

Order: T50 → T51 → T52 → T53

```
T23 (P4) → T50 ; T37 (P6) → T50
T50 → T51 ; T26 (P4) → T51
T51 → T52
T52 → T53 ; T25 (P4) → T53
```

### Phase 10 (M7): Hardening & Release

Order: T54 → T55 → T56 → T57 → T58 → T59 → T60

```
T53 (P9) → T54
T54 → T55 → T56
T56 → T57 ; T56 → T58
T57 → T59 → T60
```

---

## Task Breakdown

### Phase 1 (M0): Engine Spike

### T1: Create host Gradle project skeleton

**What**: Kotlin JVM Gradle project in `host/` — JDK 17 toolchain, pinned Kotlin version, dependencies `app.cash.paparazzi:paparazzi:1.3.5` + tools jars 31.4.2 (compileOnly where cache-provided), JUnit 5, `engineTest` source set registered, `.gitignore`, empty `Main.kt` compiles.
**Where**: `host/build.gradle.kts`, `host/settings.gradle.kts`, `host/gradle/libs.versions.toml`, `host/src/main/kotlin/Main.kt`, root `.gitignore`
**Depends on**: None
**Reuses**: Pin matrix from design §D6; AD-012 repo layout
**Requirement**: AD-012, D6 (foundation)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `cd host && ./gradlew build` succeeds on JDK 17
- [ ] `./gradlew test` and `./gradlew engineTest` run (0 tests, green)
- [ ] Version catalog pins paparazzi 1.3.5, layoutlib 14.0.11, tools 31.4.2, Kotlin exact version

**Tests**: none (build config layer)
**Gate**: build (`cd host && ./gradlew build`)
**Commit**: `Create host Gradle project with pinned Paparazzi 1.3.5 engine`

---

### T2: Add friend-paths compilation and engine surface inventory

**What**: Wire `-Xfriend-paths=<paparazzi-1.3.5.jar>` into the host compile; add `EngineSurfaceProbe.kt` referencing every internal symbol the design needs (SessionParamsBuilder, PaparazziCallback, LayoutPullParser, PaparazziLogger, `internal.resources.*` repositories); create `host/ENGINE_SURFACE.md` enumerating each symbol with its purpose. *(M0 checklist item 1 — AD-009 gate; on failure, record and trigger the pre-agreed vendoring fallback.)*
**Where**: `host/build.gradle.kts`, `host/src/main/kotlin/engine/EngineSurfaceProbe.kt`, `host/ENGINE_SURFACE.md`
**Depends on**: T1
**Reuses**: AD-009 symbol list from design §D2/#12
**Requirement**: AD-009 (R1/R2 mitigation)

**Tools**:
- MCP: NONE
- Skill: NONE (WebFetch for Paparazzi 1.3.5 source cross-check if a symbol is missing)

**Done when**:
- [ ] Host compiles with the probe file touching all internal symbols
- [ ] `ENGINE_SURFACE.md` lists every touched internal symbol + fallback note
- [ ] Unit test asserts probe classes are loadable (guards silent flag loss)

**Tests**: unit (host)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add friend-paths engine access with ENGINE_SURFACE inventory`

---

### T3: Add dev-time engine artifact fetch task

**What**: Gradle task `fetchEngine` downloading the pinned Google Maven artifacts (layoutlib jar, runtime per-arch, resources, tools jars, androidx/Material top-level AARs) into `host/.engine-cache/`, printing measured size + SHA-256 per artifact (Q4 verification), unzipping runtime/resources. Feeds all spikes and later `engineTest` runs.
**Where**: `host/build.gradle.kts` (or `host/buildSrc/`), `host/.engine-cache/` (gitignored)
**Depends on**: T1
**Reuses**: Artifact coordinates + measured sizes from design §Q4/D6
**Requirement**: D6, Q4 (SETUP-02 precursor)

**Tools**:
- MCP: NONE
- Skill: NONE (WebFetch to spot-check Google Maven URLs if a download 404s)

**Done when**:
- [ ] `./gradlew fetchEngine` populates the cache; re-run is a no-op (checksum-verified)
- [ ] Printed sizes recorded in `host/ENGINE_SURFACE.md` appendix vs Q4 estimate
- [ ] Unit test covers URL construction for classifier/arch matrix

**Tests**: unit (host — URL/coordinate logic)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add fetchEngine task downloading pinned layoutlib artifacts`

---

### T4: Implement EngineAdapter bridge init and rebuildable repositories

**What**: `EngineAdapter` with the AD-009 split: `initBridgeOnce()` (system props, fonts/ICU/natives, Build patching, `Bridge().init` — mirrors `Renderer.prepare()` order) and `buildRepositories(roots)` (framework repo once, app repo rebuildable); `invalidate()` marks dirty. *(M0 checklist item 2 — hot-reload architecture gate; measure rebuild ms.)*
**Where**: `host/src/main/kotlin/engine/EngineAdapter.kt`, `host/src/engineTest/kotlin/engine/EngineAdapterTest.kt`
**Depends on**: T2, T3
**Reuses**: Paparazzi `Renderer.prepare()` sequence via friend-paths; ENGINE_SURFACE.md
**Requirement**: AD-009, HOST-02 precursor, RES-02 (repositories)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: init once + repo build succeeds against a minimal fixture res tree
- [ ] engineTest: edit `values/colors.xml` → `invalidate()` → rebuilt repo reflects new color while process stays up; rebuild duration logged
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement EngineAdapter with split Bridge init and rebuildable repos`

---

### T5: Implement hello-render to PNG

**What**: Minimal render path: session from EngineAdapter → inflate a hardcoded LinearLayout fixture by generated resource name → snapshot → `PngWriter` writes `<renderId>.png` (keeps last 2 per doc). *(M0 checklist item 3, host half.)*
**Where**: `host/src/main/kotlin/render/HelloRender.kt`, `host/src/main/kotlin/out/PngWriter.kt`, `host/src/engineTest/kotlin/render/HelloRenderTest.kt`, fixture `host/src/engineTest/resources/hello/`
**Depends on**: T4
**Reuses**: PaparazziSdk snapshot choreography (public path); overlay unique-name scheme from design Q3
**Requirement**: LAY-01 (seed), AD-010 (PNG-by-path)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: PNG exists, expected device-pixel dimensions, non-blank pixels, alpha preserved
- [ ] PngWriter prunes to last 2 files per document
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement hello-render pipeline producing PNG snapshots`

---

### T6: Create extension scaffold with throwaway preview webview

**What**: `extension/` npm project — TypeScript strict, esbuild bundle, Vitest wired (`npm test`), `@vscode/test-electron` harness (`npm run test:integration`), minimal `package.json` contributions, temporary `inflate.helloPreview` command showing T5's PNG via `asWebviewUri`. *(M0 checklist item 3, end-to-end gate.)*
**Where**: `extension/package.json`, `extension/tsconfig.json`, `extension/src/extension.ts`, `extension/src/test/integration/hello.test.ts`
**Depends on**: T5
**Reuses**: VS Code webview API; design §Integration points
**Requirement**: UX-01 (seed), NFR-02 (lazy activation baseline)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm run build` + `npm test` green; integration test opens the hello panel and finds the img element
- [ ] Activation adds ≤ 200 ms (no eager work beyond context-key stub)
- [ ] Gate check passes: `cd extension && npm test && npm run test:integration`

**Tests**: integration (test-electron) + unit scaffold
**Gate**: full (extension side)
**Commit**: `Create extension scaffold with hello preview webview`

---

### T7: Add LogBridge and prove MockView placeholder fallback

**What**: `LogBridge` implementing `ILayoutLog`/PaparazziLogger role (per-render sink, never throws); engineTest rendering a custom-view fixture proving layoutlib MockView placeholder appears (not a crash) and the warning is captured. *(M0 checklist item 4 — AD-007 gate; plan B = preprocessor tag substitution.)*
**Where**: `host/src/main/kotlin/log/LogBridge.kt`, `host/src/engineTest/kotlin/render/MockViewTest.kt`, fixture with `com.example.FakeView`
**Depends on**: T5
**Reuses**: layoutlib BridgeInflater MockView behavior (design finding #4)
**Requirement**: LAY-03, UX-05 (capture side)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: custom-view fixture renders; placeholder region non-empty; no exception escapes
- [ ] LogBridge captures the load failure as a `substitutedClass` warning entry
- [ ] Unit test: LogBridge severity mapping + never-throws behavior

**Tests**: unit + integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Add LogBridge and verify MockView placeholder for unknown views`

---

### T8: Prove drawable state injection in a spike

**What**: engineTest spike: inflate a 4-item selector drawable, apply state sets (default/pressed/checked/disabled) via a host-owned view's `onCreateDrawableState` merge, snapshot each, assert visibly different pixels and correct `findStateDrawableIndex` matched-item index. *(M0 checklist item 5 — Q2 gate; fallback = re-inflate per state.)*
**Where**: `host/src/main/kotlin/render/StateImageView.kt`, `host/src/engineTest/kotlin/render/StateInjectionTest.kt`, selector fixture
**Depends on**: T5
**Reuses**: Design Q2 findings (framework state APIs under layoutlib API 34)
**Requirement**: DRW-03, DRW-07 (mechanism proof)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] ≥3 states produce pairwise-different images; matched index correct for each state
- [ ] Fallback decision recorded in ENGINE_SURFACE.md if injection fails
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Add state injection spike proving selector state rendering`

---

### T9: Document M0 findings and timings

**What**: Measure cold start (JVM spawn → first PNG) and warm render on the dev machine vs NFR-01 budget *(M0 checklist item 6)*; write `docs/m0-findings.md` (timings, rebuild ms from T4, download sizes from T3, gate outcomes 1–6, any fallback triggered); update `.specs/STATE.md` handoff + decisions if a fallback changed strategy.
**Where**: `docs/m0-findings.md`, `host/ENGINE_SURFACE.md`, `.specs/STATE.md`
**Depends on**: T4, T5, T6, T7, T8
**Reuses**: design §M0 checklist
**Requirement**: NFR-01 (baseline), M0 closure

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All six M0 checklist items have a recorded PASS/fallback outcome
- [ ] Cold/warm timings recorded against NFR-01 targets
- [ ] STATE.md handoff updated to "M0 complete"

**Tests**: none (docs layer)
**Gate**: build (`cd host && ./gradlew build engineTest`)
**Commit**: `Document M0 spike findings and engine timings`

---

### Phase 2 (M1a): Protocol Contract

### T10: Create protocol contract document with shared fixtures

**What**: `docs/protocol.md` — the authoritative contract per design §Data Models: methods (`initialize`, `warmup`, `render`, `listThemes`, `invalidate`, `shutdown`), notifications (`progress`, `log`), LSP framing rules, stdout/stderr hygiene, all DTOs; plus machine-readable JSON example fixtures (one per DTO, happy + error variants) both sides test against.
**Where**: `docs/protocol.md`, `docs/protocol/fixtures/*.json`
**Depends on**: T9
**Reuses**: DTO definitions from design §Data Models (verbatim)
**Requirement**: AD-010, HOST-01/02 (contract)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every design DTO appears with field-level docs + a JSON fixture
- [ ] Framing + cancellation (stale-ID discard) semantics specified
- [ ] Fixtures include `RenderResponse` ok/error/warnings variants

**Tests**: none (docs layer — fixtures consumed by T11/T12 tests)
**Gate**: build
**Commit**: `Create protocol contract with shared DTO fixtures`

---

### T11: Create TypeScript protocol DTOs

**What**: `extension/src/protocol.ts` — types + runtime validators for every DTO; Vitest round-trips each shared fixture through the validators (unknown-field tolerance, required-field failures).
**Where**: `extension/src/protocol.ts`, `extension/src/protocol.test.ts`
**Depends on**: T10
**Reuses**: `docs/protocol/fixtures/*.json`
**Requirement**: AD-010

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All fixtures parse/validate; invalid variants rejected with field-naming errors
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Create TypeScript protocol DTOs validated against shared fixtures`

---

### T12: Create Kotlin protocol DTOs

**What**: `host/src/main/kotlin/rpc/Dto.kt` — moshi-annotated DTOs mirroring `protocol.ts`; JUnit round-trips the same shared fixtures (serialize + deserialize equality).
**Where**: `host/src/main/kotlin/rpc/Dto.kt`, `host/src/test/kotlin/rpc/DtoTest.kt`
**Depends on**: T10
**Reuses**: moshi 1.15.1 (already on classpath); `docs/protocol/fixtures/*.json`
**Requirement**: AD-010

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All fixtures round-trip byte-equivalently (modulo key order)
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Create Kotlin protocol DTOs with moshi fixture round-trip tests`

---

### T13: Implement host RpcServer with LSP framing

**What**: `RpcServer` — `Content-Length` header framing reader/writer over stdio (~100 lines), IO thread + single render thread, write mutex, stdout reserved for frames (all logging → stderr), `initialize`/`shutdown` handled, `render` stubbed to a structured error, exits on stdin close, uncaught render-thread exception → error response with engine state preserved.
**Where**: `host/src/main/kotlin/rpc/RpcServer.kt`, `host/src/main/kotlin/rpc/Framing.kt`, `host/src/main/kotlin/Main.kt`, `host/src/test/kotlin/rpc/FramingTest.kt`, `host/src/test/kotlin/rpc/RpcServerTest.kt`
**Depends on**: T12
**Reuses**: moshi DTOs (T12); design §D5 framing spec
**Requirement**: HOST-01 (host side), AD-010

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Framing tests: split/fragmented frames, back-to-back frames, MB-scale payload, malformed header rejection
- [ ] Server tests (piped streams): initialize→response, unknown method→error, stdin close→clean exit, render-thread exception→error response + next request still served
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Implement RpcServer with LSP framing over stdio`

---

### Phase 3 (M1b): Setup & Host Lifecycle

### T14: Implement JdkLocator with macOS detection chain

**What**: `JdkLocator` — precedence `inflate.javaHome` > `JAVA_HOME` > `PATH` > `/usr/libexec/java_home` > Homebrew > SDKMAN > Android Studio JBR > `/Library/Java/JavaVirtualMachines/*`; version from `<home>/release` (no process spawn); first source ≥ 17 wins; guided error (required version, download link, re-check) when absent; in-memory cache re-validated on spawn failure.
**Where**: `extension/src/jdk.ts`, `extension/src/jdk.test.ts`
**Depends on**: T9
**Reuses**: design component #6 chain (AD-003, AD-008)
**Requirement**: SETUP-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests (fs/env fixtures) cover every source in precedence order, version parse, <17 rejection, guided-error shape (P1-H AC2/AC3 1:1)
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement JdkLocator with macOS JDK detection chain`

---

### T15: Add engine-manifest generation task

**What**: Gradle task `generateEngineManifest` resolving the full pinned closure (layoutlib triple per-arch, tools jars, androidx/Material AARs + transitives) → `engine-manifest.json` `{pinName, artifacts:[{group,name,version,classifier?,kind,url,sha256,sizeBytes}]}`; committed to repo; never hand-maintained (AD-011).
**Where**: `host/build.gradle.kts` (task), `extension/engine-manifest.json` (generated, committed), `host/src/test/kotlin/manifest/ManifestTaskTest.kt`
**Depends on**: T9
**Reuses**: T3 coordinate logic; design §D4 pin table
**Requirement**: SETUP-02, AD-011, D6

**Tools**:
- MCP: NONE
- Skill: NONE (WebFetch to verify a sampled URL/sha if resolution looks off)

**Done when**:
- [ ] Task emits manifest containing the D6 pin matrix + androidx closure with sha256/size for every artifact
- [ ] Unit test validates manifest schema + presence of required pins + per-arch runtime entries
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add engine manifest generation task with pinned artifact closure`

---

### T16: Implement ArtifactManager with verified downloads

**What**: `ArtifactManager` — reads bundled `engine-manifest.json`; downloads missing artifacts to `globalStorage/engine/<manifestHash>/tmp/` with progress + streamed SHA-256; unzips runtime/resources/AARs (classes.jar, res/, package name, assets); atomic rename into place; `.complete` marker; per-artifact retry on checksum/interrupt failure; offline detection; `clear()`; `cacheState()` report.
**Where**: `extension/src/artifacts.ts`, `extension/src/artifacts.test.ts`
**Depends on**: T15
**Reuses**: manifest from T15; design component #7; cache layout from §Data Models
**Requirement**: SETUP-02, NFR-03/04, AD-006/AD-011

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests with a local HTTP fixture server + tiny artifacts: fresh install, no-op re-run, checksum mismatch → discard+retry, interrupted download → no partial install, offline+no-cache error, offline+cache OK, `clear()` removes engine dir (P1-H AC1/AC4 1:1)
- [ ] `.complete` marker gates readiness; half-installed cache never reported ready
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement ArtifactManager with SHA-256 verified engine downloads`

---

### T17: Implement HostManager state machine

**What**: `HostManager` — spawn (`java -Xmx<heap> -D<layoutlib props> -cp <assembled classpath>`), `vscode-jsonrpc` client over stdio, state machine `stopped→starting→ready→rendering→(ready|crashed)`, `crashed→starting` with backoff 1/4/15 s (≤3 per 5 min), 15 s per-render watchdog (`inflate.renderTimeoutMs`), 200-line stderr ring buffer, `restart()`, `dispose()` (SIGTERM → 3 s → SIGKILL), pre-warm hook.
**Where**: `extension/src/host.ts`, `extension/src/host.test.ts`, `extension/src/test/fake-host.js` (scripted protocol-speaking child)
**Depends on**: T13, T14, T16
**Reuses**: `vscode-jsonrpc` npm; design component #5
**Requirement**: HOST-01, HOST-03, NFR-02/05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests against the fake host: every legal transition, illegal-dispatch rejection (render only from `ready`), crash → backoff restart sequence, 4th crash in 5 min → manual-restart state, timeout → kill+crashed, dispose kills child, stderr buffer surfaces last lines (P1-I AC1/AC3 1:1)
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest, fake child process)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement HostManager with lifecycle state machine and backoff`

---

### T18: Wire activation, commands, and walking-skeleton preview

**What**: Replace hello command with real wiring: `inflate.openPreview` / `refreshPreview` / `doctor` / `clearEngineCache` / `restartHost` commands, editor-title + context-menu contributions behind `inflate:eligibleDocument` context key (path-heuristic stub until T33), Inflate output channel (extension + host stderr with render IDs), host `initialize`+`warmup` on first preview, minimal panel showing the rendered PNG end-to-end through the real protocol.
**Where**: `extension/package.json` (contributions), `extension/src/activation.ts`, `extension/src/extension.ts`, `extension/src/test/integration/skeleton.test.ts`
**Depends on**: T13, T16, T17
**Reuses**: T6 scaffold/panel; design component #1
**Requirement**: UX-01 (commands), HOST-01 (wiring), P1-I AC4/AC5

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Integration test: openPreview on the hello fixture → spawn → initialize → render → PNG visible in panel
- [ ] `deactivate()` leaves no orphan process (integration assertion on child PID)
- [ ] Gate check passes: `cd extension && npm test && npm run test:integration`

**Tests**: integration (test-electron)
**Gate**: full (extension side)
**Commit**: `Wire activation commands and end-to-end skeleton preview`

---

### T19: Implement Doctor command

**What**: `Doctor` — assembles and shows: detected JDK (path/version/source), cache state (manifest hash, artifacts, sizes, completeness), host state + uptime + last crash excerpt, resolved roots/package/ecosystem for the active file (stub until T22 — shows "resolver pending"), last render timings, engine pin matrix, log pointers.
**Where**: `extension/src/doctor.ts`, `extension/src/doctor.test.ts`
**Depends on**: T18
**Reuses**: read-only views of JdkLocator/ArtifactManager/HostManager (T14/T16/T17)
**Requirement**: SETUP-03, P1-H AC5

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: report assembly for {healthy, no-JDK, incomplete-cache, crashed-host} states (P1-H AC5 fields all present)
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement Doctor command reporting setup and host state`

---

### Phase 4 (M2): Resource Resolution

### T20: Create ecosystem sample fixtures

**What**: Two fixture projects: `fixtures/gradle-sample` (two modules, a flavor source set, `values/` + `values-night/`, `layout/` + `layout-sw600dp/`, manifests with `android:theme`) and `fixtures/dotnet-sample` (`Resources/` tree, `.axml` files, legacy-casing dirs e.g. `Resources/Layout/Main.axml`, `Properties/AndroidManifest.xml`) rendering the same semantic layout (P1-G independent test shape, Q6/Q7 coverage).
**Where**: `fixtures/gradle-sample/**`, `fixtures/dotnet-sample/**`
**Depends on**: T9
**Reuses**: spec P1-G independent test description
**Requirement**: RES-01/05 (test substrate), NFR-07 (corpus seed)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Both trees contain the qualifier variants above and parse as valid XML
- [ ] Semantic-equivalent layout exists in both ecosystems

**Tests**: none (fixture layer)
**Gate**: build
**Commit**: `Create Gradle and .NET Android sample fixtures`

---

### T21: Implement resource root discovery walker

**What**: `ResourceRootResolver.discover(docUri)` first half — walk up from file to nearest `res`/`resources` dir (case-insensitive) containing ≥1 Android resource-type subdir (`layout*`, `drawable*`, `values*`, `mipmap*`, `font*`, `color*`, `anim*`, `menu*`, `xml*`, with/without qualifiers); `.xml` + `.axml` eligible; returns root + none-found signal (single-file mode).
**Where**: `extension/src/roots.ts`, `extension/src/roots.test.ts`
**Depends on**: T20
**Reuses**: fixtures (T20); design §D3 walker spec
**Requirement**: RES-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests on both fixtures: root found for nested files, `.axml` accepted, legacy casing matched, non-resource dirs rejected, no-root → `none` (P1-G AC1 1:1 + Q6 edge cases)
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement resource root discovery walker for both ecosystems`

---

### T22: Add source-set enumeration and root ordering

**What**: Second half of the resolver — Gradle sibling source-set enumeration (`src/*/res`, ordered: containing set → `main` → alphabetical), .NET single-root shape, `inflate.resourceRoots` setting merge (absolute/workspace-relative), ecosystem tag (`gradle|dotnet|plain|none`), per-document memo invalidated on fs/setting changes, single-file mode (overlay-only root).
**Where**: `extension/src/roots.ts`, `extension/src/roots.test.ts`
**Depends on**: T21
**Reuses**: T21 walker
**Requirement**: RES-05, RES-02 (ordering)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: multi-module ordering, flavor set precedence, configured extra roots appended, memo invalidation on setting change, `plain`/`none` tags (P1-G AC5 + Q7 default 1:1)
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Add source-set enumeration and configured root ordering`

---

### T23: Add manifest package and theme-hint parsing

**What**: Parse nearest `AndroidManifest.xml` (Gradle: `src/<ss>/AndroidManifest.xml` or module root; .NET: `Properties/AndroidManifest.xml` or project root) for package name (fallback `com.inflate.preview`) and trivially-parseable `android:theme` hint (regex, graceful failure) → completes `RootsInfo`.
**Where**: `extension/src/roots.ts`, `extension/src/roots.test.ts`
**Depends on**: T22
**Reuses**: fixtures' manifests (T20)
**Requirement**: RES-01 (packageName), CFG-04 (theme default chain seed)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: both manifest locations, missing manifest → fallback package, theme hint extracted, malformed manifest → graceful no-hint
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Add manifest package name and theme hint parsing`

---

### T24: Implement project sessions with overlay and invalidation

**What**: `EngineAdapter.session(roots, packageName)` — cached by (ordered roots, package); builds `AppResourceRepository(localResourceDirs=[overlayDir]+roots)` + `SessionParamsBuilder`; `invalidate(paths)` marks dirty → next render rebuilds app repo; previewed-file-only edits skip invalidation (file-backed re-read); config-only changes reuse cached builder with fresh `SessionParams`.
**Where**: `host/src/main/kotlin/engine/EngineAdapter.kt`, `host/src/engineTest/kotlin/engine/SessionTest.kt`
**Depends on**: T13 (invalidate RPC exists as stub), T20
**Reuses**: T4 split-init; design §D5 session-caching rules
**Requirement**: RES-02, HOST-02 (host half), UX-02 (dependency correctness)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest on gradle-sample: `@color/@string/@dimen/@drawable/@style` resolve across module roots in priority order; values edit + invalidate → new value next render; same-session reuse when only previewed file changed; rebuild ms logged
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement cached project sessions with repository invalidation`

---

### T25: Implement PreviewConfig to DeviceConfig mapping

**What**: Host-side mapping `PreviewConfig` → Paparazzi `DeviceConfig` (night mode, density bucket, orientation, device preset dp→px + size bucket, `pixelScale`) driving `folderConfiguration` qualifier matching; the 5 built-in `DevicePreset`s per P1-E AC2.
**Where**: `host/src/main/kotlin/engine/ConfigMapper.kt`, `host/src/test/kotlin/engine/ConfigMapperTest.kt`, `host/src/engineTest/kotlin/engine/QualifierTest.kt`
**Depends on**: T24
**Reuses**: `DeviceConfig` public API (design finding #3)
**Requirement**: RES-03, CFG-01/02/03 (engine side)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: every PreviewConfig field maps correctly (all 5 presets, 5 densities, both orientations, night on/off)
- [ ] engineTest on fixtures: `-night` colors and `-sw600dp` layout selected iff config says so (P1-E AC1/AC2/AC3 resolution half)
- [ ] Gate check passes: `cd host && ./gradlew test engineTest`

**Tests**: unit + integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement PreviewConfig to DeviceConfig qualifier mapping`

---

### T26: Implement ThemeCatalog

**What**: `ThemeCatalog` — STYLE entries from app + library + framework repositories; theme = name starts `Theme.` or parent chain reaches a known theme root (bounded walk, cycle-guarded); returns `ThemeInfo{name, isProjectTheme, source}`; cached per session, invalidated with app repo; wired to `listThemes` RPC.
**Where**: `host/src/main/kotlin/themes/ThemeCatalog.kt`, `host/src/test/kotlin/themes/ThemeCatalogTest.kt`, `host/src/engineTest/kotlin/themes/ThemeCatalogEngineTest.kt`
**Depends on**: T24
**Reuses**: repositories from EngineAdapter; design component #16
**Requirement**: CFG-04 (host side), LAY-06 (theme enumeration)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: theme-detection predicate (name prefix, parent walk, cycle guard, non-theme styles excluded)
- [ ] engineTest: gradle-sample project themes + platform themes listed with correct sources; invalidation refreshes after style edit
- [ ] Gate check passes: `cd host && ./gradlew test engineTest`

**Tests**: unit + integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement ThemeCatalog enumerating project and platform themes`

---

### T27: Implement unresolved-reference degradation and warnings

**What**: Per-kind degradation on failed resolution (string → reference name, color → `#FF00FF`, dimen → `0dp`, drawable → outlined placeholder) with every unresolved reference collected via LogBridge into `RenderResponse.warnings[kind=unresolvedRef]`; render always completes; missing style parent degrades to nearest resolvable ancestor + warning (spec edge case).
**Where**: `host/src/main/kotlin/engine/Degradation.kt`, `host/src/engineTest/kotlin/engine/DegradationTest.kt`, unresolved-refs fixture in `fixtures/`
**Depends on**: T24
**Reuses**: LogBridge (T7)
**Requirement**: RES-04, UX-05 (data side)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: fixture referencing 4 missing kinds renders successfully; warnings list exactly the missing refs with kinds; magenta/0dp/name substitutions visible in output; broken style parent degrades with warning (P1-G AC4 1:1)
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement per-kind reference degradation with warning collection`

---

### Phase 5 (M3a): Preprocessing

### T28: Implement Preprocessor core with line mapping

**What**: `Preprocessor.preprocess(content, docKind, docPath, roots)` skeleton — kxml2 namespace-aware parse (1-based line/col into `syntaxError` on failure), overlay file emission `inflate_preview__<sha1(docPath)>.xml` under `overlay/res/<original type dir>/`, `lineMap` tracking (identity for untouched lines), `PreprocessResult` DTO.
**Where**: `host/src/main/kotlin/preprocess/Preprocessor.kt`, `host/src/test/kotlin/preprocess/PreprocessorCoreTest.kt`
**Depends on**: T9
**Reuses**: kxml2 2.3.0 (already a dep); overlay scheme from design Q3
**Requirement**: LAY-04 (mechanism), UX-04 (lineMap)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: valid XML → overlay written with unique name; syntax error → 1-based line/col + message, no overlay; lineMap identity verified (P1-A AC3 data half)
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Implement Preprocessor core with overlay emission and line mapping`

---

### T29: Add tools attribute preprocessing

**What**: Honor the core design-time set — `tools:text`, `tools:src`, `tools:visibility`, `tools:background`, `tools:layout` (on `<fragment>`/`<include>`) — by copying into the `android:` namespace (override-or-add), then strip all `tools:` attributes and the namespace declaration.
**Where**: `host/src/main/kotlin/preprocess/ToolsAttributes.kt`, `host/src/test/kotlin/preprocess/ToolsAttributesTest.kt`
**Depends on**: T28
**Reuses**: T28 parse/emit pipeline
**Requirement**: LAY-04 (tools: half)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: each core attribute copied (override + add cases), non-core `tools:` stripped silently, no `tools:` remnants in overlay, lineMap unaffected (same-line edits)
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add tools attribute preprocessing for design-time overrides`

---

### T30: Add data-binding unwrap with expression defaults

**What**: Unwrap `<layout>` root (drop `<data>`, promote the view child; lineMap shift tracked); replace `@{...}` expressions with type-appropriate defaults (`text` → `"binding"`, `visibility` → `visible`, dimensions → `0dp`, others → attribute dropped) and emit a `bindingReplaced` notice warning.
**Where**: `host/src/main/kotlin/preprocess/DataBinding.kt`, `host/src/test/kotlin/preprocess/DataBindingTest.kt`
**Depends on**: T28
**Reuses**: T28 pipeline + lineMap shift support
**Requirement**: LAY-04 (databinding half), P1-A AC6

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: unwrap shifts lineMap correctly (error on line N maps to original N+offset); each default rule applied; notice emitted once per file; non-binding files untouched (P1-A AC6 1:1)
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add data-binding unwrap with expression default replacement`

---

### T31: Add structural tag handling and include-cycle detection

**What**: `<merge>` root wrapped in `match_parent` FrameLayout; `<fragment tools:layout>` swapped to `<include>` of that layout, else labeled placeholder tag; `<ViewStub>` left collapsed; include-graph walk (visited set) → cycle aborts inflation of the cycle with placeholder at the cycle point + warning naming the path.
**Where**: `host/src/main/kotlin/preprocess/Structural.kt`, `host/src/test/kotlin/preprocess/StructuralTest.kt`
**Depends on**: T29 (tools:layout), T30 (pipeline order)
**Reuses**: T28 pipeline
**Requirement**: LAY-02, spec edge case (cycles)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: merge wrap, fragment with/without `tools:layout`, ViewStub untouched, 2-file and self-include cycles detected with exact path in warning (P1-A AC4 preprocessing half 1:1)
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add structural tag handling with include-cycle detection`

---

### T32: Add reference collection and custom-class scan

**What**: Collect every `@kind/name` reference in the previewed file (→ `referencedResources` for dependency tracking) and probe each custom/unknown tag with `Class.forName` on the host classpath (→ `customClasses` warnings feeding the strip; MockView renders the visual).
**Where**: `host/src/main/kotlin/preprocess/Scan.kt`, `host/src/test/kotlin/preprocess/ScanTest.kt`
**Depends on**: T31
**Reuses**: T28 pipeline; LogBridge warning kinds (T7)
**Requirement**: LAY-03 (scan half), UX-02 (dependency list source)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: all reference kinds collected exactly once each; framework/androidx tags not flagged; unknown tags flagged with class name; `<view class="...">` form handled
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Add resource reference collection and custom class scanning`

---

### Phase 6 (M3b): Layout Render Loop

### T33: Implement DocumentClassifier with shared eligibility constants

**What**: Shared constants module (resource-type dirs, drawable/layout root elements — single source of truth generated/copied into TS and Kotlin with a guard test comparing them) + `DocumentClassifier.classify(uri, firstKb?)` → `DocKind` via path heuristic (`…/(res|resources)/<type>[-quals]/…`, `.xml|.axml|.9.png`, case-insensitive) with root-element sniff fallback; drives the real `inflate:eligibleDocument` context key.
**Where**: `extension/src/classifier.ts`, `extension/src/classifier.test.ts`, `shared/eligibility.json`, `host/src/main/kotlin/preprocess/Eligibility.kt` (+ guard tests both sides)
**Depends on**: T28
**Reuses**: design component #2 table
**Requirement**: UX-01 (eligibility)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: layout/drawable/nine-patch/color/unsupported classification across path + sniff cases, `.axml`, legacy casing; TS and Kotlin constants byte-identical (guard test each side)
- [ ] Gate check passes: `cd extension && npm test && cd ../host && ./gradlew test`

**Tests**: unit (Vitest + JUnit 5)
**Gate**: quick (both sides)
**Commit**: `Implement DocumentClassifier with shared eligibility constants`

---

### T34: Create framework gallery fixtures

**What**: `fixtures/galleries/framework/` — `framework_gallery.xml` exercising every §FR-1 view group + widget nested ≥6 levels; variants: bad-syntax, custom-view, data-binding, merge-root, include/ViewStub/fragment, include-cycle pair, AdapterView trio (P1-A independent-test substrate).
**Where**: `fixtures/galleries/framework/**`
**Depends on**: T9
**Reuses**: spec §FR-1 surface table
**Requirement**: LAY-01/02/07 (test substrate)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every FR-1 row appears in at least one fixture; variants listed above all present
- [ ] All valid-XML fixtures parse; bad-syntax fixture fails at a known line

**Tests**: none (fixture layer)
**Gate**: build
**Commit**: `Create framework widget gallery fixtures`

---

### T35: Implement LayoutRenderer with error mapping

**What**: `LayoutRenderer` — overlay id via `Resources.getIdentifier`, inflate + snapshot through EngineAdapter session, `useDeviceResolution=true`, 4096×4096 canvas cap → clip + `canvasCapped`; wire real `render` RPC routing for `docKind=layout` (Preprocessor → renderer → PngWriter → `RenderResponse` with warnings/timings/dependencies); failures mapped: preprocessor syntax error → line/col; layoutlib inflation/log errors → message + "Binary XML file line #N" reverse-mapped through lineMap.
**Where**: `host/src/main/kotlin/render/LayoutRenderer.kt`, `host/src/main/kotlin/rpc/RenderRouting.kt`, `host/src/engineTest/kotlin/render/LayoutRendererTest.kt`
**Depends on**: T32, T33, T34, T24
**Reuses**: EngineAdapter (T24), Preprocessor (T28–T32), LogBridge (T7), PngWriter (T5)
**Requirement**: LAY-01/02/03/07, UX-04 (mapping), HOST-02 (render exec)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: framework gallery renders (6-deep nesting OK); merge/include/ViewStub/fragment per P1-A AC4; custom-view → placeholder + warning (AC5); AdapterViews render empty at bounds (LAY-07); bad-syntax → mapped line/col error (AC3); databinding fixture → notice (AC6); cycle fixture → placeholder + path warning; oversize fixture → capped + notice
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement LayoutRenderer with mapped errors and render routing`

---

### T36: Implement RenderScheduler with coalescing

**What**: `RenderScheduler` — per-document monotonic request IDs, latest-wins coalescing (pending slot holds ≤1), stale-response discard (id < last), triggers (`save`, `depSave`, `config`, `refresh`, `reopen`), dependency watchers from last response's `dependencies` + all `values*/**` under resolved roots, `invalidate(paths)` before dependent re-render, refresh sends dirty buffer as `inlineContent`.
**Where**: `extension/src/scheduler.ts`, `extension/src/scheduler.test.ts`
**Depends on**: T17, T22
**Reuses**: HostManager (T17), ResourceRootResolver (T21–T23); design component #4
**Requirement**: UX-02, HOST-02 (extension half), P1-F AC1–AC4

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests (fake HostManager): 10-save burst → last content wins, zero stale displays; dep-save triggers invalidate + re-render; refresh carries dirty buffer; per-document isolation across 3 docs (P1-F AC1–AC4 + NFR-05 concurrency 1:1)
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement RenderScheduler with latest-wins coalescing`

---

### T37: Wire preview panel with hot reload, errors, and warnings

**What**: `PreviewPanelManager` + webview v1 — one panel per document (reveal-not-duplicate), save → scheduler → render → image update without focus steal; error panel keeps last good render dimmed + "stale" chip; collapsible warnings strip (counts by kind); "file gone" state on delete/rename; panel-close/activation PNG sweep; `retainContextWhenHidden:false` restore from ConfigStore-less serialized state (config lands in T50).
**Where**: `extension/src/panel.ts`, `extension/webview-ui/main.ts`, `extension/webview-ui/panel.test.ts`, `extension/src/test/integration/hotreload.test.ts`
**Depends on**: T35, T36
**Reuses**: T18 skeleton panel; design component #9
**Requirement**: UX-02 (loop), UX-04, UX-05, P1-A AC1/AC3, P1-F AC1/AC2, spec edge cases (file gone, duplicate panel)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Webview unit tests: message contract (`setImage`/`setError`/`setStatus`), stale dimming, warnings collapse, file-gone state
- [ ] Integration test: edit+save layout → image updates; edit+save its `colors.xml` → image updates; syntax error → error panel + stale image retained; second openPreview reveals existing panel
- [ ] Gate check passes: `cd extension && npm test && npm run test:integration`

**Tests**: unit + integration (test-electron)
**Gate**: full (extension side)
**Commit**: `Wire preview panel with hot reload and error handling`

---

### Phase 7 (M4): androidx/Material

### T38: Pin androidx and Material bundle in engine manifest

**What**: Extend `generateEngineManifest` with the D4 pin set (material 1.12.0, appcompat 1.7.0, constraintlayout 2.2.1, core 1.13.1, recyclerview 1.3.2, cardview 1.0.0, coordinatorlayout 1.2.0, fragment 1.8.5, viewpager2 1.1.0) resolving the full transitive closure; regenerate + commit `engine-manifest.json`; ArtifactManager AAR handling verified against the real closure shape.
**Where**: `host/build.gradle.kts`, `extension/engine-manifest.json`, `host/src/test/kotlin/manifest/ManifestTaskTest.kt`
**Depends on**: T15, T16
**Reuses**: T15 task, T16 AAR extraction
**Requirement**: LAY-05 (bundle), AD-011, D4

**Tools**:
- MCP: NONE
- Skill: NONE (WebFetch to confirm a pinned AAR URL if resolution fails)

**Done when**:
- [ ] Manifest contains all 9 top-level pins + transitive closure (each with sha256/size/kind)
- [ ] Unit test asserts D4 pins present and `core` stays 1.13.x (compileSdk-34 guard)
- [ ] Gate check passes: `cd host && ./gradlew test`

**Tests**: unit (JUnit 5)
**Gate**: quick (`cd host && ./gradlew test`)
**Commit**: `Pin androidx and Material artifact set in engine manifest`

---

### T39: Wire library resources and classpath into the engine

**What**: Thread `EnginePaths` bundle data through spawn + `initialize`: AAR `classes.jar` list onto the host classpath (HostManager assembly), `res/` dirs → `libraryResourceDirs` (AAR repositories), package names → `resourcePackageNames`, assets → `libraryAssetDirs`; framework + AAR repositories immutable per process.
**Where**: `extension/src/host.ts` (classpath), `host/src/main/kotlin/engine/EngineAdapter.kt`, `host/src/engineTest/kotlin/engine/LibraryResourcesTest.kt`
**Depends on**: T38, T24
**Reuses**: ArtifactManager `EnginePaths` (T16); design §D4 per-AAR wiring
**Requirement**: LAY-05, RES-02 (library link in chain)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: layout using `MaterialButton` + `ConstraintLayout` inflates with real classes (no MockView) and library resources resolve (`@style/Widget.Material3.*`)
- [ ] Resolution priority verified: project root overrides library resource of same name
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Wire bundled library resources and classpath into engine sessions`

---

### T40: Implement theme-aware view inflation factory

**What**: Replace Paparazzi's hardcoded AppCompat factory with our theme-aware Factory2: read `viewInflaterClass` from the resolved theme, reflectively instantiate (MaterialComponentsViewInflater/AppCompatViewInflater), fall back to AppCompat's; installed per session render (design finding #6).
**Where**: `host/src/main/kotlin/engine/ThemeAwareFactory.kt`, `host/src/engineTest/kotlin/engine/ThemeAwareFactoryTest.kt`
**Depends on**: T39
**Reuses**: AppCompat/Material inflater classes from bundled classpath
**Requirement**: LAY-05 (Studio parity), LAY-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: `<Button>` under `Theme.Material3.*` inflates as `MaterialButton`; under platform theme stays framework `Button`; unknown `viewInflaterClass` falls back to AppCompat without failing the render
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement theme-aware Factory2 honoring viewInflaterClass`

---

### T41: Create Material gallery with attribute-warning coverage

**What**: `fixtures/galleries/material/material_gallery.xml` (+ variants) covering §FR-2: MaterialButton, TextInputLayout/EditText, Chip/ChipGroup, TabLayout, FAB (+Extended), MaterialCardView, BottomNavigationView, MaterialToolbar, Slider, MaterialSwitch inside ConstraintLayout with chains + guidelines + barriers + groups + flow; `?attr/` chains; a missing-Material-attribute variant; engineTest renders all under `Theme.Material3.DayNight` with zero project dependency declarations + warning naming attribute + bundled version.
**Where**: `fixtures/galleries/material/**`, `host/src/engineTest/kotlin/render/MaterialGalleryTest.kt`
**Depends on**: T40
**Reuses**: T35 LayoutRenderer path
**Requirement**: LAY-05, LAY-06, P1-B AC1–AC4

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: gallery renders; `?attr/colorPrimary` resolves through inheritance chain (AC2); ConstraintLayout chains/barriers/guidelines position correctly vs known-good bounds (AC3); missing-attr variant renders with `materialAttrMissing` warning naming attribute + bundled version (AC4)
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Create Material gallery fixtures with parity render tests`

---

### T42: Document Material rendering quirks catalog

**What**: Render the Material gallery, compare against Android Studio screenshots of the same fixtures (manual baseline, checked in), and write `docs/material-quirks.md` cataloguing divergences (shadows, elevation overlays, shapeable backgrounds) with Studio-parity verdicts (Q5 closure); note any corpus tolerance implications.
**Where**: `docs/material-quirks.md`, `fixtures/galleries/material/studio-baseline/*.png`
**Depends on**: T41
**Reuses**: T41 gallery renders
**Requirement**: Q5, R6 mitigation, NFR-07 (tolerance input)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every §FR-2 component row has a parity verdict (OK / quirk described)
- [ ] Q5 marked resolved in the doc with follow-ups (if any) filed as corpus tolerances

**Tests**: none (docs layer)
**Gate**: build
**Commit**: `Document Material rendering quirks against Studio baseline`

---

### Phase 8 (M5): Drawables

### T43: Create drawable gallery fixtures

**What**: `fixtures/galleries/drawables/` — one fixture per §FR-3 type: vector (gradients incl. sweep, clip paths, trimPath, fillType), animated-vector, shape (all 4 shapes, corners, gradients, dashed stroke), 4-item selector, layer-list (gravity/insets/sizes), ripple (bounded/unbounded), inset/clip/scale/rotate/level-list, transition, animated-selector, bitmap (tile modes), `.9.png` (valid + malformed markers), color, adaptive-icon, alias/mipmap ref.
**Where**: `fixtures/galleries/drawables/**`
**Depends on**: T9
**Reuses**: spec §FR-3 table
**Requirement**: DRW-01..06 (test substrate)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every FR-3 row has ≥1 fixture; all valid XML parses; malformed `.9.png` variant present

**Tests**: none (fixture layer)
**Gate**: build
**Commit**: `Create drawable gallery fixtures covering all supported types`

---

### T44: Implement DrawableRenderer core with sizing

**What**: `DrawableRenderer` — load by id with session theme; intrinsic-sized types via `RenderingMode.SHRINK` + wrap_content host view; non-intrinsic → 128×128 dp default canvas, request-overridable (`sizeDp`); PNG keeps alpha (backdrop is webview CSS); `render` RPC routing for `docKind=drawableXml|color`; color swatch render.
**Where**: `host/src/main/kotlin/render/DrawableRenderer.kt`, `host/src/main/kotlin/rpc/RenderRouting.kt`, `host/src/engineTest/kotlin/render/DrawableCoreTest.kt`
**Depends on**: T43, T35
**Reuses**: EngineAdapter sessions (T24), PngWriter (T5), routing (T35)
**Requirement**: DRW-01, DRW-02 (partial), DRW-06 (color/bitmap), DRW-08 (size), P1-C AC1/AC2/AC5

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: vector (sweep gradient + trimPath visible), shape variants, layer-list compositing, bitmap tile modes, color swatch all render; intrinsic vs 128 dp default vs override sizing each verified; alpha preserved; resource refs inside drawables resolve via the same chain (AC5)
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Implement DrawableRenderer with intrinsic and default sizing`

---

### T45: Add drawable state rendering with matched-item indicator

**What**: Productionize T8's spike: request `states[]` applied via `StateImageView` merge; `matchedStateItem{index, stateAttrs}` from `findStateDrawableIndex`; ripple pressed → settled overlay frame; state support detection (selector/ripple/animated-selector) reported so the toolbar can hide the picker.
**Where**: `host/src/main/kotlin/render/DrawableRenderer.kt`, `host/src/engineTest/kotlin/render/DrawableStateTest.kt`
**Depends on**: T44
**Reuses**: StateImageView (T8)
**Requirement**: DRW-03, DRW-07, P1-D AC1–AC4

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: 4-item selector renders pairwise-differently across 4 states with correct matched index+attrs; ripple pressed shows settled overlay; non-stateful drawable reports `stateSensitive=false` (P1-D AC1–AC4 1:1)
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Add drawable state rendering with matched item reporting`

---

### T46: Add animated static frames and level-based rendering

**What**: Animated types (`animated-vector`, `animation-list`, `animated-selector`, `transition`) render initial/static frame + `staticPreviewBadge`; level-based types (`clip`, `scale`, `rotate`, `level-list`) render at `setLevel(5000)` with `levelDefault` notice; inset renders per spec.
**Where**: `host/src/main/kotlin/render/DrawableRenderer.kt`, `host/src/engineTest/kotlin/render/DrawableVariantsTest.kt`
**Depends on**: T45
**Reuses**: T44 core paths
**Requirement**: DRW-02 (rest), DRW-04, P1-C AC3

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: each animated type → frame 0 + badge flag; clip at level 5000 shows half + notice; level-list picks the 5000 item; rotate/scale/inset correct
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Add animated static frame and level-based drawable rendering`

---

### T47: Add nine-patch source rendering

**What**: `.9.png` source-format decode via `com.android.tools:ninepatch` — stretch-region + padding markers honored, rendered stretched at 2 request sizes into one composite preview; malformed markers → plain-image fallback + marker-error warning.
**Where**: `host/src/main/kotlin/render/NinePatchRenderer.kt`, `host/src/engineTest/kotlin/render/NinePatchTest.kt`
**Depends on**: T44
**Reuses**: ninepatch 31.4.2 (already a dep)
**Requirement**: DRW-05, P1-C AC4, spec edge case (malformed markers)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: corners stay unscaled at 2 sizes (pixel assertions on corner regions); padding respected; malformed fixture falls back with warning
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Add nine-patch source rendering with marker fallback`

---

### T48: Add adaptive-icon composition

**What**: `<adaptive-icon>` — inflate background + foreground layers, compose under a circular mask in host drawing code (design decision), render at intrinsic adaptive-icon canvas.
**Where**: `host/src/main/kotlin/render/AdaptiveIconRenderer.kt`, `host/src/engineTest/kotlin/render/AdaptiveIconTest.kt`
**Depends on**: T44
**Reuses**: DrawableRenderer layer loading (T44)
**Requirement**: DRW-06 (adaptive), P1-C AC6

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] engineTest: composed image circular (corner pixels transparent, center opaque); layer order correct
- [ ] Gate check passes: `cd host && ./gradlew engineTest`

**Tests**: integration (engineTest)
**Gate**: full (`cd host && ./gradlew test engineTest`)
**Commit**: `Add adaptive icon rendering under circular mask`

---

### T49: Add drawable toolbar controls to the preview panel

**What**: Webview toolbar additions for drawable docs: state picker (states from P1-D list; hidden when `stateSensitive=false`), backdrop toggle (checkerboard/solid — CSS only, no re-render), size override input, static-preview badge + matched-item display; `PreviewConfig.drawable` plumbed through scheduler → request.
**Where**: `extension/webview-ui/toolbar.ts`, `extension/webview-ui/toolbar.test.ts`, `extension/src/panel.ts`, `extension/src/test/integration/drawable.test.ts`
**Depends on**: T45, T46, T37
**Reuses**: panel/webview messaging (T37)
**Requirement**: DRW-07/08 (UI), P1-D AC1/AC3, P1-C AC1 (backdrop)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Webview unit tests: picker visibility rules, state→configChanged message, backdrop CSS swap without render request, size override validation, badge/matched-item display
- [ ] Integration test: open selector fixture → pick pressed → image changes + matched item shown
- [ ] Gate check passes: `cd extension && npm test && npm run test:integration`

**Tests**: unit + integration (test-electron)
**Gate**: full (extension side)
**Commit**: `Add drawable state picker and backdrop controls to toolbar`

---

### Phase 9 (M6): Config Toolbar

### T50: Implement ConfigStore with per-file persistence

**What**: `ConfigStore` — `PreviewConfig` per normalized file path in `workspaceState`; defaults chain (theme: manifest hint → `Theme.Material3.DayNight`; device phone 411×891; density xhdpi; portrait; notnight; drawable default state; backdrop checkerboard; zoom fit); `get/update/events`; panel restore reads it.
**Where**: `extension/src/config.ts`, `extension/src/config.test.ts`
**Depends on**: T23 (theme hint), T37
**Reuses**: design component #8 defaults
**Requirement**: CFG-05, P1-E AC5

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: defaults (with/without manifest hint), patch persistence, per-file isolation, normalization (same file two URI spellings → one entry), change events
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement ConfigStore with per-file preview persistence`

---

### T51: Add configuration toolbar controls

**What**: Webview toolbar: day/night toggle, device preset dropdown (5 built-ins), orientation toggle, density dropdown (5 buckets), theme picker fed by `listThemes` (project + bundled, grouped by source); each control emits `configChanged`; toolbar state hydrates from ConfigStore.
**Where**: `extension/webview-ui/toolbar.ts`, `extension/webview-ui/toolbar.test.ts`, `extension/src/panel.ts`
**Depends on**: T50, T26
**Reuses**: T49 toolbar structure; ThemeCatalog via RPC (T26)
**Requirement**: CFG-01/02/03/04 (UI), P1-E AC1–AC4

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Webview unit tests: each control renders current config, emits correct patch, theme list grouped with project themes first; hydration from stored config
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest + jsdom)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Add configuration toolbar with device and theme controls`

---

### T52: Implement zoom and pan with crisp re-render

**What**: Webview zoom/pan — 25–400%, fit-to-window default, wheel/gesture pan; crossing 200% requests `pixelScale: 2` re-render (debounced), respecting the 4096 px cap (`canvasCapped` → stop escalating + notice); zoom level part of per-file config.
**Where**: `extension/webview-ui/viewport.ts`, `extension/webview-ui/viewport.test.ts`, `extension/src/panel.ts`
**Depends on**: T51
**Reuses**: panel messaging (T37)
**Requirement**: UX-03, P1-E (zoom in FR-4)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Webview unit tests: clamp 25–400, fit computation, threshold crossing emits exactly one pixelScale request per direction (debounce), cap honored, pan bounds
- [ ] Gate check passes: `cd extension && npm test`

**Tests**: unit (Vitest + jsdom)
**Gate**: quick (`cd extension && npm test`)
**Commit**: `Implement zoom and pan with pixel-scale re-render`

---

### T53: Wire config changes to re-render and restore

**What**: Close the loop: `configChanged` → ConfigStore update → scheduler `config` render; day/night switches `-night` resources + DayNight theme variant end-to-end; preset/orientation/density re-render with qualifiers; theme pick applies; config restored on preview reopen (P1-E AC5); persisted zoom restored.
**Where**: `extension/src/panel.ts`, `extension/src/scheduler.ts`, `extension/src/test/integration/config.test.ts`
**Depends on**: T52, T25
**Reuses**: scheduler (T36), qualifier engine work (T25)
**Requirement**: CFG-01..05 (end-to-end), P1-E AC1–AC5

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Integration tests on gradle-sample: night toggle changes rendered colors; `-sw600dp` layout picked on tablet preset; density change re-renders; theme pick applies; close+reopen restores config (P1-E AC1–AC5 1:1)
- [ ] Gate check passes: `cd extension && npm test && npm run test:integration`

**Tests**: integration (test-electron)
**Gate**: full (extension side)
**Commit**: `Wire config toolbar to qualified re-renders and persistence`

---

### Phase 10 (M7): Hardening & Release

### T54: Create golden-image corpus runner

**What**: `corpus/` Node runner — spawns the host standalone over the real protocol, renders a fixture list (file + config matrix), compares PNGs against checked-in goldens with `pixelmatch` (AA tolerance, threshold configurable per fixture), writes an HTML diff report, `npm run corpus` at repo root; `--update-goldens` flag; initial goldens generated from existing gallery/sample fixtures.
**Where**: `corpus/run.ts`, `corpus/package.json` (or root scripts), `fixtures/**/golden/*.png`, `corpus/run.test.ts`
**Depends on**: T53
**Reuses**: protocol DTOs (T11), fixtures (T20/T34/T41/T43)
**Requirement**: NFR-07 (mechanism)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Unit tests: diff threshold logic, report generation, golden-update flow (on tiny synthetic images)
- [ ] `npm run corpus` renders existing fixtures green against fresh goldens
- [ ] Gate check passes: `cd extension && npm test` + `npm run corpus`

**Tests**: unit + e2e (corpus)
**Gate**: full (+ corpus)
**Commit**: `Create golden-image corpus runner with pixelmatch diffing`

---

### T55: Expand corpus to release coverage

**What**: Grow fixtures to NFR-07 scope: ≥12 Gradle-shaped + ≥12 .NET-shaped real-world layouts + ≥6 drawable galleries (≥30 total), spanning FR-1/2/3, both ecosystems, night/density variants in the corpus config matrix; goldens committed; per-fixture tolerances where M4 quirks require.
**Where**: `fixtures/**`, `corpus/manifest.json`
**Depends on**: T54
**Reuses**: T20/T34/T41/T43 fixtures as seeds; T42 quirk tolerances
**Requirement**: NFR-07, R3 mitigation, spec Success Criteria (corpus)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Count gate met (≥12/≥12/≥6); `npm run corpus` green
- [ ] Corpus matrix includes night + density + orientation variants for ≥5 fixtures

**Tests**: e2e (corpus)
**Gate**: full (+ corpus)
**Commit**: `Expand golden corpus to release coverage thresholds`

---

### T56: Create CI workflow

**What**: GitHub Actions: macOS arm64 job — build extension + host, `npm test`, `test:integration`, `./gradlew test engineTest`, `npm run corpus`, engine-artifact cache keyed by manifest hash; x64 smoke subset job; daily canary job fetching the pinned manifest URLs (R7); artifacts: corpus diff report on failure.
**Where**: `.github/workflows/ci.yml`, `.github/workflows/canary.yml`
**Depends on**: T55
**Reuses**: all gate commands (coverage matrix)
**Requirement**: NFR-07 (CI gate), R7 mitigation

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] CI green on a clean run; corpus diff report uploaded on a forced failure test
- [ ] Engine cache restores (second run skips ~170 MB download)

**Tests**: none (CI config — validated by the run itself)
**Gate**: build (full pipeline green)
**Commit**: `Create CI workflow with golden corpus gate and canary`

---

### T57: Verify and tune latency against NFR-01

**What**: Instrument end-to-end timings (already in `RenderResponse.timings` + scheduler stamps); measure p90 warm layout/drawable + save→preview + cold start on the corpus (scripted, Apple Silicon); pre-warm on eligible-document detection verified; tune (session reuse, warmup scope) if any target missed; record in `docs/performance.md` + Doctor display check.
**Where**: `corpus/perf.ts`, `docs/performance.md`, targeted fixes where breaches appear
**Depends on**: T56
**Reuses**: corpus runner (T54), timings plumbing (T35/T36)
**Requirement**: NFR-01, NFR-02 (heap/activation checks), spec Success Criteria (latency)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Measured: warm layout p90 ≤ 700 ms, drawable p90 ≤ 400 ms, save→update p90 ≤ 1 s, cold ≤ 10 s max (documented with numbers)
- [ ] Day/night toggle < 1 s warm on night-qualified fixture (success criterion)
- [ ] Gate check passes: full pipeline + corpus still green after any tuning

**Tests**: e2e (perf script over corpus)
**Gate**: full (+ corpus)
**Commit**: `Verify latency targets with measured performance report`

---

### T58: Add chaos and robustness tests

**What**: Scripted integration suite: kill host PID mid-render → auto-restart + next save recovers; wedge render past 15 s (poison fixture) → timeout kill + restart; VS Code exit → no orphan JVM (process-table assertion); 3 concurrent previews render correctly serialized; 4th crash in 5 min → manual-restart state surfaced; OOM (tiny `-Xmx`) → crash path names the heap setting.
**Where**: `extension/src/test/integration/chaos.test.ts`, poison fixture
**Depends on**: T56
**Reuses**: HostManager (T17), scheduler (T36)
**Requirement**: NFR-05, HOST-01/02/03, P1-I AC1–AC4, spec Success Criteria (chaos)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] All six scenarios pass repeatedly (3 consecutive runs, no flake)
- [ ] Gate check passes: `cd extension && npm run test:integration`

**Tests**: integration (test-electron)
**Gate**: full (extension side)
**Commit**: `Add chaos tests for host crash recovery and cleanup`

---

### T59: Write user documentation

**What**: `README.md` (product pitch, install, first-run incl. "~170 MB one-time download", quickstart GIF placeholders), `docs/troubleshooting.md` (Doctor-driven flows: no JDK, offline, crash), `docs/limitations.md` (custom views AD-007, bundled-version divergence R4, preview-platform pin, data-binding placeholders, preprocessing scope), settings reference (`inflate.javaHome`, `resourceRoots`, `hostMaxHeap`, `renderTimeoutMs`), CONTRIBUTING.md (repo layout AD-012, gates, corpus).
**Where**: `README.md`, `docs/troubleshooting.md`, `docs/limitations.md`, `CONTRIBUTING.md`
**Depends on**: T57
**Reuses**: Doctor output (T19), quirks catalog (T42)
**Requirement**: M7 docs, R5 expectation-setting

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every shipped setting + command documented; every documented limitation traces to a spec decision
- [ ] First-run flow matches P1-H behavior verbatim

**Tests**: none (docs layer)
**Gate**: build
**Commit**: `Write user documentation and contributor guide`

---

### T60: Package and validate the VSIX

**What**: Marketplace packaging — esbuild production bundle, host fat-jar built + embedded (Maven-Central deps only, AD-011), `engine-manifest.json` bundled, icon, Apache-2.0 LICENSE, marketplace metadata/categories, `.vscodeignore`; VSIX size sanity (≈25–40 MB); clean-profile install smoke: fresh macOS user account → install VSIX → guided JDK/download flow → fixture renders → offline re-render works (P1-H independent test).
**Where**: `extension/package.json`, `extension/.vscodeignore`, `extension/esbuild.mjs`, `host/build.gradle.kts` (fatJar task), `LICENSE`, `docs/release-checklist.md`
**Depends on**: T59
**Reuses**: everything
**Requirement**: P1-H (end-to-end), AD-011, NFR-06, spec Success Criteria (clean machine)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `vsce package` produces installable VSIX ≤ 50 MB with fat-jar + manifest inside
- [ ] Clean-profile smoke passes: guided flow → render → offline render (documented in release checklist)
- [ ] Gate check passes: full pipeline + corpus green on the packaged build

**Tests**: none (packaging — validated by smoke + full pipeline)
**Gate**: build (full pipeline + corpus + manual smoke)
**Commit**: `Package VSIX with embedded host and marketplace metadata`

---

## Phase Execution Map

Phases run in sequence; tasks within a phase run in order (dependency DAGs are in the Execution Plan above):

```
P1 (T1–T9) → P2 (T10–T13) → P3 (T14–T19) → P4 (T20–T27) → P5 (T28–T32)
  → P6 (T33–T37) → P7 (T38–T42) → P8 (T43–T49) → P9 (T50–T53) → P10 (T54–T60)
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

**Batch packing at Execute (60 tasks, ~7-task budget, whole phases — indicative):** B1=P1(9) · B2=P2+P3(10) · B3=P4(8) · B4=P5(5) · B5=P6(5) · B6=P7(5) · B7=P8(7) · B8=P9(4) · B9=P10(7) → ~9 workers. 60 tasks ≫ one ~8-task batch, so the **sub-agent offer applies before Execute** (offer-then-confirm; batches sequential; Verifier always runs after the final task regardless).

---

## Task Granularity Check

| Task | Scope | Status | Task | Scope | Status |
| ---- | ----- | ------ | ---- | ----- | ------ |
| T1 | 1 project config | ✅ | T31 | 1 preprocessing pass | ✅ |
| T2 | 1 flag + 1 probe file + 1 doc | ✅ | T32 | 1 scan pass | ✅ |
| T3 | 1 Gradle task | ✅ | T33 | 1 component + shared constants | ✅ |
| T4 | 1 component (2 methods) | ✅ | T34 | 1 fixture set | ✅ |
| T5 | 1 render path + 1 writer | ✅ | T35 | 1 component + its routing | ✅ |
| T6 | 1 project scaffold + 1 command | ✅ | T36 | 1 component | ✅ |
| T7 | 1 component + 1 spike test | ✅ | T37 | 1 component (panel v1) | ✅ |
| T8 | 1 spike (1 view + 1 test) | ✅ | T38 | 1 manifest update | ✅ |
| T9 | 1 report | ✅ | T39 | 1 wiring seam | ✅ |
| T10 | 1 contract doc + fixtures | ✅ | T40 | 1 factory class | ✅ |
| T11 | 1 DTO module (TS) | ✅ | T41 | 1 fixture set + 1 test suite | ✅ |
| T12 | 1 DTO module (Kotlin) | ✅ | T42 | 1 doc | ✅ |
| T13 | 1 component (server+framing) | ✅ | T43 | 1 fixture set | ✅ |
| T14 | 1 component | ✅ | T44 | 1 component core | ✅ |
| T15 | 1 Gradle task | ✅ | T45 | 1 feature (state) | ✅ |
| T16 | 1 component | ✅ | T46 | 1 feature (variants) | ✅ |
| T17 | 1 component | ✅ | T47 | 1 renderer | ✅ |
| T18 | 1 wiring layer | ✅ | T48 | 1 renderer | ✅ |
| T19 | 1 command | ✅ | T49 | 1 toolbar section | ✅ |
| T20 | 1 fixture set (2 trees) | ✅ | T50 | 1 component | ✅ |
| T21 | 1 function (walker) | ✅ | T51 | 1 toolbar section | ✅ |
| T22 | 1 function group (ordering) | ✅ | T52 | 1 viewport module | ✅ |
| T23 | 1 parser | ✅ | T53 | 1 wiring seam | ✅ |
| T24 | 1 component (sessions) | ✅ | T54 | 1 runner | ✅ |
| T25 | 1 mapper | ✅ | T55 | 1 fixture expansion | ✅ |
| T26 | 1 component | ✅ | T56 | 2 CI workflows (cohesive) | ⚠️ OK |
| T27 | 1 degradation layer | ✅ | T57 | 1 measurement pass | ✅ |
| T28 | 1 component core | ✅ | T58 | 1 test suite | ✅ |
| T29 | 1 preprocessing pass | ✅ | T59 | 1 doc set (cohesive) | ⚠️ OK |
| T30 | 1 preprocessing pass | ✅ | T60 | 1 packaging config | ✅ |

No ❌ — T56/T59 are 2–3 cohesive files in one concern each (allowed: "2-3 related things = OK if cohesive").

---

## Diagram-Definition Cross-Check

Diagram arrows were generated from the `Depends on` fields (same source of truth); verified 1:1 both directions. No task depends on a later phase; all cross-phase deps point backward.

| Task | Depends On (body) | Diagram Shows | Status | Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ | ---- | ----------------- | ------------- | ------ |
| T1 | — | — | ✅ | T31 | T29, T30 | T29, T30 | ✅ |
| T2 | T1 | T1 | ✅ | T32 | T31 | T31 | ✅ |
| T3 | T1 | T1 | ✅ | T33 | T28 | T28 (P5) | ✅ |
| T4 | T2, T3 | T2, T3 | ✅ | T34 | T9 | T9 (P1) | ✅ |
| T5 | T4 | T4 | ✅ | T35 | T32, T33, T34, T24 | same | ✅ |
| T6 | T5 | T5 | ✅ | T36 | T17, T22 | T17 (P3), T22 (P4) | ✅ |
| T7 | T5 | T5 | ✅ | T37 | T35, T36 | T35, T36 | ✅ |
| T8 | T5 | T5 | ✅ | T38 | T15, T16 | T15, T16 (P3) | ✅ |
| T9 | T4–T8 | T4–T8 | ✅ | T39 | T38, T24 | T38, T24 (P4) | ✅ |
| T10 | T9 | T9 (P1) | ✅ | T40 | T39 | T39 | ✅ |
| T11 | T10 | T10 | ✅ | T41 | T40 | T40 | ✅ |
| T12 | T10 | T10 | ✅ | T42 | T41 | T41 | ✅ |
| T13 | T12 | T12 | ✅ | T43 | T9 | T9 (P1) | ✅ |
| T14 | T9 | T9 (P1) | ✅ | T44 | T43, T35 | T43, T35 (P6) | ✅ |
| T15 | T9 | T9 (P1) | ✅ | T45 | T44 | T44 | ✅ |
| T16 | T15 | T15 | ✅ | T46 | T45 | T45 | ✅ |
| T17 | T13, T14, T16 | same | ✅ | T47 | T44 | T44 | ✅ |
| T18 | T13, T16, T17 | same | ✅ | T48 | T44 | T44 | ✅ |
| T19 | T18 | T18 | ✅ | T49 | T45, T46, T37 | same | ✅ |
| T20 | T9 | T9 (P1) | ✅ | T50 | T23, T37 | T23 (P4), T37 (P6) | ✅ |
| T21 | T20 | T20 | ✅ | T51 | T50, T26 | T50, T26 (P4) | ✅ |
| T22 | T21 | T21 | ✅ | T52 | T51 | T51 | ✅ |
| T23 | T22 | T22 | ✅ | T53 | T52, T25 | T52, T25 (P4) | ✅ |
| T24 | T13, T20 | T13 (P2), T20 | ✅ | T54 | T53 | T53 (P9) | ✅ |
| T25 | T24 | T24 | ✅ | T55 | T54 | T54 | ✅ |
| T26 | T24 | T24 | ✅ | T56 | T55 | T55 | ✅ |
| T27 | T24 | T24 | ✅ | T57 | T56 | T56 | ✅ |
| T28 | T9 | T9 (P1) | ✅ | T58 | T56 | T56 | ✅ |
| T29 | T28 | T28 | ✅ | T59 | T57 | T57 | ✅ |
| T30 | T28 | T28 | ✅ | T60 | T59 | T59 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | build config | none | none | ✅ |
| T2 | host pure logic (probe) | unit | unit | ✅ |
| T3 | host pure logic (task) | unit | unit | ✅ |
| T4 | engine integration | integration | integration (engineTest) | ✅ |
| T5 | engine integration | integration | integration (engineTest) | ✅ |
| T6 | VS Code integration | integration | integration | ✅ |
| T7 | host pure + engine | integration (highest) | unit + integration | ✅ |
| T8 | engine integration | integration | integration (engineTest) | ✅ |
| T9 | docs | none | none | ✅ |
| T10 | docs/fixtures | none | none | ✅ |
| T11 | protocol DTOs TS | unit | unit | ✅ |
| T12 | host pure logic (DTOs) | unit | unit | ✅ |
| T13 | host pure logic (RPC) | unit | unit | ✅ |
| T14 | extension pure logic | unit | unit | ✅ |
| T15 | host pure logic (task) | unit | unit | ✅ |
| T16 | extension pure logic | unit | unit | ✅ |
| T17 | extension pure logic (fake child) | unit | unit | ✅ |
| T18 | VS Code integration | integration | integration | ✅ |
| T19 | extension pure logic | unit | unit | ✅ |
| T20 | fixtures | none | none | ✅ |
| T21 | extension pure logic | unit | unit | ✅ |
| T22 | extension pure logic | unit | unit | ✅ |
| T23 | extension pure logic | unit | unit | ✅ |
| T24 | engine integration | integration | integration (engineTest) | ✅ |
| T25 | host pure + engine | integration (highest) | unit + integration | ✅ |
| T26 | host pure + engine | integration (highest) | unit + integration | ✅ |
| T27 | engine integration | integration | integration (engineTest) | ✅ |
| T28 | host pure logic | unit | unit | ✅ |
| T29 | host pure logic | unit | unit | ✅ |
| T30 | host pure logic | unit | unit | ✅ |
| T31 | host pure logic | unit | unit | ✅ |
| T32 | host pure logic | unit | unit | ✅ |
| T33 | ext pure + host pure | unit | unit (both sides) | ✅ |
| T34 | fixtures | none | none | ✅ |
| T35 | engine integration | integration | integration (engineTest) | ✅ |
| T36 | extension pure logic | unit | unit | ✅ |
| T37 | webview + VS Code integration | integration (highest) | unit + integration | ✅ |
| T38 | host pure logic (task) | unit | unit | ✅ |
| T39 | engine integration | integration | integration (engineTest) | ✅ |
| T40 | engine integration | integration | integration (engineTest) | ✅ |
| T41 | fixtures + engine | integration (highest) | integration (engineTest) | ✅ |
| T42 | docs | none | none | ✅ |
| T43 | fixtures | none | none | ✅ |
| T44 | engine integration | integration | integration (engineTest) | ✅ |
| T45 | engine integration | integration | integration (engineTest) | ✅ |
| T46 | engine integration | integration | integration (engineTest) | ✅ |
| T47 | engine integration | integration | integration (engineTest) | ✅ |
| T48 | engine integration | integration | integration (engineTest) | ✅ |
| T49 | webview + VS Code integration | integration (highest) | unit + integration | ✅ |
| T50 | extension pure logic | unit | unit | ✅ |
| T51 | webview UI logic | unit | unit | ✅ |
| T52 | webview UI logic | unit | unit | ✅ |
| T53 | VS Code integration | integration | integration | ✅ |
| T54 | corpus e2e (+ runner logic) | e2e (highest) | unit + e2e | ✅ |
| T55 | corpus e2e | e2e | e2e | ✅ |
| T56 | CI config | none | none (pipeline validates) | ✅ |
| T57 | corpus e2e (perf) | e2e | e2e | ✅ |
| T58 | VS Code integration | integration | integration | ✅ |
| T59 | docs | none | none | ✅ |
| T60 | packaging config | none | none (build + smoke) | ✅ |

No ❌ VIOLATIONS — every code-producing task co-locates its required tests; `Tests: none` appears only on matrix-"none" layers (fixtures, docs, CI/packaging config, build config).
