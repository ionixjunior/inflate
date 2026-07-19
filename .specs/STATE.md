# STATE

## Decisions

### AD-001
- **Decision**: Inflate is build-system-agnostic; native Gradle projects and .NET Android (Xamarin/MAUI) projects are both first-class at launch, driven by the Android XML schema and resource-tree conventions, never by build-system integration.
- **Reason**: User decision (2026-07-19 clarification). The .NET audience has no preview tooling at all; the Gradle audience keeps VS Code viable. Working off the XML schema keeps one engine serving both.
- **Trade-off**: Both resource-tree shapes (`res/` and `Resources/`, `.xml` and `.axml`) must be tested before the first release; no build-system APIs (Gradle tooling API, MSBuild) may be relied on for correctness.
- **Scope**: All features — resource resolution, file discovery, docs, test corpus.
- **Date**: 2026-07-19
- **Status**: active

### AD-002
- **Decision**: The first public release ships the complete v1 scope — all supported layouts, all drawable types, light/dark, device/density configs, both project ecosystems. No public MVP release. Thin slices exist only as internal milestones.
- **Reason**: User decision, explicitly superseding the MVP framing in the original brief: "the first deliverable needs to render all the things."
- **Trade-off**: Longer time-to-first-release; no early market feedback from partial releases.
- **Scope**: Release planning, milestone structure, marketing.
- **Date**: 2026-07-19
- **Status**: active

### AD-003
- **Decision**: A preinstalled JDK is required and auto-detected (JAVA_HOME, PATH, platform-standard install locations, Android Studio JBR, Microsoft OpenJDK, Homebrew/SDKMAN), with a `inflate.javaHome` setting override and a guided setup message when none is found. The extension never downloads or bundles a JVM.
- **Reason**: User decision. Android developers (Gradle and .NET alike) virtually always have a JDK; auto-download adds size, maintenance, and trust costs.
- **Trade-off**: A first-run failure mode exists for users without a JDK (mitigated by the doctor/guided-setup flow).
- **Scope**: Setup, host process launch, diagnostics.
- **Date**: 2026-07-19
- **Status**: active

### AD-004
- **Decision**: v1 supports macOS only (arm64 + x64). Windows and Linux are fast-follow releases; nothing in the architecture may assume macOS (layoutlib natives for win/linux exist on Google Maven and the host protocol is OS-neutral).
- **Reason**: User decision — focus the first release. Research confirmed Windows/Linux natives are published, so the follow-up is low-risk.
- **Trade-off**: Excludes the large Windows .NET audience at launch.
- **Scope**: Packaging, CI matrix, artifact fetching.
- **Date**: 2026-07-19
- **Status**: active

### AD-005
- **Decision**: Unified rendering engine for v1 — every preview (layouts AND all drawable types) renders through the layoutlib-based JVM host. The renderer sits behind a per-document-type routing seam so a lighter web-side path (e.g., vector→SVG) can be added later without protocol changes. The two-path architecture is explicitly deferred, not rejected.
- **Reason**: The first release must be complete and faithful (AD-002), so the JVM host ships in v1 regardless; research showed no existing web renderers for shape/selector/layer-list (they'd be built from scratch) and known SVG-conversion gaps (sweep gradients, trimPath). One engine = one fidelity truth, least code, fastest path to "complete".
- **Trade-off**: Drawable previews require a running JVM host (cold-start latency on first preview; no JDK-free mode in v1).
- **Scope**: Rendering pipeline, host protocol, webview.
- **Date**: 2026-07-19
- **Status**: active

### AD-006
- **Decision**: Engine artifacts (layoutlib runtime/resources from `com.android.tools.layoutlib:*` on Google Maven, plus pinned androidx/Material AARs) are downloaded on first use with pinned versions and SHA-256 verification into the extension's global cache; the host JAR itself ships inside the VSIX. No Android SDK and no Android Studio are ever required.
- **Reason**: Verified 2026-07-19: Google publishes layoutlib standalone (Apache-2.0) with per-OS native classifiers; Paparazzi ≥1.3.5 needs no ANDROID_HOME. Downloading from Google's own repository avoids redistribution and keeps the VSIX small.
- **Trade-off**: First layout preview needs a one-time download (~150–250 MB, exact size measured in Design); offline-first-run is not supported (offline after cache is).
- **Scope**: Setup, packaging, supply-chain security.
- **Date**: 2026-07-19
- **Status**: active

### AD-007
- **Decision**: Custom or unknown view classes render as labeled placeholder boxes (class name, sized by layout params — layoutlib's mock-view behavior). v1 never loads project bytecode; the host protocol reserves a classpath slot for a future opt-in.
- **Reason**: User decision. Safe, predictable, build-independent; matches Android Studio's behavior when a class can't load.
- **Trade-off**: Custom views and unbundled third-party views are not visually faithful in v1.
- **Scope**: Host rendering, security posture.
- **Date**: 2026-07-19
- **Status**: active

### AD-008
- **Decision**: Engine pin for v1 — Paparazzi 1.3.5 (stable line) with JDK 17 as the required minimum. Paparazzi 2.x (JDK 21) is a planned post-v1 migration, not a v1 target.
- **Reason**: User decision ("pin JDK 17 first"). JDK 17 is what the target audience reliably has (Microsoft OpenJDK 17 for .NET Android; AGP-era JDK 17 for Gradle); 2.x alphas would raise the floor to JDK 21.
- **Trade-off**: The 1.3.5-paired layoutlib renders an older Android platform than current Android Studio; 2.x-only fixes (e.g., Windows font fixes) arrive only with the later migration.
- **Scope**: JVM host, JDK detection, artifact pinning, doctor messaging, M0 spike scope.
- **Date**: 2026-07-19
- **Status**: active

### AD-009
- **Decision**: The render host accesses Paparazzi 1.3.5 as a library, compiling its EngineAdapter with `-Xfriend-paths` against the pinned jar to reach Kotlin-`internal` machinery (resource repositories, SessionParamsBuilder, LayoutPullParser, callback/logger). The adapter re-implements `Renderer.prepare()` split into one-time Bridge init + rebuildable app-resource repositories. Every internal symbol touched is inventoried in `host/ENGINE_SURFACE.md`. Pre-agreed fallback: vendor the ~6 core files (Apache-2.0) if friend-paths breaks.
- **Reason**: Verified in 1.3.5 source: `PaparazziSdk` holds process-global companion state building repositories exactly once per JVM — stock API cannot refresh resources, which hot reload (P1-F) requires. Repository build is separable from Bridge init (code order in `Renderer.prepare()`), enabling cheap invalidation.
- **Trade-off**: Depends on an unstable compiler flag + internal APIs; contained by exact pinning, the surface inventory, the vendoring fallback, and the M0 gate.
- **Scope**: Host build, engine upgrades, R1/R2 risk handling.
- **Date**: 2026-07-19
- **Status**: active

### AD-010
- **Decision**: Extension ↔ host protocol is LSP-style header-framed JSON-RPC over stdio (`vscode-jsonrpc` on the TS side, moshi + ~100-line framing on the host). Rendered images travel by file path (host writes PNG to a session output dir consumed via `asWebviewUri`), never base64-in-JSON. stdout carries only protocol frames; all host logging goes to stderr.
- **Reason**: Battle-tested framing on both sides with off-the-shelf client; avoids 33% base64 overhead and MB-scale JSON parse churn; the webview needs a file URI anyway.
- **Trade-off**: Output-dir lifecycle (sweeping, webview localResourceRoots registration) is ours to manage.
- **Scope**: Protocol, HostManager, webview, all future host-backed features.
- **Date**: 2026-07-19
- **Status**: active

### AD-011
- **Decision**: (Refines AD-006 packaging.) The VSIX bundles the host fat-jar containing our code + Paparazzi + all Maven-Central transitives (~25–40 MB). Everything Google-Maven-hosted is downloaded to the versioned cache: layoutlib triple (14.0.11: layoutlib 50.6 MB, runtime-per-arch ~76 MB, resources 33 MB), tools jars (31.4.2), androidx/Material AAR set. Measured per-user one-time download ≈ 165–175 MB. The exact artifact closure is generated at build time into `engine-manifest.json` (URL + SHA-256 + size per artifact) by a Gradle task — never hand-maintained. Cache keyed by manifest hash.
- **Reason**: Keeps NFR-04's "only network traffic is Google Maven" promise while keeping the VSIX reasonably small; measured sizes land inside the spec's 150–250 MB estimate (Q4 resolved).
- **Trade-off**: VSIX carries ~25–40 MB of Maven-Central deps that never change per-user.
- **Scope**: Packaging, ArtifactManager, supply-chain security, Doctor reporting.
- **Date**: 2026-07-19
- **Status**: active

### AD-012
- **Decision**: Repo layout is `extension/` (TypeScript VS Code extension incl. `webview-ui/`), `host/` (Kotlin JVM render host, built with Gradle at development time only), `fixtures/` (golden corpus: gradle-sample, dotnet-sample, galleries), `docs/protocol.md` (protocol contract, DTOs mirrored TS/Kotlin with shared-fixture tests). Gradle/MSBuild remain forbidden at user runtime (AD-001); Gradle is permitted as our own dev-time build tool.
- **Reason**: Two toolchains need clean separation; the protocol contract needs one authoritative home; AD-001's no-build-system rule is about the user's machine, not our CI.
- **Scope**: Repo structure, CI, contributor docs.
- **Date**: 2026-07-19
- **Status**: active

### AD-013
- **Decision**: (Refines AD-007.) Unknown/custom view placeholders are produced by **preprocessor tag substitution** (`preprocess.UnknownViewSubstitutor` → labeled `TextView` box + LogBridge `substitutedClass` warning), NOT by relying on layoutlib's MockView fallback. This is the design's pre-agreed plan B (§D2), promoted to the active strategy during M0.
- **Reason**: M0 (T7) empirically established that Paparazzi's `PaparazziCallback.loadView` rethrows for a genuinely-missing class and layoutlib's `BridgeInflater` only auto-substitutes a MockView when the callback *returns* one (Android Studio's callback does; Paparazzi's does not). So `inflate` returns null and the whole file fails — MockView is NOT free under Paparazzi. Verified against Paparazzi 1.3.5 sources, not assumed.
- **Trade-off**: Unknown-view handling now lives in the Preprocessor rather than the inflater; the substitution must run before inflation and be kept consistent with the class-scan warnings.
- **Scope**: Preprocessor (Phase 5 — T29–T32 should absorb/generalize `UnknownViewSubstitutor`), LayoutRenderer custom-view placeholder path (Phase 6 — T35 AC5), AD-007 posture.
- **Date**: 2026-07-19
- **Status**: active

## Handoff

- **Feature**: android-xml-preview (`.specs/features/android-xml-preview/`)
- **Phase / Task**: Execute — **Phase 1 (M0 Engine Spike) COMPLETE** (T1–T9 done, 2026-07-19).
- **Completed**: Specify; Design (AD-009..012); Tasks (60 tasks / 10 phases). **Phase 1 M0 (T1–T9)** all committed on `main`:
  T1 Create host Gradle project (857a4b8) · T2 friend-paths + ENGINE_SURFACE (cb0b78e) · T3 fetchEngine (0b8e8cd) ·
  T4 EngineAdapter split init + rebuildable repos (ed4e9a5) · T5 hello-render → PNG (63836dc) ·
  T6 extension scaffold + webview (2d084b5) · T7 LogBridge + unknown-view fallback (bd8ec23) ·
  T8 state injection spike (4545fa1) · T9 M0 findings (this commit).
- **M0 checklist outcomes**: items 1,2,3,5,6 = **PASS (primary)**; item 4 (unknown-view MockView) = **FALLBACK-APPLIED**
  (design plan B: `preprocess.UnknownViewSubstitutor` → labeled TextView + LogBridge substitutedClass warning).
  Trigger + decision recorded in `host/ENGINE_SURFACE.md` and `docs/m0-findings.md`. AD-009 friend-paths mechanism
  works (primary, no vendoring needed). Timings: cold start 1956 ms, warm render median 30 ms, repo rebuild ~9 ms;
  measured engine download 159.9 MB (one arch, top-level).
- **Test counts (Phase 1)**: host unit 24 (JUnit 5) · host engineTest 4 (EngineAdapter/HelloRender/MockView/StateInjection) ·
  extension vitest 2 · extension integration 1 (@vscode/test-electron). Gates: host `./gradlew build test engineTest` green; extension `npm run build && npm test && npm run test:integration` green.
- **Environment notes for later phases**: Gradle wrapper 8.10.2 (Kotlin 2.0.21 friend-paths); JDK 17 at
  `/Library/Java/.../microsoft-17.jdk`. `host/.engine-cache/` is gitignored — later engineTest gates require
  `./gradlew fetchEngine` first. engineTest task sets layoutlib runtime/resources props + JPMS `--add-opens` + `forkEvery(1)`.
  `resourcePackageNames` MUST stay empty (no R class; dynamic ids, Q3). Paparazzi 1.3.5 sources cached in scratchpad for reference.
- **M0 gate (orchestrator)**: Architecture VALIDATED. 5/6 M0 items PASS primary; item 4 used the design's named fallback (AD-013, refines AD-007).
- **Phase 2 (T10–T13) + Phase 3 (T14–T19) COMPLETE** (Batch 2, sonnet, 2026-07-19): commits `2551dfc`…`05f2bdc`. Extension 53 vitest + 2 integration; host 51 JUnit + 4 engineTest — all green, tree clean.
- **Known integration debt (must resolve before Phase 10 sign-off; Verifier must check):**
  1. **Real host spawn wiring deferred (T18).** `extension/src/activation.ts::resolveHostCommand()` real path throws; only the `INFLATE_TEST_FAKE_HOST` escape hatch is wired end-to-end. `inflate.clearEngineCache` and the `inflate.doctor` command handler are placeholders (Doctor's `assembleDoctorReport`/`formatDoctorReport` exist + tested from T19 but not wired into the live command). Real JdkLocator+ArtifactManager+host.jar wiring lands with **T39** (classpath assembly, `extension/src/host.ts`) and **T60** (host fat-jar bundled in VSIX); the live `doctor`/`clearEngineCache` handlers should be wired when a real host exists (by T18's intent — target T39/T60). Chaos/perf (T57/T58) and clean-profile smoke (T60) exercise the REAL host path, so it must be real by then. Integration tests (test-electron) legitimately keep using the fake host for extension-side loop logic; real render fidelity is covered host-side (engineTest) + corpus (T54).
  2. **Manifest coordinate duplication (T15).** Top-level layoutlib/tools + androidx/Material coordinates live in BOTH `host/src/main/kotlin/manifest/EngineArtifacts.kt` and `host/build.gradle.kts` — **T38** (Phase 7 pin bump) must update both in sync.
  3. **Spec-precision note (T13).** `render` stub returns a domain `RenderResponse{status:error,...}` (correct); but `listThemes`/`invalidate`/`warmup` return trivial successes (`[]`/`{}`/`{}`) rather than stubbed errors — worker's reading of ambiguous protocol.md phrasing. Harmless (T26 fills listThemes, T24 fills invalidate, real warmup later); noted for Verifier.
  - Also: T6's `hello.test.ts` / `inflate.helloPreview` deleted as superseded by T18 (per T18 "replace" instruction). `tsconfig` module set to `node16` for vscode-jsonrpc exports (still emits CJS).
- **Phase 4 (T20–T27) COMPLETE** (Batch 3, session, 2026-07-19): commits `8793ee8`…`4122268`. Ext 79 vitest; host 66 JUnit unit + 8 engineTest classes — green, tree clean. Invalidation rebuild ~10 ms (matches M0).
- **Load-bearing contracts from Phase 4 (Phases 5–6 depend on these):**
  - **Root priority (RES-02):** Studio repos give the LAST dir passed to `AppResourceRepository.create` highest priority → `session()` builds with `([overlay] + roots).reversed()`; containing-module root wins; overlay is priority-neutral. Verified vs 1.3.5 sources.
  - **Resource existence:** use `EngineAdapter.appResourceExists(typeName, name)` — NOT `resourceId`/`getIdentifier`, which return a fresh non-zero id for ANY name under the dynamic-id scheme (Q3, empty `resourcePackageNames`) and cannot detect absence.
  - **Session cache:** size-1, keyed `(ordered roots, packageName)`; rebuilds app repo on key-change/dirty, activates immediately, bumps `sessionGeneration`. `ProjectSession.render(layoutId, deviceConfig?, theme?)` uses fresh SessionParams per render (`unsafeUpdateConfig`); `overlayDir` settable, prepended.
  - **Invalidate:** `invalidate(paths)` marks dirty only for paths under a current root, returns whether rebuild scheduled; previewed-file-only edits aren't passed. No-arg `invalidate()` (T4) retained.
  - **ThemeCatalog:** `ThemeCatalog(adapter).list()` → `ThemeInfo[]`, cached by `sessionGeneration`. Library/AAR themes arrive in Phase 7 (source enum already supports material/appcompat).
  - **Degradation:** `Degradation(log, overlayResDir).degradeReferences(content, resolves)` + `degradeStyleParent(...)`; warnings via LogBridge → **T35 maps LogBridge entries → RenderResponse.warnings**.
- **RPC wiring still pending → T35 (Phase 6):** RpcServer holds no EngineAdapter yet, so `listThemes`/`invalidate`/`render` still return stubs (`ThemeCatalog.list()` is the ready producer). In-scope-correct (T26/T24 Where excluded RpcServer.kt); folds into debt note above.
- **Verifier flag (T24 SessionTest):** the `resourceId(...) != 0` smoke lines are tautological under the dynamic-id scheme (non-discriminating); the REAL proof is the pixel assertions (app-blue-beats-lib-red = RES-02 direction; magenta-after-edit = hot reload) — these DO discriminate, so T24's gate is meaningful. Verifier should either accept the pixel coverage or strengthen the weak lines to `appResourceExists` (method now exists). Worker did not rewrite committed T24 to avoid mid-batch history rewrite.
- **Phase 5 (T28–T32) COMPLETE** (Batch 4, sonnet, 2026-07-19): commits `557e22d`…`114ee35`. Host unit 66→96 (+30). AD-013 satisfied: `Scan.kt` calls `UnknownViewSubstitutor` (kept intact) + adds a `<view class="...">`-form pass; both funnel to `LogBridge.recordSubstitutedClass` + `customClasses`. Engine cache (389M) persists for Phase 6.
- **`PreprocessResult` shape (T35 consumes):** `{overlayFile:File?, lineMap:LineMap (.originalLine(overlayLine), .size), warnings:List<LogBridge.Entry>, referencedResources:List<Ref(kind,name)> (deduped, framework excluded), customClasses:List<String>, syntaxError:SyntaxError? (1-based line/col/msg)}`. Entry: `Preprocessor.preprocess(content, docKind:DocKind, docPath:File, roots:List<File>, overlayBaseDir:File=<tmp>/inflate-overlay, log:LogBridge, isLoadable:(String)->Boolean)`. Pipeline: validate(kxml2)→ToolsAttributes→DataBinding→Structural→Scan→write overlay.
- **CARRY-FORWARD to B5 (Phase 6) — required T35 wiring:**
  1. **Overlay dir handoff:** Preprocessor writes overlays to a process-wide fixed `overlayBaseDir` (default `tmpdir/inflate-overlay`). **T35 must set `EngineAdapter.overlayDir` = that same `overlayBaseDir`** so the overlay file is on the session's resource path. (Spec-precision gap — Verifier double-check.)
  2. **Error mapping:** reverse-map layoutlib "Binary XML file line #N" through `lineMap.originalLine(N)`; preprocessor `syntaxError` already 1-based.
  3. **Warnings:** T35 maps `PreprocessResult.warnings` (LogBridge entries) → `RenderResponse.warnings`.
  4. **RPC lifecycle:** T35 gives RpcServer an EngineAdapter and wires real `render`/`invalidate`/`listThemes` routing (still stubs today).
- **Verifier flags (Phase 5 spec-precision):** (a) overlayBaseDir location is an interpretation of "a fixed overlay dir" (item 1 above); (b) `@{...}` dimension-default detection uses a name-pattern heuristic (width|height|margin|padding|size|elevation|translation*|radius), not a real attr-type DB; (c) `DataBinding.unwrap` assumes AS-template line formatting (handles multi-line `<layout>` attrs, not tag boundaries sharing a content line) — documented in KDoc. LogBridge gained `recordBindingReplaced`/`recordNotice` (Kind.notice, distinct from substitutedClass) — outside literal Where lists but needed for AC4 notices.
- **Phase 6 (T33–T37) COMPLETE** (Batch 5, session, 2026-07-19): commits `f0f36b0`…`8520957`. Ext 109 vitest + 6 integration; host 102 JUnit unit + 17 engineTest. All 5 required T35 wiring items landed (overlay dir = `overlayBaseDir/res`; lineMap error reverse-map; PreprocessResult.warnings→RenderResponse.warnings; RpcServer backendFactory routes render/invalidate/listThemes; appResourceExists unchanged). Warm gallery render (7-deep, all §FR-1) **207 ms** (prepare 8 + render 192), incl. session rebuild — under NFR-01 700 ms.
- **⚠️ OPEN FUNCTIONAL GAPS — Verifier MUST convert these to fix tasks (bounded 3-iter fix→re-verify):**
  1. **Preprocessor is not comment-aware (CORRECTNESS bug).** Regex stages (Structural `wrapMerge`, DataBinding `unwrap`, Scan) match tag-like text inside XML comments. Failure scenario: a real layout containing `<!-- TODO: convert to <merge> -->` gets its comment rewritten → `inflated to null` / wrong root. Worker sanitized the T34 fixture comments as a stopgap (committed under T35) but the Preprocessor itself is unfixed. Fix belongs in Phase 5 code (`preprocess/*`); add a discriminating test (comment containing `<merge>`/`@{...}`/custom tag must be inert).
  2. **Degradation (T27) NOT wired into the live render path (RES-04/UX-05 gap).** `Degradation.kt` exists and passes its own isolated T27 engineTest, but `LayoutRenderer` (T35) never invokes it — so a REAL layout with unresolved refs does not get per-kind placeholder substitution + `RenderResponse.warnings[kind=unresolvedRef]` through the live `render` RPC. T35's Where excluded `Degradation.kt`; wiring needs pre-degraded content before overlay write. Failure scenario: open a real layout referencing `@color/missing` → render lacks the magenta placeholder + unresolvedRef warning the spec requires. Fix task must wire Degradation into the Preprocessor/LayoutRenderer path + add an integration/engineTest asserting live degraded output.
- **Phase 6 minor notes:** overlay indexing forces `adapter.invalidate()` (rebuild) per doc-switch (same-doc re-renders skip it → hot reload intact); `RenderTimings.inflateMs` folded into `renderMs` (EngineAdapter untouched — note for T57 perf); theme strings pass through verbatim (default `Theme.Material3.DayNight` needs Material artifacts → Phase 7); `RenderScheduler.settled()` added under T37 (openPreview awaits first render). **`shared/eligibility.json` is the single source of truth** — any Phase 7+ resource-type/root additions must update it or BOTH guard tests fail.
- **Phase 7 PARTIAL** (Batch 6, session, 2026-07-19): **T38 DONE** (`7052c25`) — androidx/Material pins added, `EngineArtifacts.kt` + `build.gradle.kts` confirmed IN SYNC (**debt #2 RESOLVED**), manifest regenerates idempotently (63 artifacts). **T39/T40/T41/T42 BLOCKED** on an engine-foundation gap (below). Host unit 103.

### AD-014 (BLOCKER + resolution plan) — layoutlib framework-class delegation
- **Discovery (T39, empirically verified):** `layoutlib-14.0.11.jar` ships 6 framework classes renamed to `_Original_*` (`android.os.Build`, `ServiceManager`, `SurfaceView`, `TextServicesManager`, `WebView`, `WindowManagerImpl`) but does NOT contain their delegating counterparts (e.g. `android.os.Build` is absent — confirmed via `unzip -l`). layoutlib expects a runtime class-generating classloader (driven by bundled `CreateInfo`) to synthesize the delegates; the transform tool (`create.Main`/`AsmGenerator`) is not in the published jar. Framework widgets render fine (loaded via layoutlib's own classloader), but **library/app view classes are loaded via `PaparazziCallback` → plain `Class.forName` on the app classloader**, which never sees the delegated `android.os.Build` → `MaterialButton` etc. fail with `NoClassDefFoundError: android/os/Build$VERSION`.
- **Why it escaped M0:** M0's checklist only rendered FRAMEWORK layouts (LinearLayout); androidx/Material was never inflated until Phase 7, so the delegation gap wasn't in the M0 gate scope. Design §D4's "mirror Paparazzi test classpath, mechanism proven" assumption is incomplete: real androidx rendering needs (a) AGP-generated R classes AND (b) layoutlib framework-class delegation for app-classloader-loaded views.
- **Progress already proven (in `scratchpad/T39-wip.patch`, 418 lines, NOT committed):** library resource repos wired (`AarSourceResourceRepository` → `AppResourceRepository.libraryRepositories`, below project roots for RES-02); classpath extraction (58 AAR/JAR classes) via `prepareEngineTestLibs`; a working `RClassGenerator` using AGP `sdk-common` (`SymbolIo`→`mergeAndRenumberSymbols`→`RGeneration`→javac→jar) that generated+compiled R classes for 42 packages. With these, **`ConstraintLayout` inflates as the real class**; only the framework-delegation gap remains (Material widgets).
- **Resolution (INSERTED TASK T38b, investigation-first):** determine EXACTLY how Paparazzi 1.3.5 renders androidx/Material in its OWN test suite (a working reference MUST exist) — how library view classes obtain the delegated framework classes — then mirror that minimal mechanism. Candidate approaches (choose by evidence, don't guess): (1) generate the 6 delegates from `_Original_*` at engine-setup via bundled `CreateInfo`; (2) route library-class loading through layoutlib's generating classloader (custom `LayoutlibCallback` classloader); (3) whatever Paparazzi actually does. Reuse the proven WIP patch. Also fold in the one-line fix so `resolvePaths()` includes AAR `<name>-classes.jar` in `classpathJars` (partially closes debt #1 classpath-assembly half).
- **Status**: ✅ **RESOLVED** (T38b, commit `232c85e`) — **no pin bump; AD-008 holds.** Mechanism: Paparazzi gets `android.os.Build` from AGP's mockable `android.jar` on the unit-test classpath; Inflate ships no SDK (AD-006), and layoutlib's `create` transform tool (`AsmGenerator`/`create.Main`) is NOT published (only `CreateInfo` metadata — verified). So T38b reconstructs the 6 canonical framework classes by a **byte-faithful ASM class rename** of layoutlib's own `_Original_*` copies (`/_Original_`→`/`, via `FrameworkDelegateGenerator` + `org.ow2.asm:asm` 9.7) into `framework-delegates.jar` on the engine classpath (`Renderer.configureBuildProperties()` then copies values across). Strictly more faithful than hand stubs; cannot collide (jar ships only `_Original_*`). `MaterialButton` now inflates as the REAL class under `Theme.Material3.DayNight` (verified). Documented in ENGINE_SURFACE.md. New host dep: `org.ow2.asm:asm`+`asm-commons` 9.7.

- **Phase 7 COMPLETE** (Batch 6+6b, session, 2026-07-19): commits `7052c25`,`232c85e`,`5f25a5f`,`b53a8fe`,`2914033`,`4ff9420`. Host unit 103 + engineTest 21 (13 classes); ext 109 vitest. Tree clean.
- **⚠️ Q5 MATERIAL FIDELITY GAPS (real, documented in `docs/material-quirks.md`; bear on AD-002 "complete+faithful v1" — flag to USER before release sign-off / T60):** under pinned layoutlib 14.0.11 + the SDK-free dynamic-id scheme (Q3), these DIVERGE from Studio: (a) **Chip, TextInputEditText, ExtendedFloatingActionButton, BottomNavigationView degrade to MockView placeholders** (Material's `TextAppearance` ThemeEnforcement); (b) **several widget backgrounds/tints render as the magenta unresolved-color placeholder** (geometry correct, fill wrong); (c) **ConstraintLayout `Guideline` does not reposition constrained views** (chains/barriers DO work). **Chip is explicitly named in P1-B's Independent Test but degrades** — a genuine spec-vs-delivered fidelity gap, documented, NOT asserted as real in tests. Q5 marked RESOLVED-with-caveats.
- **Verifier flags (Phase 7):** (1) **SPEC_DEVIATION** — T41's Where listed only fixtures+MaterialGalleryTest, but AC4 needed a `materialAttrMissing` warning producer that didn't exist → worker added `MaterialAttrCheck.kt` + `EngineAdapter.attrExists` + LayoutRenderer wiring + `MaterialAttrMissingTest` (flagged in commit). (2) The Q5 quirks are documented divergences, not test gaps — tests assert what the pinned engine faithfully renders. Verifier should weigh the Chip/P1-B gap + whether any quirk is improvable.
- **Debt #1 update (host-spawn classpath):** T39 closed the concrete half — `resolvePaths()` now includes AAR `<name>-classes.jar` in `classpathJars`, and `libraryResDirs`/`libraryPackages` threaded into `Main.buildBackend`. **Remaining for T60:** the REAL host also needs `framework-delegates.jar` generated at engine-setup (host-side ASM; the TS extension can't run ASM) — generator lives in `main/` ready to call; only the engineTest path wires it so far.
- **Phase 8 heads-up:** the magenta-tint symptom suggests theme-attr/color resolution has holes under the dynamic-id scheme (`?attr/colorPrimary` DOES resolve, but some tint attr paths don't). Drawables (Phase 8) lean heavily on theme attrs/colors — the Phase 8 worker should watch for the same class of resolution gap and report it, not silently placeholder.
- **In-progress** (file:line): none (WIP patch consumed).
- **Next step**: **Batch 7 = Phase 8 (T43–T49)** dispatched on the SESSION model (drawable engine paths: gallery fixtures, DrawableRenderer core+sizing, state rendering, animated/level variants, nine-patch, adaptive-icon, drawable toolbar).
- **Batch plan**: B1=P1✅ · B2=P2+P3✅ · B3=P4✅ · B4=P5✅ · B5=P6✅ · B6=P7✅ · B7=P8(session)▶ · B8=P9(sonnet) · B9=P10(sonnet) → Verifier (session).
- **Blockers**: none
- **Uncommitted files**: none after state-update commit
- **Branch**: main
