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

## Handoff

- **Feature**: android-xml-preview (`.specs/features/android-xml-preview/`)
- **Phase / Task**: Specify — COMPLETE and confirmed (assumptions reviewed by user; Q1 resolved via AD-008; closure gate passes)
- **Completed**: clarification rounds 1–2 (8 decisions), fact-verification research, spec.md, context.md, AD-001..AD-008
- **In-progress** (file:line): none
- **Next step**: Enter Design phase — write design.md; first activity is the M0 spike on the pinned engine (layoutlib pairing for Paparazzi 1.3.5, state injection Q2, arbitrary-file render path Q3, download size Q4). Initialize git repo before Execute (atomic commits required).
- **Blockers**: none
- **Uncommitted files**: `.specs/*` (repo not yet a git repository)
- **Branch**: n/a (no git repo yet)
