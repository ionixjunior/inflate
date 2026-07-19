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

## Handoff

- **Feature**: android-xml-preview (`.specs/features/android-xml-preview/`)
- **Phase / Task**: Tasks — tasks.md DRAFTED (2026-07-19), awaiting user approval
- **Completed**: Specify (confirmed); Design (approved; Q1–Q4 resolved; AD-009..012); Tasks draft: 60 atomic tasks in 10 phases mapped to milestones M0–M7 (M1/M3 split at seams), test coverage matrix (user-confirmed stack: Vitest / JUnit 5 / Gradle `engineTest` source set / Node+pixelmatch corpus), gate commands, dependency DAGs, all three pre-approval checks pass (granularity, diagram cross-check, test co-location). Tools decision: built-in + WebFetch/WebSearch for M0 primary-source checks; no MCPs.
- **Commit policy (user directive 2026-07-19)**: one atomic commit per task, immediately on gate pass; titles start with an imperative verb ("Create", "Add", "Implement", "Update", …), ≤72 chars.
- **In-progress** (file:line): none
- **Next step**: Execute (fresh session). tasks.md APPROVED by user (2026-07-19). **Sub-agent offer already made and ACCEPTED by user (2026-07-19) — do not re-offer**: dispatch batch workers (~9 batches, whole phases per tasks.md §Phase Execution Map, strictly sequential, compact summaries, one atomic verb-first commit per task). Execute starts with Phase 1 = M0 empirical checklist; on any M0 item failure apply the design's pre-agreed fallback and record it here. Verifier runs automatically after the final task of the run.
- **Blockers**: none
- **Uncommitted files**: none after "Create tasks" commit
- **Branch**: main (spec c4717fe, design 62034cd)
