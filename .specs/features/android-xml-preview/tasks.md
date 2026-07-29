# android-xml-preview Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/android-xml-preview/design.md`
**Spec**: `.specs/features/android-xml-preview/spec.md`
**Status**: v1 (T1–T60 + T38b + fix loop + AD-016) COMPLETE & VERIFIED 2026-07-20 · **UI Polish
fix-pack (T61–T68)**: Draft — awaiting user approval, see the amendment section at the end of this
file
**Date**: 2026-07-19 (v1) · 2026-07-26 (fix-pack amendment)

**Execution progress** (orchestrator-maintained):
- ✅ **Phase 1 (M0), T1–T9** — complete 2026-07-19. Commits 857a4b8…0fb303c. M0 gate PASSED (architecture validated); item 4 fallback → AD-013. Timings: cold 1956 ms / warm 30 ms / rebuild 9 ms; engine download 159.9 MB.
- ✅ **Phase 2 (T10–T13) + Phase 3 (T14–T19)** — complete 2026-07-19 (Batch 2, sonnet). Commits 2551dfc…05f2bdc. Ext 53 vitest + 2 integration; host 51 JUnit. Debt tracked in STATE.md (real host spawn wiring deferred to T39/T60; manifest coords duplicated → T38).
- ✅ **Phase 4 (T20–T27)** — complete 2026-07-19 (Batch 3, session). Commits 8793ee8…4122268. Ext 79 vitest; host 66 JUnit + 8 engineTest. RES-02 priority = reversed roots; use `appResourceExists` not `getIdentifier`. Verifier flag: T24 SessionTest weak lines (pixel assertions are the real proof).
- ✅ **Phase 5 (T28–T32)** — complete 2026-07-19 (Batch 4, sonnet). Commits 557e22d…114ee35. Host unit 66→96. UnknownViewSubstitutor absorbed into Scan.kt. T35 carry-forward: wire EngineAdapter.overlayDir = Preprocessor overlayBaseDir; map lineMap for errors; PreprocessResult.warnings → RenderResponse.warnings.
- ✅ **Phase 6 (T33–T37)** — complete 2026-07-19 (Batch 5, session). Commits f0f36b0…8520957. Ext 109 vitest + 6 integration; host 102 JUnit + 17 engineTest. Warm render 207 ms. **2 open functional gaps for Verifier fix tasks:** (1) Preprocessor not comment-aware (correctness bug); (2) Degradation (T27) not wired into live LayoutRenderer path (RES-04 gap). See STATE.md.
- ✅ **Phase 7 (T38, T38b, T39–T42)** — complete 2026-07-19 (Batch 6+6b, session). Commits 7052c25…4ff9420. **AD-014 blocker RESOLVED** (framework-delegates.jar via ASM rename; no pin bump). Host unit 103 + engineTest 21; ext 109. ⚠️ **Q5 Material fidelity gaps documented** (Chip/TextInputEditText/ExtendedFAB/BottomNav → placeholders; magenta tints; Guideline no-op) — bear on AD-002, flag to user before T60. Verifier flags: T41 SPEC_DEVIATION (MaterialAttrCheck added), Chip/P1-B gap.
- ✅ **Phase 8 (T43–T49)** — complete 2026-07-19 (Batch 7, session). Commits 67f815c…b081816. Host engineTest 44; ext 118 vitest + 8 integration. Drawables faithful (no magenta gap). 2 pinned-engine limits worked around host-side (ripple, adaptive-icon). DTO: `stateSensitive?` added. T50 must absorb activation.ts drawableConfigs map.
- ✅ **Phase 9 (T50–T53)** — complete 2026-07-19 (Batch 8, sonnet). Commits 1d63a3d…c3e1d82. Ext 146 vitest + 13 integration. ConfigStore absorbed activation.ts config map. Verifier flags: P1-E AC1/AC2/AC4 verified at plumbing layer (+ host T25 QualifierTest for real fidelity); main.ts DOM glue not unit-tested.
- ✅ **Phase 10 (T54–T60)** — complete 2026-07-19 (Batch 9, sonnet). Commits 1cf62d7…f9cfff5. Corpus 42 combos/33 fixtures green; perf all NFR-01 targets with wide margin; chaos 6 scenarios ×3 no flake; **debt #1 CLOSED** (host fat-jar 39MB, real prepareRealHost, framework-delegates at setup, live doctor/clearCache); **clean-profile smoke PASSED** (real JDK→170MB download→render 0% diff→offline re-render). VSIX 34.91MB. Ext 154 vitest + 19 integration + 8 corpus unit + 42 corpus e2e; host 103 unit + 44 engineTest.
- ✅ **EXECUTE COMPLETE — all 60 tasks + T38b committed on `main`.** Orchestrator gate: PASS (all batches green, one atomic commit per task, no forced gates, no weakened tests).
- ✅ **Verifier** → CONDITIONAL FAIL on G1/G2/G3 → **fix loop converged iteration 1** (G2 `69db995`, G1 `d7a8900`, G3 `7d2ac99`) → re-verified **PASS**. validation.md → PASS.
- ✅ **AD-015 Material fidelity** (user: investigate-first ×2): root-caused to an RClassGenerator id-consistency bug (framework-attr slots zeroed), **fixed** `7fe5d25` (**AD-016**) — Chip/ExtendedFAB/BottomNav/TextInputEditText render real; Q-TEXTAPP + Q-COLOR FIXED; AD-002 satisfied, pin untouched. Q-GUIDE remains documented out-of-scope.
- ✅ **Closing verification PASS (2026-07-20)** — AD-016 fix sound (id-consistency verified vs AGP source), 14-golden regen are legitimate improvements, no test weakened, gates green (host unit 111 / engineTest 47, corpus 42/42 @ 0%).
- 🏁 **FEATURE COMPLETE & VERIFIED.** All 60 tasks + T38b + G1/G2/G3 fixes + AD-016 on `main`. Spec PASS; AD-002 satisfied without a pin bump. Remaining documented non-blocking items: Q-GUIDE, degradeStyleParent edge case (see limitations.md). validation.md = PASS.

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

---
---

## UI Polish Fix-Pack Tasks (Amendment — 2026-07-26)

> Follow-up fixes to the delivered v1 (NOT a new feature). The **Execution Protocol at the top of
> this file applies unchanged** (tlc-spec-driven Execute flow, per-task gate, atomic verb-first
> commit per task, always-on Verifier). Task numbering continues the feature's sequence: **T61–T68**,
> **phases 11–14**. Verifier output is **appended to `validation.md` as a dated fix-pack section** —
> the v1 PASS record there is never rewritten.

**Spec**: the "UI Polish Fix-Pack" amendment section in `spec.md` (POLISH-01..08, stories FP-1..FP-5)
**Context**: the "UI Polish Fix-Pack Context" amendment section in `context.md` (design phase
skipped — no architectural decisions; every change follows an existing component pattern)
**Status**: Draft (awaiting user approval)

### Test Coverage Matrix (fix-pack)

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found:
> `CONTRIBUTING.md` (gate table), project convention from `.specs/STATE.md` ("`main.ts` only
> exercised via integration"; webview pure logic kept DOM-free for vitest). Sampled:
> `extension/webview-ui/*.test.ts`, `extension/src/*.test.ts`,
> `extension/src/test/integration/*.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Webview pure logic (`toolbar.ts`, `viewmodel.ts`, `viewport.ts`) | unit | All branches; 1:1 with the spec ACs each function implements; every listed edge case (clamps, cancel, hit-zones) | `extension/webview-ui/*.test.ts` | `cd extension && npm test` |
| Extension modules (`panel.ts`, `config.ts`, `scheduler.ts`) | unit | All branches; 1:1 spec ACs (queue order, retry counts, suppression, custom-device mapping) | `extension/src/*.test.ts` | `cd extension && npm test` |
| Extension↔webview loop (`activation.ts` wiring, message contract) | integration | Happy + failure path for each changed flow, driven via fake host + `deliverWebviewMessage` | `extension/src/test/integration/*.test.ts` | `cd extension && npm run test:integration` |
| `shellHtml` markup/CSS + `main.ts` DOM glue | unit (string-level structural invariants) + integration (message flows); visual outcome additionally verified by manual UAT | Elements present/absent asserted; containment CSS rules asserted as strings; gesture math lives in `viewport.ts` (unit) so glue stays thin | `extension/src/webview.test.ts`, integration suites | `cd extension && npm test && npm run test:integration` |
| Host (Kotlin) / corpus | none — untouched by this fix-pack | — | — | not in gates (no host/protocol change; corpus configs unaffected) |

### Gate Check Commands (fix-pack)

> Generated from codebase (`extension/package.json` scripts, `CONTRIBUTING.md`) — confirm before
> Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `cd extension && npm run build && npm test` |
| Full | After tasks touching `shellHtml`/`main.ts`/activation wiring or with integration tests | `cd extension && npm run build && npm test && npm run test:integration` |
| Build | After the final task | same as Full (host/corpus untouched) |

### Execution Plan (fix-pack)

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks
within a phase execute in order. 8 tasks → single batch, executed inline (no sub-agents).

**Phase 11: Toolbar simplification**

```
T61 → T62
```

**Phase 12: Stage containment**

```
T63
```

**Phase 13: First-open feedback**

```
T64 → T65
```

**Phase 14: Drag-to-resize**

```
T66 → T67 → T68
```

### Task Breakdown (fix-pack)

#### T61: Remove the Backdrop toggle and its plumbing

**What**: Delete the Backdrop button and every trace of the backdrop state; the stage background is
permanently the checkerboard.
**Where**: `extension/webview-ui/toolbar.ts` (drop `Backdrop`, `toggleBackdrop`, `backdropCss`'s
solid branch — keep/inline the checkerboard CSS constant; drop `ToolbarState.backdrop`),
`extension/webview-ui/main.ts` (backdropToggle click handler, `setConfig` backdrop handling),
`extension/src/panel.ts` (`shellHtml` button, `HydratedConfig.backdrop`), `extension/src/config.ts`
(`Backdrop` type, `StoredPreviewConfig.backdrop`, `PreviewConfigPatch.backdrop`),
`extension/src/activation.ts` (`hydratePanelConfig` backdrop field) + their tests
(`toolbar.test.ts`, `config.test.ts`, `webview.test.ts`, `panel.test.ts` as applicable).
**Depends on**: None
**Reuses**: existing checkerboard CSS value from `backdropCss`
**Requirement**: POLISH-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `shellHtml` contains no `backdropToggle`; `#stage` background is the checkerboard
      (static CSS or one constant — no toggle path)
- [ ] `grep -ri backdrop extension/src extension/webview-ui` returns no live code hits (docs/comments
      about the removal are fine)
- [ ] Previously persisted configs with a `backdrop` key still load (ignored field — covered by a
      config.test case reading a stored object containing `backdrop`)
- [ ] Gate check passes: `cd extension && npm run build && npm test`
- [ ] Test count does not drop except tests that asserted the removed toggle (each removal named in
      the commit message; no unrelated test deleted/weakened)

**Tests**: unit
**Gate**: quick

---

#### T62: Replace the Orientation button with a dropdown

**What**: Orientation becomes a two-option `<select>` (Portrait/Landscape, default Portrait) using
the same pattern as the Device picker; the toggle button and `toggleOrientation` go away.
**Where**: `extension/webview-ui/toolbar.ts` (remove `toggleOrientation`; keep
`buildOrientationChanged`), `extension/src/panel.ts` (`shellHtml`: `<select id="orientationPicker">`
replacing the button), `extension/webview-ui/main.ts` (populate options in `paintToolbar`, `change`
handler replacing the click handler) + `toolbar.test.ts`, `webview.test.ts`.
**Depends on**: None (ordered after T61 to avoid same-file churn)
**Reuses**: Device picker populate/sync pattern in `paintToolbar` (`main.ts:147-156`)
**Requirement**: POLISH-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `shellHtml` has `orientationPicker` `<select>` and no `orientationToggle` button
- [ ] Options are exactly Portrait and Landscape (wire values `portrait`/`landscape` unchanged);
      unconfigured file shows Portrait (FP-4 AC2)
- [ ] Picking an option emits `buildOrientationChanged` (existing persist/re-render/restore path
      untouched — hydration selects the stored value)
- [ ] Gate check passes: `cd extension && npm run build && npm test`

**Tests**: unit
**Gate**: quick

---

#### T63: Contain the preview inside the stage (app-shell CSS)

**What**: Restructure `shellHtml` CSS so the body never scrolls, the toolbar is always visible, and
the (CSS-transformed) image clips at the stage bounds instead of painting over the toolbar.
**Where**: `extension/src/panel.ts` (`shellHtml` `<style>` block: `html,body{height:100%;
overflow:hidden}`, body flex column; `#toolbar{flex:0 0 auto}` with opaque background; `#stage{flex:1
1 0; min-height:0; overflow:hidden; position:relative}`; `#errorPanel`/`#warnings` strips get
`max-height` + `overflow-y:auto`) + string-level invariants in `extension/src/webview.test.ts`.
**Depends on**: None
**Reuses**: existing pan/zoom (`clampPan` already bounds panning — behavior unchanged)
**Requirement**: POLISH-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Unit assertions: `#stage` rule contains `overflow: hidden`; body rule prevents page scroll;
      toolbar rule keeps it in normal flow above the stage with an opaque background
- [ ] Existing integration suites (walking skeleton, config flows) still pass — full gate:
      `cd extension && npm run build && npm test && npm run test:integration`
- [ ] Manual UAT note recorded in the commit body: tall layout + narrow panel + zoom/pan → image
      clips at stage, toolbar clickable (per FP-2's Independent Test)

**Tests**: unit (string invariants) + existing integration
**Gate**: full

---

#### T64: Panel busy state + ordered pre-ready message queue

**What**: A `setBusy` message end-to-end (manager API → webview spinner/label) and a real FIFO queue
for messages posted before the webview is ready (today: single `lastMessage` slot loses earlier
messages).
**Where**: `extension/src/panel.ts` (`setBusy(docPath, label?)`; replace `lastMessage` with a pending
message array flushed in order on `ready`; expose busy in `AppliedState` for observability),
`extension/webview-ui/viewmodel.ts` (`{type:'setBusy'; label?}` in `WebviewMessage` + reducer: busy
set/cleared; `setImage`/`setError` clear busy), `extension/webview-ui/main.ts` + `shellHtml`
(spinner element + phase label painted from the model, over the stage; last-good image stays dimmed
behind it) + `panel.test.ts` (webview-ui), `webview.test.ts`, viewmodel reducer tests.
**Depends on**: None
**Reuses**: existing `setStatus` reducer/message plumbing as the pattern; `#status` styling
**Requirement**: POLISH-02, POLISH-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Posting N messages before `ready` delivers all N in order after `ready` (unit-proved; FP-1 AC7)
- [ ] Reducer: `setBusy{label}` shows busy; `setImage` and `setError` clear it (all branches)
- [ ] Shell contains the spinner/label elements; `main.ts` paints them from the model
- [ ] Gate check passes: `cd extension && npm run build && npm test`

**Tests**: unit
**Gate**: quick

---

#### T65: Wire loading phases, transient-error suppression, and one automatic retry

**What**: The scheduler retries a host-level failure of the latest request exactly once and only
surfaces `onHostError` when settled-in-failure; activation feeds phase labels ("Preparing render
engine…" + download %, "Starting render host…", "Rendering…") into `setBusy` and clears busy on
outcomes. Domain errors are delivered immediately, never retried.
**Where**: `extension/src/scheduler.ts` (`onDispatch?(docPath, cause)` dep; per-doc `retried` flag in
the pump/failure path — host-failure of the latest id re-dispatches once before `onHostError`),
`extension/src/activation.ts` (`prepareRealHost` progress → `panelManager.setBusy` incl. download %;
busy around `ensureReady()`; `onDispatch` → "Rendering…"; `onResult`/`onHostError` clear busy; every
failed attempt logged to the output channel), `extension/src/test/fake-host.js` (new
`crash-on-first-render` mode: fail the first render RPC, succeed afterwards) +
`scheduler.test.ts`, new/extended integration test (open preview under `crash-on-first-render` →
settles with an image and NO error state ever applied; under `crash-on-render` → exactly 2 attempts
then error state).
**Depends on**: T64
**Reuses**: scheduler latest-wins id discipline (retry result must obey staleness rules);
`ensureInstalled` progress callback already used by the notification toast
**Requirement**: POLISH-02, POLISH-03

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Unit: host-failure → exactly one retry → success delivered, `onHostError` never called (FP-1
      AC3); retry also fails → `onHostError` called once after 2 attempts (FP-1 AC4); newer request
      during retry → latest-wins, no error painted for the stale failure (FP-1 AC5); domain error →
      delivered immediately, no retry (FP-1 AC6)
- [ ] Integration: `crash-on-first-render` open settles ok with `lastApplied.status === 'ok'` and no
      intermediate error application; failed attempt visible in output-channel log
- [ ] Gate check passes: `cd extension && npm run build && npm test && npm run test:integration`

**Tests**: unit + integration
**Gate**: full

---

#### T66: Remove the Size field; add pure resize math

**What**: Drop the Size input (and its parse/emit path); add the DOM-free helpers the drag gesture
needs: edge hit-testing and displayed-px → dp conversion with clamps.
**Where**: `extension/webview-ui/toolbar.ts` (remove `sizeText`, `parseSizeOverride`, size handling
in `buildConfigChanged` — it emits states only; keep `drawable.sizeDp` in the message type for the
drag path), `extension/src/panel.ts` (`shellHtml`: remove the Size label/input),
`extension/webview-ui/main.ts` (remove `sizeInput` handling/`emitConfig` size path),
`extension/webview-ui/viewport.ts` (add `edgeHitTest(x, y, imageRect, band=8)` →
`'right'|'bottom'|'corner'|null`; `dragSizeToDp(startDp, startDisplayPx, draggedDisplayPx, {densityDpi,
pixelScale})` → `{w,h}` integer dp clamped to [16 dp, 4096 px]) + `toolbar.test.ts`,
`viewport.test.ts`.
**Depends on**: None (ordered after Phase 11 toolbar edits)
**Reuses**: `clampZoomPercent`/canvas-cap constants in `viewport.ts`
**Requirement**: POLISH-06, POLISH-07 (math)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No `sizeInput` in shell; no `parseSizeOverride` export; `buildConfigChanged` emits states only;
      State picker behavior unchanged (existing tests still green)
- [ ] `edgeHitTest`/`dragSizeToDp` all-branch tested incl. clamps (16 dp floor, 4096 px cap at
      density × pixelScale) and proportional conversion through zoom
- [ ] Gate check passes: `cd extension && npm run build && npm test`

**Tests**: unit
**Gate**: quick

---

#### T67: Custom device size in ConfigStore + Device picker "Custom" entry

**What**: A layout's dragged size becomes a per-file custom device (`{id:'custom', label:'Custom
(W×H dp)', widthDp, heightDp}`); the Device dropdown shows it as a selected transient entry; picking
a preset discards it. The webview learns the document kind via hydration so a drag can route to
`sizeDp` (drawable) vs custom size (layout).
**Where**: `extension/src/config.ts` (`PreviewConfigPatch.customSize?: {w,h}` → maps to the custom
`DevicePreset` object, `sizeBucket` derived from width like the presets, `defaultDensity` = current
density; a `deviceId` patch replaces/clears custom), `extension/src/panel.ts` (`ConfigPatch.customSize`;
`HydratedConfig` gains `docKind` and optional `customSize`), `extension/src/activation.ts`
(`hydratePanelConfig` passes `docKind` via `classify` + custom size; `onConfigChanged` forwards
`customSize`), `extension/webview-ui/toolbar.ts` (`devicePickerOptions(custom?)` → presets + selected
"Custom (W×H dp)" when active), `extension/webview-ui/main.ts` (`setConfig` stores docKind/custom;
`paintToolbar` renders the custom option) + `config.test.ts`, `toolbar.test.ts`.
**Depends on**: T66
**Reuses**: `DEVICE_PRESETS` shape (`config.ts:35-41`); wire already carries the full device object
(`protocol.ts` `DevicePreset`, host `Dto.kt` reads `widthDp`/`heightDp` — no protocol change)
**Requirement**: POLISH-07 (extension side, FP-3 AC5/AC6 + persistence)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `configStore.update(doc, {customSize})` yields `preview.device` = custom preset (persisted,
      restored by `get`); subsequent `{deviceId}` patch returns to the preset and drops custom
- [ ] `devicePickerOptions` includes the selected Custom entry only while active (label format
      `Custom (411×600 dp)`); picker tests cover both states
- [ ] `HydratedConfig` carries `docKind` (layout/drawable classification) — unit-covered
- [ ] Gate check passes: `cd extension && npm run build && npm test`

**Tests**: unit
**Gate**: quick

---

#### T68: Webview edge-drag gesture, ghost outline, end-to-end resize

**What**: Pointer glue in the webview: resize cursor + drag start in the 8 px edge band (pan
suppressed there), ghost outline during drag, one `configChanged` on pointerup routed by docKind
(`drawable.sizeDp` vs `customSize`), abort on pointercancel/Esc, no affordance without an image.
**Where**: `extension/webview-ui/main.ts` (pointer handlers using T66's `edgeHitTest`/`dragSizeToDp`;
ghost element painting; routing by hydrated docKind), `extension/src/panel.ts` (`shellHtml`: ghost
element + cursor styles), `extension/src/webview.test.ts` (structural invariants), integration test
(fake host echoes config: deliver a layout `configChanged{customSize}` → next `RenderRequest.config.device`
is the custom preset & `configStore` shows `device.id === 'custom'`; deliver a drawable
`configChanged{drawable:{states,sizeDp}}` → request carries `sizeDp` — extending the existing
config-flow integration suite).
**Depends on**: T66, T67
**Reuses**: existing pointer pan handlers in `main.ts:301-322` (resize takes precedence in the edge
band); `deliverWebviewMessage` integration pattern
**Requirement**: POLISH-07 (FP-3 AC2/AC3/AC4/AC7/AC8)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Gesture math delegated to T66 helpers (glue stays thin per project convention); ghost shown only
      during drag; exactly one `configChanged` per completed drag; cancel emits nothing
- [ ] No resize affordance when no image is displayed (FP-3 AC8 — model-driven, unit-covered where
      pure)
- [ ] Integration: both routing paths land in the fake host's echoed `RenderRequest.config` (custom
      device for layout, `sizeDp` for drawable)
- [ ] Manual UAT note in commit body: drag corner on a real layout → "Custom (W×H dp)" appears,
      re-render at new size; preset pick snaps back (per FP-3's Independent Test)
- [ ] Gate check passes: `cd extension && npm run build && npm test && npm run test:integration`

**Tests**: unit + integration
**Gate**: full

### Phase Execution Map (fix-pack)

```
Phase 11 → Phase 12 → Phase 13 → Phase 14

Phase 11:  T61 ──→ T62
Phase 12:  T63
Phase 13:  T64 ──→ T65
Phase 14:  T66 ──→ T67 ──→ T68
```

Execution is strictly sequential — 8 tasks total → **single batch, inline** (≤ ~8: no sub-agent
offer). After T68's commit, the always-on **Verifier** runs (author ≠ verifier): spec-anchored
outcome check + discrimination sensor → results **appended to `validation.md`** as a dated "UI
Polish Fix-Pack Verification" section; gaps become fix tasks (bounded 3 iterations). The v1 PASS
record in `validation.md` is never modified.

## Drag-Resize Defect Fix Tasks (Amendment — 2026-07-26)

> Defect fix to the UI Polish fix-pack (DF-1: Chromium's native image drag hijacks the edge-drag
> gesture — see the "Defect Amendment (2026-07-26): DF-1" section in `spec.md`, requirement
> **POLISH-09**, and **AD-018** in `.specs/STATE.md`). The **Execution Protocol at the top of this
> file applies unchanged**. Task numbering continues the feature's sequence: **T69–T70**, **phase
> 15**. Verifier output is appended to `validation.md` as a dated section — prior records are never
> rewritten.

**Spec**: the "Defect Amendment (2026-07-26): DF-1" section in `spec.md` (POLISH-09)
**Context**: none needed — no gray areas; the fix is forced by the code-verified root cause (design
phase skipped: both tasks follow existing component patterns)
**Status**: Draft (awaiting user approval)

### Test Coverage Matrix (defect fix)

> Inherited unchanged from the fix-pack matrix above (same layers, same commands); the two touched
> layers repeated for reference. One tightening per AD-018: for browser-native behavior the
> automated gates are structurally blind, so interactive UAT in a real VS Code webview is a
> REQUIRED verification step for gesture code, not an optional note.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `shellHtml` markup/CSS (`webview.ts`) | unit (string-level structural invariants) | Suppression attribute + CSS rules asserted present (POLISH-09 AC1); existing POLISH-01/05 invariants stay green | `extension/src/webview.test.ts` | `cd extension && npm test` |
| `main.ts` DOM glue | existing unit + integration stay green; behavior additionally verified by MANDATORY interactive UAT (AD-018) | Gesture completes end-to-end in a real webview (FP-3 Independent Test + POLISH-09 AC2/AC3) | integration suites + manual UAT | `cd extension && npm run test:integration` |

### Gate Check Commands (defect fix)

Unchanged from the fix-pack table above: **Quick** = `cd extension && npm run build && npm test`;
**Full** = `cd extension && npm run build && npm test && npm run test:integration`.

### Execution Plan (defect fix)

**Phase 15: Native-drag suppression**

```
T69 → T70
```

### Task Breakdown (defect fix)

#### T69: Make the preview image non-draggable in the shell

**What**: Suppress Chromium's native image drag at the markup/CSS level: `draggable="false"` on the
preview `<img>`, `-webkit-user-drag: none` + `user-select: none` on `#preview`, `user-select: none`
on `#stage`.
**Where**: `extension/src/webview.ts` (`panelShellHtml`: the `<img id="preview">` element at :129,
the `#preview` rule at :90, the `#stage` rule at :87) + string-level invariants in
`extension/src/webview.test.ts` (new POLISH-09 describe block).
**Depends on**: None
**Reuses**: the `panelShellHtml` string-invariant pattern (`webview.test.ts:51-58`, resizeGhost
regex-on-rule block)
**Requirement**: POLISH-09 (AC1)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `panelShellHtml` output has `draggable="false"` on `#preview`; the `#preview` rule contains
      `-webkit-user-drag: none` and `user-select: none`; the `#stage` rule contains
      `user-select: none` — all asserted as string-level unit invariants
- [ ] No other shell markup/CSS changed (existing POLISH-01/05/08 invariants untouched and green)
- [ ] Gate check passes: `cd extension && npm run build && npm test`

**Tests**: unit (string invariants)
**Gate**: quick

---

#### T70: Guard the gesture glue and verify the drag interactively

**What**: Belt-and-braces in the pointer glue — document-level `dragstart` suppression,
`preventDefault()` + `setPointerCapture` on gesture pointerdown (both the resize and the pan
branches), capture released on pointerup/pointercancel — then the mandatory real-webview UAT this
defect class requires.
**Where**: `extension/webview-ui/main.ts` (stage `pointerdown` handler :363-382; window
`pointerup`/`pointercancel` :426-455; new document-level `dragstart` listener).
**Depends on**: T69 (the interactive UAT verifies the combined fix, so it must land last)
**Reuses**: existing FP-3 gesture handlers and cancel semantics (unchanged); T66 math in
`viewport.ts` untouched
**Requirement**: POLISH-09 (AC2/AC3) — restores POLISH-07 (FP-3 AC3–AC7) end-to-end

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `pointerdown` starting a resize or pan calls `e.preventDefault()` and captures the pointer on
      the stage; capture is released on pointerup/pointercancel; `dragstart` is suppressed
      document-wide; Esc/pointercancel abort behavior unchanged (glue stays thin per project
      convention — no gesture math added)
- [ ] Full gate passes: `cd extension && npm run build && npm test && npm run test:integration`
      (config-flow routing suites unchanged; no test weakened or deleted)
- [ ] **Interactive UAT in a real VS Code webview (MANDATORY, AD-018 — evidence recorded in the
      commit body)**: on a real layout — corner drag shows the thin dashed ghost outline tracking
      the pointer (NOT a translucent image copy with a green "+" badge), exactly one re-render at
      the new size, Device shows "Custom (W×H dp)"; right-edge and bottom-edge drags resize one
      axis; a drag released outside the panel completes without a stuck ghost; Esc aborts with no
      render; a drag from the image center pans. On a drawable — corner drag re-renders at the new
      `sizeDp`

**Tests**: existing unit + integration green + mandatory interactive UAT
**Gate**: full

### Phase Execution Map (defect fix)

```
Phase 15:  T69 ──→ T70
```

Execution is strictly sequential — 2 tasks → **single batch, inline** (no sub-agent offer). After
T70's commit, the always-on **Verifier** runs (author ≠ verifier): spec-anchored outcome check +
discrimination sensor → results **appended to `validation.md`** as a dated "Drag-Resize Defect Fix
Verification" section; the interactive-UAT evidence is part of what it checks (AD-018). The Verifier
also distills the jsdom-blindness-to-native-browser-behavior lesson via `scripts/lessons.py`.

### Task Granularity Check (fix-pack)

| Task | Scope | Status |
| ---- | ----- | ------ |
| T61: Remove backdrop | 1 concern (one state field's full removal) across the files that reference it | ✅ Granular (cohesive) |
| T62: Orientation dropdown | 1 control swap | ✅ Granular |
| T63: Containment CSS | 1 style block | ✅ Granular |
| T64: Busy state + ready queue | 1 message type + 1 queue fix (same delivery path) | ✅ Granular (cohesive) |
| T65: Phases/suppression/retry | 1 behavior (settled-error delivery) across scheduler+activation | ✅ Granular (cohesive) |
| T66: Size removal + math | 1 removal + 2 pure functions | ✅ Granular (cohesive) |
| T67: Custom device config | 1 config concept | ✅ Granular |
| T68: Drag gesture | 1 gesture (glue only, math in T66) | ✅ Granular |

### Diagram-Definition Cross-Check (fix-pack)

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T61 | None | Phase 11 start | ✅ Match |
| T62 | None (ordered after T61) | T61 → T62 (ordering only) | ✅ Match |
| T63 | None | Phase 12 start | ✅ Match |
| T64 | None | Phase 13 start | ✅ Match |
| T65 | T64 | T64 → T65 | ✅ Match |
| T66 | None (ordered after Phase 11) | Phase 14 start | ✅ Match |
| T67 | T66 | T66 → T67 | ✅ Match |
| T68 | T66, T67 | T66 → T67 → T68 | ✅ Match |

No task depends on a later phase; arrows point backward/within phase only.

### Test Co-location Validation (fix-pack)

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T61 | webview pure + extension modules + shellHtml | unit (+ string invariants) | unit | ✅ OK |
| T62 | webview pure + shellHtml + main.ts glue | unit (glue via existing integration) | unit | ✅ OK |
| T63 | shellHtml CSS | unit string invariants + existing integration + manual UAT | unit + integration | ✅ OK |
| T64 | extension panel + webview pure + shellHtml | unit | unit | ✅ OK |
| T65 | scheduler + activation wiring + fake host | unit + integration | unit + integration | ✅ OK |
| T66 | webview pure + shellHtml | unit | unit | ✅ OK |
| T67 | config + panel + toolbar pure | unit | unit | ✅ OK |
| T68 | main.ts glue + integration loop | integration (glue) + unit (pure parts) | unit + integration | ✅ OK |

No `Tests: none` entries; no deferrals — every task verifies the code it changes (T62's `main.ts`
glue is exercised by the existing config-flow integration suites that already drive the toolbar path,
and its logic lives in unit-tested `toolbar.ts` builders).

## Release & Publish Automation Tasks (Amendment — 2026-07-26)

> Pre-release automation for the delivered v1 (NOT a new feature). The **Execution Protocol at the
> top of this file applies unchanged** (tlc-spec-driven Execute flow, per-task gate, atomic
> verb-first commit per task, always-on Verifier). Task numbering continues the feature's sequence:
> **T71–T76**, **phases 16–18**. Verifier output is **appended to `validation.md` as a dated
> release-automation section** — prior PASS records are never rewritten.

**Spec**: the "Release & Publish Automation" amendment section in `spec.md` (REL-01..05)
**Context**: the "Release & Publish Automation Context" amendment section in `context.md`
**Status**: Approved — user directed immediate execution (2026-07-26)

### Test Coverage Matrix (release-automation)

> Honest scoping: GitHub workflow YAML has no locally executable runtime — triggers, guards, and
> the publish path only run on GitHub's side after push. The local gate therefore proves **syntax
> validity + declared invariants** (parse + grep assertions pinned to the spec ACs), packaging
> proves the Marketplace listing, and the runbook's first-release steps double as the live
> verification pass. The discrimination sensor applies only to sensor-testable layers (none here —
> precedent: T69/T70 `main.ts` glue, AD-018).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Workflow YAML (`.github/workflows/*.yml`) | static validation | every file parses; each spec AC's structural invariant asserted (triggers, guard expression, runner labels, secret references, permissions) | `.github/workflows/*.yml` | `ruby -ryaml` parse + per-task grep assertions |
| Marketplace listing (`extension/README.md`, `extension/CHANGELOG.md`) | packaging validation | both files listed by `vsce ls`; package build exits 0 | `extension/*.md` | `cd extension && npm run package && npx vsce ls` |
| Docs (`docs/release-checklist.md`, `CONTRIBUTING.md`, `docs/limitations.md`) | content presence | REL-05 ACs' required topics present | `docs/*.md`, `CONTRIBUTING.md` | grep assertions |
| Extension/host code | none — untouched by this amendment | — | — | final Build gate runs `cd extension && npm test` as a no-regression sanity only |

### Gate Check Commands (release-automation)

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | workflow/docs tasks | `ruby -ryaml -e 'YAML.load_file(ARGV[0])' <changed .yml files>` + the task's grep assertions |
| Full | packaging task (T71) | `cd extension && npm run package` (exit 0) + `npx vsce ls` listing assertions |
| Build | final task (T76) | Quick + `cd extension && npm test` (no-regression sanity) |

### Execution Plan (release-automation)

6 tasks → single batch, executed inline (no sub-agents).

**Phase 16: Marketplace listing content**

```
T71
```

**Phase 17: CI & release pipelines**

```
T72 → T73 → T74
```

**Phase 18: Runbook & bookkeeping**

```
T75 → T76
```

### Task Breakdown (release-automation)

#### T71 — Create the Marketplace listing content

- **Files**: `extension/README.md`, `extension/CHANGELOG.md`
- **Requirements**: REL-01
- **Done when**: REL-01 AC1–AC3 hold (`vsce ls` lists both files; `npm run package` exits 0;
  README covers purpose, features, requirements, quickstart, settings, links; CHANGELOG has a
  `1.0.0` section)
- **Tests**: packaging validation — **Gate**: Full
- **Status**: [x] complete (commit `571e1cd`)

#### T72 — Make CI manual-only on macos-26 and drop smoke-x64

- **Files**: `.github/workflows/ci.yml`, `.github/workflows/canary.yml`
- **Requirements**: REL-02
- **Done when**: REL-02 AC1–AC4 hold (triggers exactly `workflow_dispatch`+`workflow_call` with
  optional `ref` input wired into every checkout; `smoke-x64` gone; `macos-26` runners; canary
  keeps schedule)
- **Tests**: static validation — **Gate**: Quick
- **Status**: [x] complete (commit `4a5aa34`)

#### T73 — Add the guarded /run ci PR comment command

- **Files**: `.github/workflows/run-ci-comment.yml`
- **Requirements**: REL-03
- **Done when**: REL-03 AC1–AC5 hold (issue_comment trigger; OWNER/MEMBER/COLLABORATOR guard;
  reuses ci.yml at `refs/pull/N/merge`; ack comment; no publish secrets reachable)
- **Tests**: static validation — **Gate**: Quick
- **Status**: [x] complete (commit `fca863e`)

#### T74 — Create the one-click release pipeline

- **Files**: `.github/workflows/release.yml`
- **Requirements**: REL-04
- **Done when**: REL-04 AC1–AC5 hold (dispatch-only with bump choice; gate→bump→build→publish→
  commit+tag+Release order; secret-gated Open VSX; `concurrency: release`; `contents: write` only)
- **Tests**: static validation — **Gate**: Quick
- **Status**: [x] complete (commit `da14ddf`)

#### T75 — Write the publisher runbook and CI-policy docs

- **Files**: `docs/release-checklist.md`, `CONTRIBUTING.md`, `docs/limitations.md`
- **Requirements**: REL-05
- **Done when**: REL-05 AC1–AC3 hold (publisher-setup runbook incl. PAT-retirement note and
  first-release=major; CONTRIBUTING documents manual CI + `/run ci`; limitations notes Intel
  best-effort)
- **Tests**: content presence — **Gate**: Quick
- **Status**: [x] complete (commit `3f3c25f`)

#### T76 — Record AD-019 and close out the amendment

- **Files**: `.specs/STATE.md`
- **Requirements**: bookkeeping for REL-01..05
- **Done when**: AD-019 + AD-004 amendment note in STATE.md Decisions; Handoff updated; final
  Build gate green
- **Tests**: none — **Gate**: Build
- **Status**: [x] complete (STATE.md close-out commit)

## First-Run Host Wedge Fix Tasks (Amendment — 2026-07-27)

> Defect fix DF-2: a startup failure during the first-run engine download wedges the HostManager in
> `'starting'` forever and blocks `reconfigure()` — see the "Defect Amendment (2026-07-27): DF-2"
> section in `spec.md`, requirement **HOST-04**, and **AD-020** in `.specs/STATE.md`. The
> **Execution Protocol at the top of this file applies unchanged**. Task numbering continues the
> feature's sequence: **T77–T82**, **phase 19**. Ships as **patch release 1.0.1** (REL-04 pipeline,
> bump `patch`). Verifier output is appended to `validation.md` as a dated section — prior records
> are never rewritten.

**Spec**: the "Defect Amendment (2026-07-27): DF-2" section in `spec.md` (HOST-04)
**Context**: none needed — no gray areas; the fix is forced by the code-verified root cause (design
phase skipped: all tasks follow existing component patterns; the three assumptions are logged in the
spec amendment)
**Status**: Approved (user, 2026-07-27) — execution NOT started

### Test Coverage Matrix (DF-2)

> Inherited from the feature matrix (same layers, same commands). One tightening per AD-018/AD-020:
> the configuration race lives in a path the integration harness replaces (`INFLATE_TEST_FAKE_HOST`
> bypasses `ensureRealHostConfigured`), so interactive first-run UAT is a REQUIRED verification step
> for this defect class, not an optional note. Baseline at amendment time: **196 vitest tests / 15
> files** — counts only grow.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `HostManager` (`host.ts`) | unit (real fake-host child, existing harness) | 1:1 to HOST-04 AC1–AC3 + both spec edge cases; existing 14 host tests stay green | `extension/src/host.test.ts` | `cd extension && npm test` |
| Single-flight gate (new `gate.ts`) | unit | All branches: concurrent join, sequential re-run, failure clears in-flight (AC4 gate semantics) | `extension/src/gate.test.ts` | `cd extension && npm test` |
| `activation.ts` wiring | existing integration stays green + MANDATORY interactive first-run UAT (AC6) | Cold-cache race completes end-to-end in a real window | integration suites + manual UAT | `cd extension && npm run test:integration` |
| `ArtifactManager` (`artifacts.ts`) | unit | AC5: code-only AAR (no `res/`) reported installed; res-bearing AAR unchanged; missing dir still missing | `extension/src/artifacts.test.ts` | `cd extension && npm test` |

### Gate Check Commands (DF-2)

Unchanged from the feature tables: **Quick** = `cd extension && npm run build && npm test`;
**Full** = `cd extension && npm run build && npm test && npm run test:integration`. Host (JVM) side
untouched — no gradle gate needed.

### Execution Plan (DF-2)

**Phase 19: First-run host wedge fix**

```
T77 → T78 → T79 → T81 → T82
T80 ──────────────↗
```

6 tasks → single batch, executed inline (no sub-agent offer). T80 is independent but sequenced
after T79 in batch order; T81 (changelog) documents the fixes so it needs T77–T80 committed; T82
closes the amendment.

### Task Breakdown (DF-2)

#### T77: Route startup failure through the crash path

**What**: A child that exits or errors while `starting` (and not intentionally killed) transitions
`starting → crashed` via `handleCrash` — crash bookkeeping, stderr-enriched `lastCrashReason`,
backoff auto-restart — while still rejecting the pending startup promise with the existing readable
reason. Add the `starting -> crashed` edge to the state-machine doc comment.
**Where**: `extension/src/host.ts` (`spawnAndInitialize` exit handler :263-271 and error handler
:272-279; header state-machine doc :4-7) + new tests in `extension/src/host.test.ts`.
**Depends on**: None
**Reuses**: existing `makeManager`/`waitUntil`/fake-host harness (`host.test.ts:29-57`) and the
`crash-on-start` fake-host mode (`test/fake-host.js:40`); `handleCrash` (:426) unchanged in shape
**Requirement**: HOST-04 (AC1, AC2 + crash-budget edge case)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] After `ensureReady()` rejects on `crash-on-start`, `getState()` is `'crashed'` (not
      `'starting'`), `crashCount()` is 1, `getLastCrashReason()` contains the exit reason
- [x] Backoff auto-restart fires after a startup failure (state re-enters `'starting'` without a
      manual call); a 4th startup failure in the window latches `needsManualRestart()`
- [x] `dispose()` during `'starting'` records NO crash and ends `'stopped'` (intentional-kill edge)
- [x] The spawn-`error` path (nonexistent command) gets the same treatment as `exit`
- [x] Existing 14 host tests untouched and green; gate passes: `cd extension && npm run build && npm test`

**Tests**: unit — **Gate**: quick
**Status**: [x] complete (commit `3e4b7ea`)

---

#### T78: Allow reconfigure whenever no live child exists

**What**: Change `reconfigure()`'s guard from `state !== 'stopped'` to "a live child exists"
(`'starting'`/`'ready'`/`'rendering'` no-op; `'stopped'`/`'crashed'` apply), so the real java
command can land after a placeholder startup failure.
**Where**: `extension/src/host.ts` (`reconfigure` :155-166 + its doc comment) + tests in
`extension/src/host.test.ts`.
**Depends on**: T77 (the recovery test needs the `'crashed'` post-failure state)
**Reuses**: the existing T60 reconfigure tests (`host.test.ts:201-223`) — the live-host no-op test
stays green as-is
**Requirement**: HOST-04 (AC3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] DF-2 recovery test: `crash-on-start` startup failure → `reconfigure('normal')` →
      `ensureReady()` reaches `'ready'` running the NEW command
- [x] Live-host no-op preserved: reconfigure while `'ready'` still ignored (existing test green,
      unmodified)
- [x] Gate passes: `cd extension && npm run build && npm test`

**Tests**: unit — **Gate**: quick
**Status**: [x] complete (commit `ccb3a10`)

---

#### T79: Gate render-path host boots behind single-flight configuration

**What**: A tiny `singleFlight(fn)` helper (concurrent callers join one in-flight promise; settled
runs are not cached) wrapping `prepareRealHost`, and the scheduler's `ensureReady` dep awaits
`ensureRealHostConfigured()` before `hostManager.ensureReady()` — so no render path can ever boot
the placeholder, and a save landing mid-download joins the running install instead of starting a
second one.
**Where**: new `extension/src/gate.ts` + `extension/src/gate.test.ts`;
`extension/src/activation.ts` (scheduler host dep :140-147; `ensureRealHostConfigured` :105-119
routes through the shared gate).
**Depends on**: T78 (recovery semantics complete underneath, so a pre-gate crash still self-heals)
**Reuses**: `scheduler.ts` needs NO change — its retry already awaits the injected `ensureReady`
and handles its rejection (`scheduler.ts:198-207`); `prepareRealHost` already idempotent-and-cheap
once configured (activation.ts:389-392)
**Requirement**: HOST-04 (AC4 + prepareRealHost-failure edge case)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `gate.test.ts`: two concurrent calls run `fn` once and share the result; a rejected run
      clears the in-flight slot (next call re-runs); a resolved run is not memoized (next call
      re-runs)
- [x] `activation.ts`: scheduler `ensureReady` dep awaits the configuration gate first (fake-host
      mode still returns immediately — integration harness unaffected); openPreview/restartHost use
      the same shared gate (no duplicate concurrent `prepareRealHost`)
- [x] Full gate passes: `cd extension && npm run build && npm test && npm run test:integration`
      (no test weakened or deleted)

**Tests**: unit (gate) + existing integration green — **Gate**: full
**Status**: [x] complete (commit `ed607ba`)

---

#### T80: Report code-only AARs as installed

**What**: `isArtifactInstalled` for kind `'aar'` keys on the extracted AAR directory
(`aar-res/<name>/AndroidManifest.xml`) instead of `res/` presence, so Doctor stops reporting the
~15 code-only androidx AARs as `missing` (side benefit: interrupted-install resume stops
re-downloading them).
**Where**: `extension/src/artifacts.ts` (`isArtifactInstalled` :354-365) + tests in
`extension/src/artifacts.test.ts`.
**Depends on**: None (independent; sequenced after T79 in batch order only)
**Reuses**: existing artifacts test fixtures/zip helpers in `artifacts.test.ts`; every AAR ships
`AndroidManifest.xml` (finalize unzips it — :412-422, `readPackageName` :426-432 already relies on it)
**Requirement**: HOST-04 (AC5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Unit tests: res-less AAR → `installed: true`; res-bearing AAR → unchanged `true`; never-
      extracted AAR → `false`; `ready` still keyed solely on `.complete`
- [x] Gate passes: `cd extension && npm run build && npm test`

**Tests**: unit — **Gate**: quick
**Status**: [x] complete (commit `df8dc66`)

---

#### T81: Add the 1.0.1 changelog entry

**What**: A `## 1.0.1` section at the top of the extension changelog documenting the DF-2 fixes in
user-facing language: first preview no longer hangs permanently when a render lands during the
one-time engine download (host now recovers automatically), and `Inflate: Doctor` no longer
mislabels code-only androidx AARs as `missing`.
**Where**: `extension/CHANGELOG.md` (new section above `## 1.0.0`).
**Depends on**: T77, T78, T79, T80 (the entry documents landed fixes, not intentions)
**Reuses**: the existing 1.0.0 section's tone/format; REL-01 AC2 already gates that
`CHANGELOG.md` is packaged (`vsce ls`)
**Requirement**: REL-01 (AC2 pattern — per-release section) in service of HOST-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `## 1.0.1` section present above `## 1.0.0`, covering the first-run wedge fix and the Doctor
      AAR-report fix — no other sections touched
- [x] Gate passes: `cd extension && npm run build && npm test`

**Tests**: none (docs — matrix has no layer for markdown content) — **Gate**: quick
**Status**: [x] complete (commit `c9a4e80`)

---

#### T82: Run the first-run race UAT and close out

**What**: The mandatory interactive first-run UAT this defect class requires (AD-018/AD-020:
automated gates are structurally blind here), then bookkeeping: record AD-020 in `.specs/STATE.md`
Decisions, update Handoff, mark HOST-04 traceability.
**Where**: manual UAT in a real VS Code window; `.specs/STATE.md`;
`.specs/features/android-xml-preview/spec.md` (traceability status only).
**Depends on**: T81 (and transitively T77–T80)
**Reuses**: repro recipe from the DF-2 spec section; `inflate.clearEngineCache` command
**Requirement**: HOST-04 (AC6)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] **Interactive UAT (MANDATORY — evidence recorded in the commit body)**: performed 2026-07-27
      by the user via Devin against a packaged `inflate-1.0.0.vsix` (`npm run package` at repo
      root), fresh install, `fixtures/gradle-sample/app/src/main/res/layout/main.xml`: opened the
      preview (triggering the live one-time engine download), pressed Cmd+S while the "preparing
      render engine (~170 MB)" notification was visible → the download completed and the SAME
      session's preview rendered successfully (no `cannot render while host state is 'starting'`
      wedge). Repeated passively (no save) — plain path unaffected. User-confirmed: "It works."
- [x] AD-020 recorded in STATE.md Decisions; Handoff updated; spec traceability HOST-04 → Verified
      pending Verifier
- [x] Full gate green at close: `cd extension && npm run build && npm test && npm run test:integration`
      (unit 206/206, integration 25/25)

**Tests**: manual UAT + full suite green — **Gate**: full
**Status**: [x] complete (UAT confirmed 2026-07-27; bookkeeping this commit)

### Phase Execution Map (DF-2)

```
Phase 19:  T77 ──→ T78 ──→ T79 ──→ T81 ──→ T82
           T80 ─────────────────────↗
```

Execution is strictly sequential in batch order T77, T78, T79, T80, T81, T82 — 6 tasks → **single
batch, inline** (no sub-agent offer). After T82's commit, the always-on **Verifier** runs (author ≠
verifier): spec-anchored outcome check + discrimination sensor → results **appended to
`validation.md`** as a dated "First-Run Host Wedge Fix Verification" section; the UAT evidence is
part of what it checks. The Verifier also distills the harness-blindness lesson (fake-host bypass
hides placeholder/config races; state must be asserted after failure paths, not just rejection) via
`scripts/lessons.py`.

### Task Granularity Check (DF-2)

| Task | Scope | Status |
| ---- | ----- | ------ |
| T77: Startup failure → crash path | 1 behavior in 1 file (+ its tests) | ✅ Granular |
| T78: Reconfigure guard | 1 guard in 1 function (+ its tests) | ✅ Granular |
| T79: Single-flight gate | 1 new helper + 1 wiring site | ✅ Granular (cohesive — the wiring is the helper's only consumer) |
| T80: AAR installed-check | 1 function branch (+ its tests) | ✅ Granular |
| T81: 1.0.1 changelog entry | 1 doc section | ✅ Granular |
| T82: UAT + bookkeeping | no code | ✅ Granular |

### Diagram-Definition Cross-Check (DF-2)

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T77 | None | start of chain | ✅ Match |
| T78 | T77 | T77 → T78 | ✅ Match |
| T79 | T78 | T78 → T79 | ✅ Match |
| T80 | None | own lane → T81 | ✅ Match |
| T81 | T77, T78, T79, T80 | T79 → T81 and T80 → T81 (T77/T78 transitively via T79) | ✅ Match |
| T82 | T81 (transitively T77–T80) | T81 → T82 | ✅ Match |

### Test Co-location Validation (DF-2)

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T77 | HostManager | unit | unit | ✅ OK |
| T78 | HostManager | unit | unit | ✅ OK |
| T79 | gate.ts + activation wiring | unit + integration-green | unit + integration | ✅ OK |
| T80 | ArtifactManager | unit | unit | ✅ OK |
| T81 | none (markdown content) | none — build gate only | none | ✅ OK |
| T82 | none (UAT + docs) | manual UAT (matrix row 3) | manual UAT | ✅ OK |

## CI Comment Pipeline Fix Tasks (Amendment — 2026-07-27)

> Defect fix DF-3: the first live `/run ci` (PR #1, run 30284080541) 403'd its ack comment — the
> job holds `issues: write` where a PR conversation comment is permission-checked against the
> target resource and needs `pull-requests: write` — and left the PR with no visible gate result
> (`issue_comment` runs attach to the default branch, never the PR head). See the "Defect Amendment
> (2026-07-27): DF-3" section in `spec.md` (requirement **REL-06**) and "CI Comment Pipeline
> Context (Amendment — 2026-07-27)" in `context.md`. The **Execution Protocol at the top of this
> file applies unchanged**. Task numbering continues the feature's sequence: **T83–T88**,
> **phase 20**; T87 rides along as a user-requested drift fix (2026-07-27) — the stale "daily"
> canary wording left by AD-019's weekly amendment (no REL-06 AC). **Ships by merging to `main`**
> — `issue_comment` executes the default-branch
> workflow definition; the VSIX is untouched, so no version bump and no Marketplace release.
> Verifier output is appended to `validation.md` as a dated section — prior records are never
> rewritten.

**Spec**: the "Defect Amendment (2026-07-27): DF-3" section in `spec.md` (REL-06)
**Context**: the "CI Comment Pipeline Context (Amendment — 2026-07-27)" section in `context.md`
(user decisions: guard scope unchanged, ruleset-required check with bypass list, statuses-only
feedback; job topology and the cancelled-run rule are agent discretion, logged in the spec's
assumptions table)
**Status**: Approved (user, 2026-07-27) — execution NOT started

### Test Coverage Matrix (DF-3)

> Honest scoping, inherited from the release-automation amendment: workflow YAML has no locally
> executable runtime — the local gate proves **syntax validity + declared invariants** (parse +
> grep assertions pinned to the REL-06 ACs). The live ACs (ack posts without 403, `pending`
> appears in the PR checks area, final status matches the gate) are verified **post-merge on the
> next PR** per the spec's ordered rollout — a documented runbook step (T86), exactly like the
> release-automation first-run. On the PR carrying THIS fix the old workflow still governs
> `/run ci` (spec edge case) — a 403'd ack there is expected, not a failure. The discrimination
> sensor applies only to sensor-testable layers (none here — REL/T69-T70 precedent).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Workflow YAML (`run-ci-comment.yml`) | static validation | file parses; every REL-06 AC's structural invariant asserted (per-job permissions, guard triple on every job, single SHA resolve + output threading, `full-gate` context/state/`target_url`, explicit result mapping with no cancelled/skipped write branch, no checkout in any status/comment job) | `.github/workflows/run-ci-comment.yml` | `ruby -ryaml -e 'YAML.load_file(ARGV[0])'` + per-task grep assertions |
| `ci.yml` (REL-06 AC5: SHALL NOT change) | static validation | byte-identical throughout the amendment | `.github/workflows/ci.yml` | `git diff --exit-code HEAD -- .github/workflows/ci.yml` |
| `canary.yml` (T87: comment wording only) | static validation | parses; the stale "daily schedule" claim gone; `schedule:` cron byte-identical | `.github/workflows/canary.yml` | `ruby -ryaml` parse + grep |
| Docs (`docs/release-checklist.md`, `CONTRIBUTING.md`) | content presence | AC6 topics present: exact ruleset clicks, both bypass entries, strict up-to-date OFF, the four ordered rollout steps, the PAT fallback + its trigger condition, the required-check consequence for contributors | `docs/release-checklist.md`, `CONTRIBUTING.md` | grep assertions |
| Extension/host code | none — untouched by this amendment | — | — | final Build gate runs `cd extension && npm test` as no-regression sanity only (T76 precedent) |

### Gate Check Commands (DF-3)

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | workflow/docs tasks (T83–T87) | `ruby -ryaml -e 'YAML.load_file(ARGV[0])' <the task's changed .yml>` + the task's grep assertions + `git diff --exit-code HEAD -- .github/workflows/ci.yml` |
| Build | final task (T88) | Quick across all four workflow files + the full T83–T87 assertion set + docs greps + `cd extension && npm test` (no-regression sanity) |

Full: not applicable — no packaged file and no extension/host code changes in this amendment.

### Execution Plan (DF-3)

**Phase 20: CI comment pipeline fix**

```
T83 → T84 → T85 → T86 → T87 → T88
```

6 tasks → single batch, executed inline (no sub-agent offer).

### Task Breakdown (DF-3)

#### T83: Fix the ack permission for PR conversation comments

**What**: Swap the ack job's `issues: write` for `pull-requests: write` and correct its inline
comment — the endpoint IS the issues REST API, but GitHub permission-checks the **target
resource**, and this job posts only to PRs by guard construction. Fixes the live 403 (REL-03 AC4's
first real failure).
**Where**: `.github/workflows/run-ci-comment.yml:42-43` (job `permissions:` block + its comment).
**Depends on**: None
**Reuses**: the job/guard/concurrency structure unchanged — this is a permission-line fix only
**Requirement**: REL-06 (AC1; AC5 invariants preserved)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The ack job's `permissions:` carries `pull-requests: write` and NOT `issues: write`
      (replacement, not addition — grep both directions)
- [ ] The inline comment states the target-resource rule (no longer implies `issues: write`
      suffices for a PR comment)
- [ ] Untouched (grep-asserted): the guard triple on both jobs, the concurrency ternary, the gate
      job's `contents: read` + `uses: ./.github/workflows/ci.yml`
- [ ] Quick gate passes: file parses + `ci.yml` diff clean

**Tests**: static validation — **Gate**: Quick

---

#### T84: Set a pending full-gate status on the PR head at accept

**What**: Grow the ack job into the **accept** job (rename): a first step resolves the PR head SHA
**once** via the pulls API into a job output (`head_sha`); a second step POSTs commit status
context **`full-gate`**, state `pending`, on that SHA with `target_url` = this run's URL; the ack
comment step moves LAST, so an ack-comment failure can never skip the SHA capture or the pending
status (REL-06 AC3's independence, accept side; the spec's accept-API-failure edge case is the
default step-skip behavior: no SHA output → downstream writes nothing).
**Where**: `.github/workflows/run-ci-comment.yml` (the T83-fixed job: rename, `outputs:`, two new
steps, `statuses: write` added).
**Depends on**: T83
**Reuses**: the guard triple verbatim; `gh api` invocation style from the existing ack step
**Requirement**: REL-06 (AC2; AC5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Exactly one step resolves `.head.sha` from `repos/{repo}/pulls/{n}` and exposes job output
      `head_sha`; no other step re-resolves it (single-resolve invariant, AC2)
- [ ] A step POSTs `statuses/<captured sha>` with context `full-gate`, state `pending`, and
      `target_url` pointing at this run
- [ ] Step order within the job: resolve SHA → set pending → post ack comment
- [ ] Accept job `permissions:` is exactly `pull-requests: write` + `statuses: write`; the job has
      no checkout step and runs no PR code (AC5)
- [ ] Guard triple intact on the job; Quick gate passes (parse + `ci.yml` diff clean)

**Tests**: static validation — **Gate**: Quick

---

#### T85: Report the gate result as the final full-gate status

**What**: A new **report** job — `needs: [accept, gate]`, `if:` combining `always()`, the full
guard triple (AC5: the triple stays on EVERY job), and a non-empty `needs.accept.outputs.head_sha`
(covers accept-API-failure → no statuses, and ack-failure-after-capture → still reports) — that
writes the SAME context `full-gate` on the SAME captured SHA: `success` only when
`needs.gate.result == 'success'`, `failure` only when `needs.gate.result == 'failure'` (a
conflicted-PR merge-ref checkout failure lands here as gate failure, no special-casing). Explicit
mapping means `cancelled`/`skipped` results write NOTHING — AC4's no-final-status rule holds
deterministically regardless of how GitHub schedules `always()` jobs on cancellation; a
superseding `/run ci` re-sets `pending` via its own accept job.
**Where**: `.github/workflows/run-ci-comment.yml` (new final job).
**Depends on**: T84 (threads its `head_sha` output)
**Reuses**: the status-POST invocation shape from T84's pending step
**Requirement**: REL-06 (AC3, AC4; AC5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Report job declares `needs: [accept, gate]` and its `if:` contains `always()`, the guard
      triple, and the non-empty `head_sha` check
- [ ] Status mapping: `success`/`failure` written ONLY for those two `needs.gate.result` values —
      no write branch exists for `cancelled` or `skipped` (grep-assert the absence)
- [ ] Report job `permissions:` is exactly `statuses: write`; no checkout; no PR code (AC5)
- [ ] The gate job and `ci.yml` are untouched (grep + `git diff --exit-code`)
- [ ] Quick gate passes: parse + full-file assertion set green

**Tests**: static validation — **Gate**: Quick

---

#### T86: Document the full-gate ruleset rollout in the runbook

**What**: Append a dated subsection to `docs/release-checklist.md`'s "Publishing & release
automation" section with (a) the exact ruleset clicks — Settings → Rules → Rulesets → New branch
ruleset targeting `main`: require status checks to pass, add **`full-gate`**, strict "up to date"
**OFF**, bypass list = **GitHub Actions app** + **Repository admin**; (b) the four ordered rollout
steps from the spec (merge first — the old workflow governs this PR's own `/run ci`, its 403 is
expected; live-verify ack + pending + final status on the NEXT PR; only then create the ruleset,
the context now being selectable; the next release proves the bypass); (c) the fallback if the
GitHub Actions app is absent from the bypass picker (flagged uncertain in the spec): keep
Repository-admin bypass and switch `release.yml`'s push to an owner fine-grained PAT (new secret) —
applied only if needed; (d) a note that the repo-level **Workflow permissions** toggle is kept at
the restrictive default ("Read repository contents and packages permissions") — verified
2026-07-27 (user question): every workflow that needs write scopes declares them explicitly
(`release.yml` `contents: write`; the accept/report jobs' job-level writes), `ci.yml`/`canary.yml`
declare none and need only reads, and the permissive setting never affected the 403 anyway
(explicit `permissions:` replaces the repo default entirely, per the spec's root cause). Update
`CONTRIBUTING.md`'s CI paragraph: the gate result now lands as a `full-gate` commit status on the
PR head and, once the ruleset is live, every PR needs a passing `/run ci` on its latest commit to
merge.
**Where**: `docs/release-checklist.md` (new subsection in the amendment section, after "If a
release run fails"); `CONTRIBUTING.md:63-72` (CI paragraph).
**Depends on**: T85 (documents landed behavior, not intentions — T81 precedent)
**Reuses**: the runbook's existing amendment-section tone; CONTRIBUTING's existing `/run ci`
paragraph
**Requirement**: REL-06 (AC6 + the spec's rollout steps 1–4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Runbook subsection present: ruleset clicks with `full-gate`, BOTH bypass entries, strict-OFF,
      and the four ordered rollout steps (each grep-asserted)
- [ ] Runbook documents the PAT fallback with its trigger condition ("only if the Actions app is
      missing from the bypass picker")
- [ ] Runbook notes the restrictive Workflow-permissions toggle and why it is sufficient
- [ ] CONTRIBUTING states the status-based result + the required-check merge consequence
- [ ] No other runbook sections touched; Quick gate passes (docs greps + `ci.yml` diff clean)

**Tests**: content presence — **Gate**: Quick

---

#### T87: Fix the stale daily-canary wording

**What**: Sweep the two stale "daily" cadence claims left behind by AD-019's weekly-cadence
amendment (user request, 2026-07-27): `canary.yml`'s step comment still reads "The daily schedule
is deliberate and stays" — contradicting the file's own header (line 8 correctly records the
weekly supersession) and the `0 20 * * 5` cron — and CONTRIBUTING's CI paragraph still says "A
daily canary". Comment/prose only; the `schedule:` cron and workflow behavior are untouched.
**Where**: `.github/workflows/canary.yml:20` (comment only); `CONTRIBUTING.md:70`.
**Depends on**: T86 (edits the same CONTRIBUTING paragraph — sequenced so the edits compose
cleanly)
**Reuses**: `canary.yml:8`'s correct supersession wording as the reference phrasing
**Requirement**: AD-019 amendment (weekly canary) — documentation-drift fix; no REL-06 AC

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No stale "daily" cadence claim remains in `canary.yml` comments or `CONTRIBUTING.md` (grep;
      `canary.yml:8`'s historical "superseding the original daily cadence" note stays — it is
      correct)
- [ ] `canary.yml`'s `schedule:` cron byte-identical (`git diff` shows a comment-only change)
- [ ] Quick gate passes: `canary.yml` parses + `ci.yml` diff clean

**Tests**: static validation + content presence — **Gate**: Quick

---

#### T88: Record AD-021 and close out the amendment

**What**: Record the DF-3 decision as **AD-021** in `.specs/STATE.md` Decisions (root cause pair —
target-resource permission check + default-branch attachment of `issue_comment` runs; statuses over
check runs; ruleset + bypass list per user decisions; restrictive repo Workflow-permissions toggle
confirmed sufficient), update Handoff (execution record, commits, live-verification steps 2–4
pending post-merge), and flip the spec's REL-06 traceability row from "Pending (tasks T83+,
phase 20)" to implemented-pending-live-verification.
**Where**: `.specs/STATE.md`; `.specs/features/android-xml-preview/spec.md` (traceability row
only).
**Depends on**: T87
**Reuses**: AD-019/AD-020 entry format; the DF-2 close-out pattern (T82)
**Requirement**: bookkeeping for REL-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] AD-021 in Decisions (decision/reason/trade-off/scope/date/status); Handoff updated with the
      T83–T87 commits and the pending live steps
- [ ] Spec traceability row updated — AC text untouched
- [ ] Build gate green: all four workflow files parse, full T83–T87 assertion set + docs greps
      pass, `ci.yml` diff clean, `cd extension && npm test` green (no-regression sanity)

**Tests**: none — **Gate**: Build

### Phase Execution Map (DF-3)

```
Phase 20:  T83 ──→ T84 ──→ T85 ──→ T86 ──→ T87 ──→ T88
```

Strictly sequential, 6 tasks → **single batch, inline** (no sub-agent offer). One atomic verb-first
commit per task. After T88's commit, the always-on **Verifier** runs (author ≠ verifier):
spec-anchored outcome check + discrimination sensor (structural layer only — no sensor-testable
runtime layer, REL precedent) → appended to `validation.md` as a dated "CI Comment Pipeline Fix
Verification" section. The Verifier also checks the live ACs are recorded as **pending post-merge
rollout**, never silently marked verified.

### Task Granularity Check (DF-3)

| Task | Scope | Status |
| ---- | ----- | ------ |
| T83: Ack permission fix | 1 permission block in 1 file | ✅ Granular |
| T84: Accept-time pending status | 1 job reshaped (2 steps + outputs) in the same file | ✅ Granular (cohesive — one accept-time behavior) |
| T85: Report job | 1 new job | ✅ Granular |
| T86: Runbook + CONTRIBUTING docs | 1 doc subsection + 1 paragraph | ✅ Granular (one documentation deliverable, AC6) |
| T87: Daily-canary wording sweep | 2 comment/prose lines | ✅ Granular (one drift-correction deliverable) |
| T88: Bookkeeping close-out | no code | ✅ Granular |

### Diagram-Definition Cross-Check (DF-3)

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T83 | None | start of chain | ✅ Match |
| T84 | T83 | T83 → T84 | ✅ Match |
| T85 | T84 | T84 → T85 | ✅ Match |
| T86 | T85 | T85 → T86 | ✅ Match |
| T87 | T86 | T86 → T87 | ✅ Match |
| T88 | T87 | T87 → T88 | ✅ Match |

### Test Co-location Validation (DF-3)

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T83 | Workflow YAML | static validation | static validation | ✅ OK |
| T84 | Workflow YAML | static validation | static validation | ✅ OK |
| T85 | Workflow YAML | static validation | static validation | ✅ OK |
| T86 | Docs | content presence | content presence | ✅ OK |
| T87 | Workflow YAML comment + docs | static validation + content presence | static + content presence | ✅ OK |
| T88 | none (bookkeeping) | none — Build gate only | none | ✅ OK |

## Layout Root Params Fix Tasks (Amendment — 2026-07-28)

> Defect fix DF-4: every layout preview stretches its root to the full device canvas because the
> engine inflates with a null parent, so the root's `layout_width`/`layout_height`/margins/gravity
> are never turned into LayoutParams and Paparazzi defaults them to MATCH_PARENT×MATCH_PARENT —
> see the "Defect Amendment (2026-07-28): DF-4" section in `spec.md`, requirement **LAY-08**.
> Discovery is recorded as **AD-022** at close-out (T94). The **Execution Protocol at the top of
> this file applies unchanged**. Task numbering continues the feature's sequence: **T89–T94**,
> **phase 21**. Ships as **patch release 1.0.2** (REL-04 pipeline, bump `patch`; 1.0.1 already
> shipped). Verifier output is appended to `validation.md` as a dated section — prior records are
> never rewritten.

**Spec**: the "Defect Amendment (2026-07-28): DF-4" section in `spec.md` (LAY-08)
**Context**: none needed — no gray areas: the fix shape is forced by the bytecode-verified root
cause (Studio's own content-frame inflation); the five assumptions are logged in the spec
amendment (user-confirmed 2026-07-28 at spec approval, changelog version set to 1.0.2)
**Status**: Approved (user, 2026-07-28) — **T89–T94 EXECUTE COMPLETE (2026-07-29)**, single inline
batch, one atomic verb-first commit per task (spec-doc corrections kept in separate commits from
source/test, per user instruction this session). Next: the always-on Verifier.

### Test Coverage Matrix (DF-4)

> Inherited from the feature matrix — host-side layers this time. One tightening derived from this
> defect's escape analysis: **pixel-level assertions (alpha/bounds/position) are REQUIRED** for the
> new tests — corpus goldens are generated by this same engine, so a systematic geometry bias
> self-reproduces in the references (42/42 stayed green while every non-`match_parent` root
> rendered wrong); only absolute assertions (transparent below wrapped bounds, painted inside
> insets) can discriminate. Baselines per the last verified record: engineTest 44+, corpus 42/42,
> extension 206 unit / 25 integration — the executor re-baselines exact counts before T89; counts
> only grow.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `EngineAdapter` inflation seam + `LayoutRenderer` live path | engineTest (real Bridge, pixel assertions) | 1:1 to LAY-08 AC1–AC3, AC5–AC7 + the data-binding-root and tools:-override edge cases (oversize-root and RTL-margin edges are framework-native pass-throughs — no Inflate code path, N/A with this note) | `host/src/engineTest/kotlin/render/RootLayoutParams*.kt` | `cd host && ./gradlew engineTest` |
| Corpus goldens (all fixture renders) | golden diff | every changed golden reviewed + justified by root-param honoring alone; a zero-change outcome requires a verified reason (fixture-XML check, not assumption) | `fixtures/*/golden/*.png` via `corpus/run.ts` | `npm run corpus` (repo root) |
| Host pure-JVM units | existing suite green (no new pure-unit logic) | count never shrinks | `host/src/test/**` | `cd host && ./gradlew build test` |
| Extension (untouched) | no-regression sanity | 206 unit / 25 integration stay green | `extension/src/**/*.test.ts` | `cd extension && npm test` |

### Gate Check Commands (DF-4)

**Quick** = `cd host && ./gradlew build test` · **Engine** = `cd host && ./gradlew engineTest`
(one-time `./gradlew fetchEngine` prerequisite on a fresh cache) · **Full** = Engine + `npm run
corpus` (repo root) + `cd extension && npm test` (sanity). Extension code is untouched — its suite
is a no-regression check only.

### Execution Plan (DF-4)

**Phase 21: Layout root params fix**

```
T89 → T90 → T91 → T92 → T93 → T94
```

6 tasks → single batch, executed inline (no sub-agent offer). Strictly sequential: T90/T91 pin
behaviors around T89's fix, T92 regenerates what T89–T91 changed, T93 documents landed behavior
(T81/T86 precedent), T94 closes out.

### Task Breakdown (DF-4)

#### T89: Generate the previewed root's LayoutParams at inflation

**What**: `inflateOrNull` inflates against a throwaway `FrameLayout(sdk.context)` parent with
`attachToRoot=false` — `inflate(layoutId, parent, false)` generates `FrameLayout.LayoutParams`
from the root element's own attributes and sets them on the returned view (Studio's
content-frame equivalent; Paparazzi's single-arg `addView` preserves pre-set params,
1.3.5-source-verified). Plus the regression engineTests for AC1–AC3 over new framework-gallery
fixtures.
**Where**: `host/src/main/kotlin/engine/EngineAdapter.kt:286-290` (`inflate`/`inflateOrNull` doc +
body); new `host/src/engineTest/kotlin/render/RootLayoutParamsTest.kt`; new fixtures
`fixtures/galleries/framework/res/layout/rootparams_*.xml` (corpus manifest is an explicit list —
new gallery files add NO corpus cases, verified).
**Depends on**: None
**Reuses**: `LayoutRendererTest`'s `RenderRouting` + framework-gallery setup shape
(`LayoutRendererTest.kt:40-60`); `EngineTestSupport` fixture helpers; the AC7-style pixel-probe
approach (read PNG via `ImageIO`, assert ARGB/alpha at computed coordinates).
**Requirement**: LAY-08 (AC1, AC2, AC3 + the AC4 canvas-dimensions clause)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `rootparams_wrap.xml` (root `match_parent`×`wrap_content`, opaque background, one fixed
      ~100dp child): image stays device-config-sized; top rows painted; pixels well below the
      wrapped bounds (e.g. vertical center of the canvas) show the theme background, not alpha 0
      (AC4 corrected mid-execution — see spec.md's amended assumption row)
- [x] `rootparams_margins.xml` (adds `layout_marginHorizontal="16dp"` + `layout_marginTop="16dp"`):
      theme background inside the margin band (edge+ a few px), painted just past the
      density-scaled inset (16dp at the request density)
- [x] `rootparams_match.xml` (root `match_parent`×`match_parent`, background): painted at all four
      corners — the pre-fix full-bleed case must NOT change (AC1 regression guard)
- [x] `rootparams_gravity.xml` (fixed ~100dp square root, `layout_gravity="bottom|end"`,
      background): painted in the bottom-right corner region, theme background top-left; the
      no-gravity wrap fixture anchors top|start (asserted in the wrap test)
- [x] Any pre-existing engineTest failure caused by the behavior change is reviewed: none — all 47
      baseline engineTests stayed green untouched; 4 new tests added (51 total)
- [x] Gates green: `cd host && ./gradlew build test` and `cd host && ./gradlew engineTest`

**Tests**: engineTest (pixel assertions) — **Gate**: quick + engine
**Status**: [x] complete (commit `a06cbfe`; AC4 spec correction `f1efabf`)

---

#### T90: Pin the degenerate and pass-through inflation shapes

**What**: engineTests (expected: NO production code — AC5's behavior is engine-native once T89
lands, bytecode-verified `BridgeTypedArray.getLayoutDimension` → warning + 0 px) for: AC5 missing
root dimension; AC6 `<merge>` full-bleed; the data-binding-root and tools:-override edge cases;
plus suite-green evidence that drawable paths are untouched. If reality diverges from the AC5
expectation (e.g. an inflation throw), the fix lands inside T89's param-generation seam and MUST
preserve AC5's outcome (status `ok`, no crash).
**Where**: `host/src/engineTest/kotlin/render/RootLayoutParamsTest.kt` (extend); new fixtures
`rootparams_missing_height.xml` (width only), `rootparams_missing_width.xml` (height only),
`rootparams_merge.xml` (`<merge>` root, match_parent child with background),
`rootparams_binding.xml` (`<layout>` data-binding root, wrap_content inner root),
`rootparams_tools_height.xml` (root `wrap_content` + `tools:layout_height="300dp"`).
**Depends on**: T89
**Reuses**: Structural's merge wrapper (explicit `match_parent`, `Structural.kt:43`);
ToolsAttributes/DataBinding preprocessing (already runs before inflation — these tests prove the
combination, no new preprocessing); existing drawable engineTest suite as the AC6 no-change probe.
**Requirement**: LAY-08 (AC5, AC6 + data-binding and tools: edge cases)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Missing-height fixture: render completes status `ok` (no error, no host crash) and a
      background-bearing root paints NOTHING (shows the theme background everywhere, per the AC4
      correction — the 0-px axis outcome, which also discriminates against the pre-fix full-bleed);
      missing-width fixture symmetric
- [x] Merge fixture: painted at all four corners (full-bleed preserved, P1-A AC4 unchanged)
- [x] Data-binding fixture: unwrapped inner root's `wrap_content` honored (theme background below
      wrapped bounds)
- [x] tools:-override fixture: `tools:layout_height="150dp"` governs — painted band is the
      density-scaled override, not the bare wrap_content height. Required one production fix:
      `ToolsAttributes.CORE_ATTRS` did not include `layout_height` (was silently dropped, not
      promoted) — added it
- [x] Drawable/nine-patch engineTests all green with NO assertion changes (AC6
      behavior-identical evidence — confirmed via the full `engineTest` run, 56 testcases, 0
      failures)
- [x] Gates green: `cd host && ./gradlew build test` and `cd host && ./gradlew engineTest`

**Tests**: engineTest (pixel assertions) — **Gate**: quick + engine
**Status**: [x] complete (commit `578980d`)

---

#### T91: Prove the reported ConstraintLayout shapes end-to-end

**What**: the two AC7 fixtures modeled on the user's report, rendered through the full routing
path with the bundled androidx closure (constraintlayout 2.2.1 is in the AAR set,
`EngineArtifacts.kt:83`), with pixel assertions that reproduce the defect signature and prove the
fix: wrapped height + margin insets (shape a); bottom-constrained child sitting directly below its
sibling inside the wrapped bounds instead of floating at device mid-height (shape b).
**Where**: new `host/src/engineTest/kotlin/render/RootParamsConstraintTest.kt` (library-resource
setup shape from `LibraryResourcesTest`/`MaterialGalleryTest`: `libResDirs()`/`rPackages()`); two
fixtures in the androidx-enabled gallery used by those tests, e.g.
`rootparams_card.xml` (match_parent×wrap_content ConstraintLayout, `layout_marginHorizontal`/
`Top` 16dp, background, padding 12dp, a 40dp inner view + text rows) and
`rootparams_bottomconstraint.xml` (match_parent×wrap_content ConstraintLayout, background, child A
40dp top|start-constrained, color-coded child B `top_toBottomOf` A + `bottom_toBottomOf` parent).
**Depends on**: T90 (chain order; logically only needs T89)
**Reuses**: the color-coded-band pixel-probe technique from T89's tests; existing androidx gallery
fixture conventions.
**Requirement**: LAY-08 (AC7)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Shape (a): device-sized image; theme background inside the 16dp margin band; painted past
      the inset; theme background at the canvas vertical center (wrapped card ends far above it)
- [x] Shape (b): child B's color band starts directly below child A's band (within a small
      tolerance) and lies entirely in the top ~25% of the canvas — an explicit NOT-centered
      assertion (pre-fix it centered at ~50% device height)
- [x] Gates green: `cd host && ./gradlew build test` and `cd host && ./gradlew engineTest`

**Tests**: engineTest (pixel assertions) — **Gate**: quick + engine
**Status**: [x] complete (commit `faee4af`)

---

#### T92: Regenerate and review the affected corpus goldens

**What**: run the corpus against the fixed engine, regenerate the changed goldens, and review
EVERY diff — each accepted change must be explainable solely by root-param honoring
(wrap/margins/gravity now visible); anything else is a regression and blocks. Zero changed goldens
is a valid outcome ONLY with a verified reason recorded (checked against the fixture XMLs — e.g.
"every corpus root is effectively match_parent" — never assumed).
**Where**: `fixtures/*/golden/*.png` (repo-root-relative per `corpus/manifest.json`); regen via
`cd corpus && npm run render:update` (or `tsx run.ts --update-goldens`); `corpus/report.html` for
side-by-side diff review.
**Depends on**: T91 (and transitively T89/T90 — goldens must reflect the complete behavior)
**Reuses**: the corpus runner's own update mode and HTML report — no new tooling.
**Requirement**: LAY-08 (the spec amendment's Verification note; AC1/AC4 at corpus scale)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `npm run corpus` green after regeneration (42/42, count unchanged)
- [x] Commit body lists every changed golden with a one-line justification tied to a LAY-08 AC —
      or the verified zero-change reason: 40/42 configs byte-identical (every layout-kind fixture
      root verified `match_parent`×`match_parent` directly against the XML; drawable-kind configs
      never traverse the affected path); only `material/gallery` (default, night) changed — a
      nested MaterialToolbar title becoming visible, isolated to the T89 fix via a throwaway
      worktree at the pre-fix commit, accepted as a correctness improvement (user decision, AD-022)
- [x] Gates green: full (`cd host && ./gradlew engineTest` + `npm run corpus`)

**Tests**: golden corpus — **Gate**: full
**Status**: [x] complete (commit `4efd94a`)

---

#### T93: Add the 1.0.2 changelog entry

**What**: a `## 1.0.2` section at the top of the extension changelog documenting DF-4 in
user-facing language: layout previews now respect the root element's own
`layout_width`/`layout_height`, margins, and `layout_gravity` — a `wrap_content` card renders at
its true size inside the device frame exactly as Android Studio shows it, instead of stretching
over the whole screen; children constrained to the parent's bottom no longer float at mid-screen.
No `package.json` version bump (the REL-04 pipeline bumps at release — T81 precedent).
**Where**: `extension/CHANGELOG.md` (new section above `## 1.0.1`).
**Depends on**: T92 (documents landed behavior, not intentions — T81/T86 precedent)
**Reuses**: the 1.0.1 section's tone/format; REL-01 AC2 already gates that `CHANGELOG.md` is
packaged.
**Requirement**: REL-01 (AC2 pattern — per-release section) in service of LAY-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `## 1.0.2` section present above `## 1.0.1`, covering the root-params fix — no other
      sections touched
- [x] Extension no-regression sanity green: `cd extension && npm test` (206/206)

**Tests**: none (docs — no matrix layer for markdown content) — **Gate**: quick (extension sanity)
**Status**: [x] complete (commit `3a54203`)

---

#### T94: Record AD-022 and close out the amendment

**What**: bookkeeping — record **AD-022** in `.specs/STATE.md` Decisions (the inflation-seam
decision, the bytecode-verified reasoning chain, the goldens trade-off, the self-referential-golden
escape analysis), update the Handoff (commits, gate results, ships-as-1.0.2-pending-release),
flip the spec's LAY-08 traceability row to implemented-pending-Verifier, and mark this section's
task statuses. No interactive UAT is mandated for this defect class — it is fully
pixel-assertable in engineTest (contrast AD-018's gesture class and DF-2's harness-bypassed race);
a RECOMMENDED post-release smoke is the user re-opening the two reported layouts against Android
Studio.
**Where**: `.specs/STATE.md`; `.specs/features/android-xml-preview/spec.md` (traceability row
only); this file (statuses).
**Depends on**: T93
**Reuses**: AD-020/AD-021 entry format; the T82/T88 close-out pattern.
**Requirement**: LAY-08 (bookkeeping)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] AD-022 recorded; Handoff updated with commit hashes + gate evidence; spec traceability
      flipped; task statuses marked
- [x] Full gate green at close: `cd host && ./gradlew build test && ./gradlew engineTest`,
      `npm run corpus`, `cd extension && npm test`

**Tests**: none (bookkeeping) — **Gate**: full
**Status**: [x] complete (this commit)

### Phase Execution Map (DF-4)

```
Phase 21:  T89 ──→ T90 ──→ T91 ──→ T92 ──→ T93 ──→ T94
```

Execution is strictly sequential — 6 tasks → **single batch, inline** (no sub-agent offer), one
atomic verb-first commit per task on gate pass. After T94's commit, the always-on **Verifier** runs
(author ≠ verifier): spec-anchored outcome check + discrimination sensor (candidate mutations:
revert `inflateOrNull` to the null parent — every new pixel test must go red; drop the margin
handling by generating params from a bare `ViewGroup` — the margin tests must kill it) → results
**appended to `validation.md`** as a dated "Layout Root Params Fix Verification" section. If
verification surfaces the self-referential-golden blindness as reusable guidance, the Verifier
distills it via `scripts/lessons.py`.

### Task Granularity Check (DF-4)

| Task | Scope | Status |
| ---- | ----- | ------ |
| T89: Root LayoutParams at inflation | 1 function change in 1 file (+ its derived tests/fixtures) | ✅ Granular |
| T90: Degenerate + pass-through shapes | tests/fixtures only, one behavior family | ✅ Granular (cohesive — no production code expected) |
| T91: Reported shapes end-to-end | 2 fixtures + 1 test class, one AC | ✅ Granular |
| T92: Corpus golden regen + review | 1 deliverable (regenerated, justified goldens) | ✅ Granular |
| T93: 1.0.2 changelog entry | 1 doc section | ✅ Granular |
| T94: Bookkeeping close-out | no code | ✅ Granular |

### Diagram-Definition Cross-Check (DF-4)

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T89 | None | start of chain | ✅ Match |
| T90 | T89 | T89 → T90 | ✅ Match |
| T91 | T90 (chain order; logically T89) | T90 → T91 | ✅ Match |
| T92 | T91 (transitively T89/T90) | T91 → T92 | ✅ Match |
| T93 | T92 | T92 → T93 | ✅ Match |
| T94 | T93 | T93 → T94 | ✅ Match |

### Test Co-location Validation (DF-4)

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T89 | EngineAdapter inflation seam | engineTest (pixel) | engineTest (pixel) | ✅ OK |
| T90 | inflation-seam behaviors (no prod code expected) | engineTest (pixel) | engineTest (pixel) | ✅ OK |
| T91 | LayoutRenderer live path (androidx) | engineTest (pixel) | engineTest (pixel) | ✅ OK |
| T92 | corpus goldens | golden diff | golden corpus | ✅ OK |
| T93 | none (markdown content) | none — sanity gate only | none | ✅ OK |
| T94 | none (bookkeeping) | none — full gate at close | none | ✅ OK |

---

## BOM Ingestion Fix Tasks (Amendment — 2026-07-29)

> Defect fix DF-5: a previewed XML file saved with a UTF-8 BOM fails to render — the host's disk
> read keeps the BOM (U+FEFF), and kxml2's Reader-path well-formedness parse rejects the shifted
> `<?xml` declaration with `PI must not start with xml … @1:5` (a valid-XML file, wrongly
> rejected; the misleading error also masks any real syntax error in the file) — see the "Defect
> Amendment (2026-07-29): DF-5" section in `spec.md`, requirement **HOST-05**. Discovery is
> recorded as **AD-023** at close-out (T98). The **Execution Protocol at the top of this file
> applies unchanged**. Task numbering continues the feature's sequence: **T95–T98**, **phase 22**.
> Ships as **patch release 1.0.3** (REL-04 pipeline, bump `patch`; 1.0.2 already shipped).
> Verifier output is appended to `validation.md` as a dated section — prior records are never
> rewritten.

**Spec**: the "Defect Amendment (2026-07-29): DF-5" section in `spec.md` (HOST-05)
**Context**: none needed — no gray areas: the fix shape is forced by the jar-verified root cause
(the BOM must be gone before the first parser sees the string); the open choices are logged as
assumptions in the spec amendment (user-confirmed 2026-07-29 at spec approval)
**Status**: **Approved (user, 2026-07-29)** — ready to execute on branch `fix/bom-xml-files` (off
`main`; amendment docs committed as `66860d1`). Execution starts at T95 in a fresh session — one
atomic verb-first commit per task on gate pass, always-on Verifier after T98. The 1.0.3 changelog
entry is T97's deliverable (user-confirmed at approval — no additional task needed).

### Test Coverage Matrix (DF-5)

> Inherited from the feature matrix. One tightening derived from this defect's escape analysis:
> every BOM fixture must carry an **in-test byte-integrity guard** (assert its first 3 bytes are
> `EF BB BF`) — the whole gate suite stayed green precisely because no ingested fixture ever had a
> BOM, so a future editor/formatter silently stripping one would resurrect that blindness.
> Baselines per the DF-4 Verifier record (2026-07-29): engineTest 58 testcases / 23 classes, corpus
> 42/42, extension 206 unit / 25 integration — the executor re-baselines exact counts before T95;
> counts only grow.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `Bom` helper (pure string logic) | host unit | strips exactly one leading U+FEFF; identity when absent; interior U+FEFF untouched; BOM-only → empty | `host/src/test/kotlin/preprocess/BomTest.kt` | `cd host && ./gradlew build test` |
| Executor ingestion live path (layout, drawable, include, warning parity, error accuracy) | engineTest (real Bridge) | 1:1 to HOST-05 AC1–AC3, AC5 + the BOM-only and error-accuracy edges; every BOM fixture byte-guarded | `host/src/engineTest/kotlin/render/BomIngestionTest.kt` | `cd host && ./gradlew engineTest` |
| Corpus goldens | golden diff | ZERO changed goldens (42/42 byte-identical) — HOST-05 AC4's identity outcome, asserted at every gate, never assumed | `fixtures/*/golden/*.png` via `corpus/run.ts` | `npm run corpus` (repo root) |
| Extension (untouched) | no-regression sanity | 206 unit / 25 integration stay green | `extension/src/**/*.test.ts` | `cd extension && npm test` |

### Gate Check Commands (DF-5)

**Quick** = `cd host && ./gradlew build test` · **Engine** = `cd host && ./gradlew engineTest`
(one-time `./gradlew fetchEngine` prerequisite on a fresh cache) · **Full** = Engine + `npm run
corpus` (repo root) + `cd extension && npm test` (sanity). Extension code is untouched — its suite
is a no-regression check only.

### Execution Plan (DF-5)

**Phase 22: BOM ingestion fix**

```
T95 → T96 → T97 → T98
```

4 tasks → single batch, executed inline (no sub-agent offer). Strictly sequential: T96 pins
behaviors around T95's fix, T97 documents landed behavior (T81/T86/T93 precedent), T98 closes out.

### Task Breakdown (DF-5)

#### T95: Strip the leading BOM at render ingestion

**What**: a named shared helper — new `host/src/main/kotlin/preprocess/Bom.kt`,
`object Bom { fun strip(content: String): String }` = `content.removePrefix("\uFEFF")`, KDoc'd
with the defect chain — applied at BOTH executor ingestion lines (`LayoutRenderer.kt:58`,
`DrawableRenderer.kt:78`, wrapping `request.inlineContent ?: docFile.readText()`) so validation,
`MaterialAttrCheck`, every preprocessing stage, and the overlay write all see BOM-free text
regardless of origin. Unit tests for the helper semantics; the primary defect-killing engineTest —
a BOM'd twin of a trivial framework layout renders `ok` with a PNG byte-identical to its BOM-less
twin (AC1) — run RED first against the pre-fix code (reproducing the exact reported error), and
the red run recorded in the task commit body.
**Where**: new `preprocess/Bom.kt`; `render/LayoutRenderer.kt:58`; `render/DrawableRenderer.kt:78`;
new `host/src/test/kotlin/preprocess/BomTest.kt`; new
`host/src/engineTest/kotlin/render/BomIngestionTest.kt`; new fixtures
`fixtures/galleries/framework/res/layout/bom_plain.xml` + `bom_twin.xml` (identical content, one
BOM'd — authored byte-level, e.g. `printf '\xef\xbb\xbf' > bom_twin.xml && cat bom_plain.xml >>
bom_twin.xml`; corpus manifest is an explicit list — new gallery files add NO corpus cases,
verified).
**Depends on**: None
**Reuses**: `LayoutRendererTest`'s `RenderRouting` + framework-gallery setup shape;
`EngineTestSupport` fixture helpers; the twin-comparison technique (render both, compare bytes).
**Requirement**: HOST-05 (AC1; AC4 identity via `BomTest`)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `BomTest`: single leading U+FEFF stripped; no-BOM input returned equal; interior U+FEFF
      untouched; a string of `"\uFEFF"` alone → empty string
- [ ] `BomIngestionTest` pre-fix run reproduces the defect verbatim (status `error`, message
      contains `PI must not start with xml`, line 1) — recorded in the commit body; post-fix the
      BOM'd twin renders `ok` with a PNG byte-identical to the BOM-less twin's
- [ ] BOM fixture byte-integrity guard green (first 3 bytes `EF BB BF` asserted in-test)
- [ ] Corpus zero-diff: `npm run corpus` 42/42, no regenerated goldens
- [ ] Gates green: `cd host && ./gradlew build test` and `cd host && ./gradlew engineTest`

**Tests**: host unit + engineTest — **Gate**: quick + engine (+ corpus zero-diff)
**Status**: [ ] pending

---

#### T96: Pin error accuracy, includes, warning parity, and the drawable leg

**What**: engineTests (expected: NO further production code — if a pin fails, the fix stays inside
T95's helper/ingestion seam and MUST preserve every T95 outcome) for: **AC2** — a BOM'd fixture
with a genuine mid-file syntax error (modeled on the report's stray `a` after
`android:layout_width="match_parent"`) surfaces the REAL error at its true 1-based line, never the
`@1:5` PI artifact; **AC3** — a BOM'd `<include>` target renders (engine-side byte-sniff pinned
against the real Bridge) and the include cycle-walk stays unaffected; **AC5** — a BOM'd androidx
layout using an unknown res-auto attribute emits the same P1-B AC4 warning as its BOM-less twin
(kills a Preprocessor-internal strip placement); **AC1 drawable leg** — a BOM'd `<shape>` drawable
renders `ok` byte-identical to its twin; **BOM-only edge** — accurate empty/invalid-document
error, not the PI artifact. **If the AC3 engine expectation proves false against the pinned Bridge
(a BOM'd include fails at inflation), STOP: user files are never rewritten (design Q3), so the
include fix shape is a spec decision — record the divergence and return to the amendment before
coding.**
**Where**: `host/src/engineTest/kotlin/render/BomIngestionTest.kt` (extend); new fixtures
`bom_error.xml` (BOM + stray attribute character), `bom_include_host.xml` + BOM'd
`bom_included.xml`, `bom_unknown_attr` twin pair (androidx gallery, one unknown `app:` attribute),
`bom_shape.xml` twin pair (drawable gallery), `bom_only.xml` (BOM alone); every BOM fixture
byte-guarded like T95's.
**Depends on**: T95
**Reuses**: `MaterialGalleryTest`/`LibraryResourcesTest` androidx setup (`libResDirs()`/
`rPackages()`) for AC5; the drawable engineTest suite's fixture conventions for the `<shape>` leg;
T95's twin-comparison technique.
**Requirement**: HOST-05 (AC2, AC3, AC5, drawable AC1 leg, edge cases)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Error-accuracy test asserts the true syntax error's line (the stray character's line, not 1)
      and that the message does NOT contain `PI must not start with xml`
- [ ] BOM'd include renders with the included content present (pixel or dependency assertion);
      cycle-detection suite untouched
- [ ] Warning parity: the unknown-res-auto warning is present and identical for the BOM'd and
      BOM-less twins
- [ ] BOM'd `<shape>` renders `ok`, byte-identical to its BOM-less twin
- [ ] BOM-only file errors with the existing empty/invalid-document message, not the PI artifact
- [ ] Gates green: quick + engine; corpus 42/42 zero-diff

**Tests**: engineTest — **Gate**: quick + engine (+ corpus zero-diff)
**Status**: [ ] pending

---

#### T97: Add the 1.0.3 changelog entry

**What**: a `## 1.0.3` section at the top of the extension changelog documenting DF-5 in
user-facing language: XML files saved with a UTF-8 BOM (common in legacy Windows/Xamarin-authored
projects) now preview correctly instead of failing with `PI must not start with xml`; syntax
errors in such files now point at the real line. No `package.json` version bump (REL-04 bumps at
release — T81/T93 precedent).
**Where**: `extension/CHANGELOG.md` (new section above `## 1.0.2`).
**Depends on**: T96 (documents landed behavior, not intentions — T81/T86/T93 precedent)
**Reuses**: the 1.0.2 section's tone/format; REL-01 AC2 already gates that `CHANGELOG.md` is
packaged.
**Requirement**: REL-01 (AC2 pattern — per-release section) in service of HOST-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `## 1.0.3` section present above `## 1.0.2`, covering the BOM fix — no other sections
      touched
- [ ] Extension no-regression sanity green: `cd extension && npm test`

**Tests**: none (docs — no matrix layer for markdown content) — **Gate**: quick (extension sanity)
**Status**: [ ] pending

---

#### T98: Record AD-023 and close out the amendment

**What**: bookkeeping — record **AD-023** in `.specs/STATE.md` Decisions (the ingestion-strip
decision, the jar-verified kxml2 chain, the zero-BOM-fixture escape analysis and the
byte-integrity-guard tightening), update the Handoff (commits, gate results,
ships-as-1.0.3-pending-release), flip the spec's HOST-05 traceability row, and mark this section's
task statuses. No interactive UAT is mandated — this defect class is fully assertable in
engineTest (contrast AD-018's gesture class); a RECOMMENDED post-release smoke is the user
re-opening the reported layout (after removing its stray `a`).
**Where**: `.specs/STATE.md`; `.specs/features/android-xml-preview/spec.md` (traceability row
only); this file (statuses).
**Depends on**: T97
**Reuses**: AD-021/AD-022 entry format; the T88/T94 close-out pattern.
**Requirement**: HOST-05 (bookkeeping)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] AD-023 recorded; Handoff updated with commit hashes + gate evidence; spec traceability
      flipped; task statuses marked
- [ ] Full gate green at close: `cd host && ./gradlew build test && ./gradlew engineTest`,
      `npm run corpus`, `cd extension && npm test`

**Tests**: none (bookkeeping) — **Gate**: full
**Status**: [ ] pending

### Phase Execution Map (DF-5)

```
Phase 22:  T95 ──→ T96 ──→ T97 ──→ T98
```

Execution is strictly sequential — 4 tasks → **single batch, inline** (no sub-agent offer), one
atomic verb-first commit per task on gate pass. After T98's commit, the always-on **Verifier** runs
(author ≠ verifier): spec-anchored outcome check + discrimination sensor (candidate mutations:
remove the ingestion strip — the AC1/AC2/AC5 tests must go red with the PI artifact; relocate the
strip inside `Preprocessor.preprocess` — the AC5 warning-parity test alone must kill it; defang a
BOM fixture — its byte-integrity guard must fail) → results **appended to `validation.md`** as a
dated "BOM Ingestion Fix Verification" section. If verification surfaces reusable guidance (e.g.
the no-BOM-fixture blindness), the Verifier distills it via `scripts/lessons.py`.

### Task Granularity Check (DF-5)

| Task | Scope | Status |
| ---- | ----- | ------ |
| T95: Ingestion BOM strip | 1 new ~5-line helper + 2 one-line call sites (+ derived tests/fixtures) | ✅ Granular |
| T96: Error/include/warning/drawable pins | tests/fixtures only, one behavior family | ✅ Granular (cohesive — no production code expected) |
| T97: 1.0.3 changelog entry | 1 doc section | ✅ Granular |
| T98: Bookkeeping close-out | no code | ✅ Granular |

### Diagram-Definition Cross-Check (DF-5)

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T95 | None | start of chain | ✅ Match |
| T96 | T95 | T95 → T96 | ✅ Match |
| T97 | T96 | T96 → T97 | ✅ Match |
| T98 | T97 | T97 → T98 | ✅ Match |

### Test Co-location Validation (DF-5)

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T95 | `Bom` helper + executor ingestion | host unit + engineTest | host unit + engineTest | ✅ OK |
| T96 | ingestion behaviors (no prod code expected) | engineTest | engineTest | ✅ OK |
| T97 | none (markdown content) | none — sanity gate only | none | ✅ OK |
| T98 | none (bookkeeping) | none — full gate at close | none | ✅ OK |
