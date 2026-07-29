# Inflate — Android XML Preview for VS Code: Specification

**Feature**: android-xml-preview · **Status**: v1 confirmed & verified (`validation.md` PASS) · **Date**: 2026-07-19
**Scope tier**: Complex (new domain, multi-component, cross-ecosystem)
**Amendment**: UI Polish fix-pack (2026-07-26, POLISH-01..08, stories FP-1..FP-5) — see the
[amendment section](#ui-polish-fix-pack-amendment--2026-07-26) at the end of this file. The v1
content above it is the verified baseline and is not re-opened.

---

## Problem Statement

Android layout and drawable XML can only be previewed faithfully inside Android Studio, because faithful rendering requires the framework's own inflation/measure/theme logic (layoutlib). Developers working in VS Code — and especially .NET Android (Xamarin/MAUI) developers, whose Visual Studio Android Designer was removed in VS 2022 17.13 (Feb 2025) with the official workaround being "copy your XML into a scratch Android Studio project" — have no way to see what their XML produces without leaving their editor or installing a multi-gigabyte IDE they don't otherwise use.

No existing VS Code extension renders through layoutlib; the market offers only abandoned HTML/CSS approximations and vector-only SVG previewers (verified 2026-07-19). Inflate fills that gap: pixel-faithful previews of Android layouts and drawables directly in VS Code, powered by the same rendering engine as Android Studio, with no Android Studio and no Android SDK installed.

## Goals

- [ ] A developer opens any standard Android layout or drawable XML file in VS Code and sees a faithful preview (Android-Studio-parity rendering) beside the editor, on a machine with only VS Code and a JDK installed.
- [ ] The preview reflects saved changes automatically (hot reload) and lets the developer switch light/dark theme, device size, density, and drawable state from a toolbar.
- [ ] The same experience works unmodified in native Gradle projects and .NET Android projects (both `res/` and `Resources/` trees, `.xml` and `.axml` files).
- [ ] The first public release covers the complete v1 surface below — all listed view groups, widgets, and drawable types (per AD-002, no public MVP).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Jetpack Compose / .NET MAUI XAML previews | Different rendering models entirely; Inflate is scoped to Android View XML |
| Visual editing / drag-and-drop designer | Inflate is a previewer, not a designer; editing stays in the text editor |
| Menu, preference, navigation, and values-only XML previews | Not layouts or drawables; possible future features |
| Windows and Linux support in v1 | AD-004 — macOS-only first release; fast-follow (natives verified available) |
| Animation playback (animated-vector, animation-list, transitions) | Deferred by user decision — static initial frame in v1 (P3 story) |
| Click-to-source selection sync, hierarchy inspector | Deferred by user decision (P2/P3 stories) |
| Loading project bytecode for custom views | AD-007 — placeholder rendering in v1 (P3 story) |
| Rendering with the project's own dependency versions | Bundled, pinned androidx/Material artifacts stand in (see D4); divergence documented |
| Data-binding expression evaluation (`@{...}`) | Expressions are replaced with defaults/placeholders; evaluating them requires project code |
| Emulator/device interaction, ADB features | Out of product scope entirely |

---

## Users & Environments

| Aspect | v1 commitment |
| ------ | ------------- |
| Primary users | Native Android devs (Gradle/Kotlin/Java) **and** .NET Android devs (Xamarin/MAUI) — equal priority (AD-001) |
| Project shapes | Gradle single/multi-module (`src/<sourceSet>/res/`), .NET Android (`Resources/`), plus any folder containing a conventional Android resource tree |
| File types | Layout XML, drawable XML, `.9.png` nine-patches; extensions `.xml` and `.axml` |
| OS | macOS arm64 + x64 (AD-004) |
| Machine dependencies | VS Code ≥ current stable −1 year; a preinstalled JDK (auto-detected, AD-003); network access for one-time engine download (AD-006). **No Android Studio. No Android SDK.** |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

### Confirmed user decisions (2026-07-19)

| Decision | Choice | Confirmed? |
| -------- | ------ | ---------- |
| Audience priority | Both ecosystems equal at launch | y |
| First release scope | Complete (no public MVP); internal milestones only | y |
| JVM dependency | Require preinstalled JDK, auto-detect, guided error if absent | y |
| Component coverage | Full tier: framework + androidx essentials + Material Components | y |
| Custom/unknown views | Labeled placeholder box; no project bytecode in v1 | y |
| Stateful/animated drawables | Static rendering + toolbar state picker; playback deferred | y |
| Preview interactivity | Static image + zoom/pan + config toolbar; inspect/sync deferred | y |
| Platforms | macOS (arm64 + x64) only in v1 | y |

### Assumptions (agent defaults — reviewed and confirmed by user 2026-07-19)

| Assumption | Chosen default | Rationale | Confirmed? |
| ---------- | -------------- | --------- | ---------- |
| `tools:` attributes | Honor core design-time set: `tools:text`, `tools:src`, `tools:visibility`, `tools:background`, `tools:layout` (on `<fragment>`/`<include>`), via preprocessing before inflation | Matches Android Studio behavior; layoutlib itself doesn't process `tools:` — the IDE layer does | y |
| Data-binding layouts | `<layout>` wrapper unwrapped; `@{...}` expressions replaced by attribute-appropriate defaults + a preview notice | Files must still render; evaluation is impossible without project code | y |
| AdapterViews (ListView, RecyclerView, …) | Render empty at correct bounds/background in v1; `tools:listitem` support is P2 | Design-time adapter faking is IDE-layer work; empty render is honest and cheap | y |
| Level-based drawables (`<clip>`, `<scale>`, `<rotate>`, `<level-list>`) | Render at level 5000 (50%) with a preview note; level slider deferred | Level 0 renders nothing for clip — misleading | y |
| Render trigger | On save (mandatory) + manual refresh (uses dirty buffer); live on-type rendering is a P2 setting, default off | User asked for "hot-reload on save"; on-type adds churn | y |
| Preview platform version | Pinned by the extension (layoutlib pin, see D6); project `compileSdk`/`targetSdk` not consulted in v1 | Divergence documented; avoids build-system coupling (AD-001) | y |
| Theme default | Auto-pick: project manifest `android:theme` if trivially parseable → else `Theme.Material3.DayNight` (bundled) → toolbar picker always available | Sensible zero-config default in both ecosystems | y |
| Single-file mode | An XML file outside any recognizable resource tree still renders, with unresolved references degraded per RES-05 and a "no resource root found" notice | Useful for gists/snippets; degradation must be graceful anyway | y |
| Config persistence | Per-file preview config persisted in workspace state | Matches editor conventions | y |
| Adaptive icons | `<adaptive-icon>` renders composed under a circular mask in v1; alternate masks/safe-zone overlay deferred | It is drawable XML developers will open; circle is the common default | y |
| Extension license / distribution | Apache-2.0, published to VS Code Marketplace + Open VSX | Repo lives under open-source/; ecosystem norm | y |
| Working name | "Inflate" | Directory name; final marketplace name is a launch decision | y |

### Open questions → investigation items (each has a default; none blocks the spec)

| # | Question | Default until resolved | Resolution plan |
| - | -------- | ---------------------- | --------------- |
| Q1 | **Resolved 2026-07-19 (user → AD-008)**: pin Paparazzi 1.3.5 + JDK 17 minimum (2.x alphas require JDK 21, which would exclude the large Microsoft OpenJDK 17 install base) | Pin: Paparazzi 1.3.5, JDK ≥ 17 | Residual technical check folded into M0: confirm the exact layoutlib artifact version 1.3.5 pairs with, its Android API level, and whether layoutlib can be bumped independently of Paparazzi |
| Q2 | Can drawable state (pressed/checked/…) be injected reliably for the state picker — via `setState` on the inflated drawable / synthetic wrapper view inside a layoutlib session? | Assume yes (standard framework API implemented by layoutlib); scope fallback = state picker limited to selectors we re-inflate per state | M0 spike renders one selector in ≥3 states |
| Q3 | Does `PaparazziSdk` accept rendering a layout from an arbitrary file path / in-memory XML (needed for `tools:` preprocessing and unwrap), or must the previewed file be materialized into a shadow resource-dir overlay? | Shadow overlay res dir (copy-on-render with preprocessing applied) — works regardless | M0 spike |
| Q4 | Exact one-time download size and Google Maven URL stability for `com.android.tools.layoutlib:{layoutlib,layoutlib-runtime(os-classifier),layoutlib-resources}` + androidx/Material AAR set | Estimate 150–250 MB; document measured size | M0 spike measures; pin URLs + SHA-256 |
| Q5 | Material component rendering quirks under layoutlib (shadows, elevation overlays, shapeable backgrounds) — which render imperfectly even in Android Studio? | Accept Studio-parity as the fidelity bar; catalog known quirks in docs | Corpus test during M4; compare against Studio screenshots |
| Q6 | `.axml` + `Resources/` casing edge cases in historical Xamarin projects (e.g., `Resources/layout/Main.axml`, capitalized subdirs?) | Support `.axml`/`.xml` and case-insensitive resource-type dir matching | Test corpus includes a legacy Xamarin-shaped fixture |
| Q7 | Multi-module Gradle: how far does convention-based discovery go before a `inflate.resourceRoots` setting is needed? | v1 resolves the containing module's source-set res dirs + user-configured extra roots; cross-module `@resource` refs resolve only if those roots are configured | Corpus includes a two-module fixture; revisit post-v1 |

**Open questions: none unlogged** — all carry a default and an owner phase, satisfying the closure gate.

---

## Key Decision D1 — Drawable rendering engine: unified vs two-path

**The question**: render drawables through the same layoutlib host as layouts (unified), or convert self-contained drawables (vector, shape, …) to SVG/Canvas in the webview with no JVM (two-path)?

| Criterion | Unified (all layoutlib) | Two-path (SVG for drawables) |
| --------- | ----------------------- | ---------------------------- |
| Fidelity | Framework-exact for every type, including selector/ripple/nine-patch; one truth for a drawable standalone vs inside a layout | Vector→SVG has verified gaps: sweep gradients (no SVG equivalent; needs Canvas `createConicGradient`), `trimPath*` (dropped by existing converters), `autoMirrored`, theme-attr refs need our own resolver. **No web renderers exist at all for `<shape>`, `<layer-list>`, `<selector>` — they'd be built and maintained from scratch** (verified 2026-07-19) |
| Latency | Warm ~100–400 ms; cold start (JVM + layoutlib init) seconds — mitigated by pre-warming on activation | Instant (<50 ms), no JVM needed for drawables |
| Runtime deps | JDK required for any preview | Drawables preview without a JDK |
| Code to build/maintain | One engine + thin host | Second rendering stack: VD→SVG converter + shape/layer-list/selector/nine-patch renderers + a shared resource resolver reimplemented in TS + drift policing between engines |
| Consistency risk | None | A vector can render differently standalone (SVG path) vs inside a layout (layoutlib path) |

**Decision — Unified engine in v1 (AD-005).** Rationale: the first release must be complete and faithful (AD-002), so the JVM host ships in v1 regardless — the two-path option saves no v1 dependency; it only adds a second, gap-ridden rendering stack precisely where completeness is promised. The webview renderer interface keeps a **per-document-type routing seam**: adding an SVG fast path later (for instant vector previews / JDK-free degraded mode) is a P2/P3 optimization (story DRW-FAST), not an architectural rework. Cold-start latency is mitigated by pre-warming the host when an Android resource tree is detected (NFR-01).

---

## User Stories

Priorities per AD-002: **P1 = required for the first public release** (the release is complete, so P1 is broad). P2/P3 = subsequent releases.

### P1-A: Preview a framework-widget layout ⭐

**User Story**: As an Android developer in VS Code, I want to open a layout XML and see it rendered as it would appear on a device, so that I can iterate on UI without Android Studio.

**Why P1**: The core value proposition; everything else composes onto this loop.

**Acceptance Criteria**:
1. WHEN the user runs `Inflate: Open Preview` (command, editor-title button, or context menu) on a layout XML using only framework view groups/widgets (surface table §FR-1) THEN the system SHALL display a rendered image of that layout in a webview panel beside the editor within the latency bounds of NFR-01.
2. WHEN the layout nests view groups arbitrarily (e.g., LinearLayout → FrameLayout → RelativeLayout, ≥6 levels) THEN the system SHALL render measure/layout results identical to layoutlib's output (framework semantics, not approximations).
3. WHEN the layout file contains an XML syntax error THEN the system SHALL show an error panel with the parser message and 1-based line/column, and SHALL keep showing the last successful render (dimmed, marked stale) if one exists.
4. WHEN the previewed file uses `<include>`/`<merge>`/`<ViewStub>`/`<fragment>` THEN the system SHALL: inflate `<include>` targets; render a `<merge>` root inside a default parent (match_parent FrameLayout); render `<ViewStub>` as its collapsed (zero-size or outlined) state; render `<fragment>` as a labeled placeholder unless `tools:layout` names a layout, which SHALL be inflated instead.
5. WHEN a layout references a custom or unknown view class THEN the system SHALL render a labeled placeholder box (class name, sized by its layout params) and list the substituted classes in the preview's warnings strip (AD-007).
6. WHEN the previewed XML is a data-binding layout (`<layout>` root) THEN the system SHALL unwrap it and replace `@{...}` expressions with type-appropriate defaults, showing a "binding expressions replaced" notice.

**Independent Test**: Open the fixture `framework_gallery.xml` (every §FR-1 widget nested 6 deep, one bad-syntax variant, one custom-view variant); verify render, error, and placeholder behavior without any androidx artifact present.

---

### P1-B: androidx + Material layouts render with Material themes ⭐

**User Story**: As a developer whose real-world layouts use ConstraintLayout and Material widgets, I want those to render correctly with Material theming, so that the preview is useful on production code, not just toy layouts.

**Why P1**: Verified: real projects in both ecosystems lean on ConstraintLayout/Material; without this tier the preview fails on most production layouts.

**Acceptance Criteria**:
1. WHEN a layout uses the androidx/Material surface (§FR-2) THEN the system SHALL render it using the bundled, pinned androidx/Material artifacts (classes on the host classpath, resources in the resolver) with no per-project configuration.
2. WHEN the selected theme is a bundled Material theme (Theme.Material3.\*, Theme.MaterialComponents.\*, AppCompat) or a project theme inheriting one THEN the system SHALL resolve `?attr/` theme references (e.g., `?attr/colorPrimary`) through the full style/theme inheritance chain.
3. WHEN a ConstraintLayout uses constraints, chains, guidelines, barriers, groups, or flow THEN the system SHALL position children per the bundled ConstraintLayout engine.
4. WHEN a layout references a Material attribute that the bundled Material version does not define THEN the system SHALL render with the attribute ignored and emit a warning naming the attribute and the bundled Material version.

**Independent Test**: Fixture `material_gallery.xml` (MaterialButton, TextInputLayout, Chip, TabLayout, FAB, MaterialCardView inside ConstraintLayout with chains + barriers) renders under Theme.Material3.DayNight in a project with no dependency declarations at all.

---

### P1-C: Preview every drawable type ⭐

**User Story**: As a developer, I want to open any drawable XML (or nine-patch) and see it rendered, so that I can design icons, backgrounds, and states without building the app.

**Why P1**: "Renders all the things" (AD-002) — drawables named explicitly in the product scope.

**Acceptance Criteria**:
1. WHEN the user previews a drawable of any type in §FR-3 THEN the system SHALL render it via the layoutlib host (AD-005) on a configurable checkerboard/solid backdrop, at the density selected in the toolbar.
2. WHEN the drawable is intrinsic-sized (vector, bitmap, nine-patch) THEN the system SHALL render at intrinsic size by default with a size override control; WHEN it has no intrinsic size (shape, color, ripple) THEN the system SHALL render at a default 128×128 dp canvas, overridable.
3. WHEN the drawable is animated (`<animated-vector>`, `<animation-list>`, `<animated-selector>`, `<transition>`) THEN the system SHALL render its initial/static state and show a "static preview" badge (playback is P3).
4. WHEN the drawable is a `.9.png` source nine-patch THEN the system SHALL render it stretched to at least two preview sizes honoring stretch regions and padding markers.
5. WHEN a drawable references resources (`@color/`, `@dimen/`, `?attr/`, another `@drawable/`) THEN the system SHALL resolve them with the same resolver and theme selection as layouts (single fidelity truth).
6. WHEN the drawable is an `<adaptive-icon>` THEN the system SHALL render background+foreground composed under a circular mask.

**Independent Test**: Fixture folder `drawables_gallery/` containing one of each §FR-3 type renders without errors; nine-patch fixture shows correct corner behavior at 2 sizes.

---

### P1-D: Drawable state picker ⭐

**User Story**: As a developer working with selectors and ripples, I want to switch the previewed state (default/pressed/checked/disabled/focused/selected), so that I can verify every branch of a state-list without deploying.

**Why P1**: User decision — "static + state picker" defines v1 completeness for stateful drawables.

**Acceptance Criteria**:
1. WHEN the previewed drawable is state-sensitive (`<selector>`, `<ripple>`, `<animated-selector>`) THEN the toolbar SHALL offer a state picker with: default, pressed, checked, disabled (enabled=false), focused, selected, activated.
2. WHEN the user picks a state THEN the system SHALL re-render the drawable with exactly that state set applied and SHALL indicate which `<item>` of a selector matched (e.g., "matched item #2, state_pressed").
3. WHEN the drawable is not state-sensitive THEN the state picker SHALL be hidden.
4. WHEN a `<ripple>` is previewed in pressed state THEN the system SHALL render the ripple overlay in its settled (fully-shown) form.

**Independent Test**: Selector fixture with 4 state items renders visibly differently across 4 picker states; matched-item indicator names the correct item.

---

### P1-E: Config toolbar — light/dark, device, density, orientation ⭐

**User Story**: As a developer, I want to flip the preview between light/dark and between device sizes/densities, so that I can see configuration differences (explicit user requirement: light/dark comparison) without an emulator.

**Why P1**: Named in the product brief; day/night is called out explicitly.

**Acceptance Criteria**:
1. WHEN the user toggles day/night THEN the system SHALL re-render selecting `-night` qualified resources and DayNight theme variants, and the two renders SHALL differ iff the layout/theme has night-varying inputs.
2. WHEN the user picks a device preset (list SHALL include at minimum: small phone ~360×640dp, modern phone ~411×891dp, large phone ~480×1040dp, 7" tablet, 10" tablet) or toggles orientation THEN the system SHALL re-render with the corresponding screen size/orientation qualifiers applied.
3. WHEN the user picks a density (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi) THEN the system SHALL re-render selecting density-qualified resources and scaling px-defined values accordingly.
4. WHEN the user picks a theme from the theme picker THEN the list SHALL include project themes (from the resolved resource tree) and bundled platform/Material themes, and the render SHALL apply the chosen theme.
5. WHEN any config changes THEN the system SHALL persist it per file (workspace state) and restore it when the preview reopens.

**Independent Test**: A fixture with `values/` vs `values-night/` colors and `layout/` vs `layout-sw600dp/` variants demonstrably switches resources across toggles; config survives closing/reopening the preview.

---

### P1-F: Hot reload on save ⭐

**User Story**: As a developer, I want the preview to update when I save the XML or its dependencies, so that iteration is a save-glance loop.

**Why P1**: Named in the product brief.

**Acceptance Criteria**:
1. WHEN the previewed file is saved THEN the system SHALL re-render within NFR-01 warm-render bounds, without stealing editor focus.
2. WHEN a file the render depends on is saved (values, styles/themes, a referenced drawable/layout/font — tracked from the previous render's resolved dependencies) THEN the system SHALL re-render the open preview.
3. WHEN multiple saves occur in quick succession THEN the system SHALL coalesce renders (latest content wins) and SHALL never display a render of stale content after a newer save (request IDs; stale responses discarded).
4. WHEN the user runs `Inflate: Refresh Preview` THEN the system SHALL render the current buffer content even if unsaved.

**Independent Test**: Scripted edit-save loop on layout + its colors.xml: preview updates both times; rapid 10-save burst produces a final image matching the last content.

---

### P1-G: Both project ecosystems resolve resources correctly ⭐

**User Story**: As a Gradle or .NET Android developer, I want `@string/`, `@dimen/`, `@color/`, `@drawable/`, `@style/`, `?attr/` references in my project tree to resolve in the preview, so that renders show my actual values, not fallbacks.

**Why P1**: AD-001 — both ecosystems first-class; resource resolution is where they differ.

**Acceptance Criteria**:
1. WHEN the previewed file lives under a conventional Android resource tree (`**/res/<type>[-qualifier]/` or `**/Resources/<type>[-qualifier]/`, matched case-insensitively on the type dir) THEN the system SHALL locate the resource root automatically by walking up from the file, with `.xml` and `.axml` both accepted.
2. WHEN references of kinds `@string/ @dimen/ @color/ @drawable/ @mipmap/ @style/ @font/ @bool/ @integer/ @array/ @layout/ @id/ ?attr/ ?android:attr/ @android:*` appear THEN the system SHALL resolve them against (in priority order): the file's resource root and sibling source-set roots → `inflate.resourceRoots` configured roots → bundled androidx/Material resources → framework resources.
3. WHEN the selected configuration implies qualifiers (night, density, screen size, orientation) THEN resolution SHALL honor Android's qualifier-matching rules for the selected config.
4. WHEN a reference cannot be resolved THEN the system SHALL degrade per-kind (string → the reference name; color → magenta `#FF00FF`; dimen → 0dp; drawable → outlined placeholder) and list every unresolved reference in the warnings strip — the render SHALL still complete.
5. WHEN the workspace is a Gradle multi-module project THEN references SHALL resolve within the containing module's source sets by convention, plus any `inflate.resourceRoots` entries (Q7 default).

**Independent Test**: Two fixture repos — `fixtures/gradle-sample` (two modules, flavors, night variants) and `fixtures/dotnet-sample` (Resources/, .axml, legacy casing) — render the same semantic layout with identical output; unresolved-reference fixture lists exactly the missing refs.

---

### P1-H: First-run setup without Android Studio ⭐

**User Story**: As a new user on a machine with only VS Code and a JDK, I want the extension to set itself up (find Java, fetch the engine) with clear progress and errors, so that I never install Android Studio or an SDK.

**Why P1**: The product's core promise; AD-003/AD-006.

**Acceptance Criteria**:
1. WHEN a preview is first requested and no engine cache exists THEN the system SHALL download the pinned engine artifacts (layoutlib runtime for the host OS/arch, layoutlib resources, androidx/Material set) from Google Maven with visible progress, verify each against pinned SHA-256 checksums, and cache them in extension global storage; subsequent runs SHALL work offline.
2. WHEN a compatible JDK exists in `inflate.javaHome`, `JAVA_HOME`, `PATH`, or platform-standard locations (macOS: `/usr/libexec/java_home` registry, Homebrew, SDKMAN, Android Studio JBR, Microsoft OpenJDK dirs) THEN the system SHALL select it automatically, preferring `inflate.javaHome` > `JAVA_HOME` > highest compatible version.
3. WHEN no compatible JDK is found THEN the system SHALL show a guided setup message stating the required minimum version (JDK 17 — AD-008) with a download link and a "re-check" action — and SHALL NOT attempt to download a JVM (AD-003).
4. WHEN a checksum fails or a download is interrupted THEN the system SHALL discard the partial artifact, report which artifact failed, and offer retry; a failed download SHALL never leave the cache in a state the host will load.
5. WHEN the user runs `Inflate: Doctor` THEN the system SHALL report: detected JDK (path, version), cache state (artifacts, versions, sizes), host status, resource roots detected for the active file, and last render timing.

**Independent Test**: On a clean macOS user account (no Android tooling): install VSIX → open fixture layout → guided flow completes → render appears; then disable network → renders still work.

---

### P1-I: Failure transparency & resilience ⭐

**User Story**: As a user, I want render failures to tell me exactly what went wrong and never wedge the editor, so that I trust the tool on messy real-world files.

**Why P1**: Completeness includes the unhappy paths; renderer subprocesses crash in practice.

**Acceptance Criteria**:
1. WHEN the JVM host crashes or a render exceeds the 15 s timeout THEN the system SHALL kill/restart the host (exponential backoff, max 3 automatic restarts per 5 minutes), surface a readable error with the host's last stderr lines, and recover on the next render request after backoff.
2. WHEN a render fails inside layoutlib (inflation exception, resource error) THEN the system SHALL show the exception message mapped, where possible, to the offending file/line, while keeping the last good render visible (stale-marked).
3. WHEN the host process state changes THEN it SHALL follow only the transitions stopped → starting → ready → rendering → (ready | crashed), crashed → starting; no render SHALL be dispatched unless state is ready.
4. WHEN VS Code exits or the workspace closes THEN the system SHALL terminate the host process (no orphans).
5. WHEN anything is written to logs THEN the "Inflate" output channel SHALL capture extension + host logs with timestamps and render IDs; render timings SHALL be visible in Doctor.

**Independent Test**: Kill the host PID mid-session → next save recovers automatically; fixture with an inflation-crashing construct shows mapped error while previous image stays visible.

---

### P2 stories (post-v1, next releases)

| ID | Story | Notes |
| -- | ----- | ----- |
| P2-J | Windows + Linux support | Natives verified on Google Maven; add CI matrix, path/JDK-detection per-OS; watch Paparazzi Windows-specific issues (e.g. snapshot-path bug #2016 class) |
| P2-K | Side-by-side day/night compare | Render both configs, split view — directly extends the explicit light/dark goal |
| P2-L | Click-to-source selection sync | Host emits per-view bounds; click highlights view + reveals XML tag |
| P2-M | `tools:listitem` + design-time adapter items for AdapterViews/RecyclerView | Extends P1-A/§FR-1 honesty gap |
| P2-N | SVG fast path for `<vector>` (instant + JDK-free degraded mode) | Fills the AD-005 routing seam; cross-checked against layoutlib goldens |
| P2-O | Locale, RTL/LTR, and font-scale preview configs | Adds qualifiers + `autoMirrored` verification |
| P2-P | Render-in-parent context (`tools:showIn`) and include-parent navigation | |
| P2-Q | Live on-type rendering (debounced, default off) | Setting `inflate.renderOnType` |

### P3 stories (later)

| ID | Story | Notes |
| -- | ----- | ----- |
| P3-R | Animation playback (animated-vector, animation-list) with play/pause | Frame-sequence export from host |
| P3-S | Hierarchy inspector (tree + resolved attributes + bounds overlay) | |
| P3-T | Custom-view rendering from project build output (opt-in, sandboxed) | Fills AD-007's reserved classpath slot |
| P3-U | Export preview as PNG at chosen config/density | |

---

## Functional Requirements — Supported Surface

### FR-1: Framework layouts & widgets (P1-A)

| Category | v1 surface |
| -------- | ---------- |
| View groups | LinearLayout, FrameLayout, RelativeLayout, TableLayout/TableRow, GridLayout, ScrollView, HorizontalScrollView, absolute/custom-attr passthrough via layoutlib |
| Widgets | View, TextView, Button, ImageView, ImageButton, EditText, CheckBox, RadioButton/RadioGroup, Switch, ToggleButton, SeekBar, ProgressBar (all styles), RatingBar, Spinner, TextClock, Chronometer, Space |
| AdapterViews | ListView, GridView, ExpandableListView — rendered empty at correct bounds (assumption; `tools:listitem` = P2-M) |
| Structural | `<include>`, `<merge>`, `<ViewStub>`, `<fragment>` (per P1-A AC4), `<requestFocus>` ignored |
| Attribute fidelity | All attributes the framework consumes — by construction (real inflation/measure/draw via layoutlib), including margins, padding, gravity, weights, visibility, elevation, background, tint, text appearance, autoSize text |

### FR-2: androidx + Material surface (P1-B) — bundled, pinned versions

| Library | Components required to render |
| ------- | ----------------------------- |
| constraintlayout | ConstraintLayout, Guideline, Barrier, Group, Flow, Placeholder; chains, ratios, percent dims |
| recyclerview / viewpager2 | Empty-render at bounds (items = P2-M) |
| cardview, coordinatorlayout, appcompat, core, fragment | CardView, CoordinatorLayout + AppBarLayout static layout behavior, AppCompat widget variants |
| material | MaterialButton, MaterialTextView, TextInputLayout/TextInputEditText, MaterialCardView, Chip/ChipGroup, TabLayout, BottomNavigationView, NavigationView, MaterialToolbar, AppBarLayout, FloatingActionButton (+Extended), Slider/RangeSlider, MaterialSwitch/SwitchMaterial, BottomAppBar, MaterialDivider, ShapeableImageView |
| Themes | Theme.Material3.\* (Day/Night variants), Theme.MaterialComponents.\*, Theme.AppCompat.\*, platform Theme.Material/DeviceDefault/Holo |

### FR-3: Drawable types (P1-C/P1-D)

| Type | v1 behavior |
| ---- | ----------- |
| `<vector>` | Full render incl. gradients (linear/radial/sweep), clip paths, trimPath, fillType |
| `<animated-vector>` | Static initial frame + badge |
| `<shape>` (GradientDrawable) | All shapes (rectangle, oval, line, ring), corners, gradients, stroke (incl. dashed), size, padding |
| `<selector>` (StateListDrawable) | Default state + state picker (P1-D) |
| `<layer-list>` | Full compositing incl. item gravity, insets, width/height |
| `<ripple>` | Bounded/unbounded; settled overlay in pressed state |
| `<inset>`, `<clip>`, `<scale>`, `<rotate>`, `<level-list>` | Rendered; level-based types at level 5000 (assumption) |
| `<transition>`, `<animated-selector>` | Start state + badge |
| `<bitmap>` | Tile modes, gravity, filtering; png/webp/jpg sources |
| Nine-patch `.9.png` | Source-format markers honored; stretched multi-size preview |
| `<color>` / color resources | Swatch render |
| `<adaptive-icon>` | Composed under circular mask (assumption) |
| `<insetDrawable>`/`<drawable>` aliases, mipmap refs | Resolve + render |

### FR-4: Preview configuration (P1-E)

Day/night, device preset (5 minimum), orientation, density (5 buckets), theme picker (project + bundled), drawable state (P1-D), drawable backdrop + size override, zoom/pan (25–400%, fit-to-window default; re-render at higher density past 200% so zoom stays crisp).

### FR-5: Editor integration (P1-A/F)

Commands: Open Preview (side panel), Refresh Preview, Doctor, Clear Engine Cache, Restart Render Host. Editor-title button + context-menu entry for eligible files (layout/drawable XML by path or root element sniffing, incl. `.axml`). Warnings strip in preview panel (unresolved refs, substituted classes, notices) — collapsible.

---

## Non-Functional Requirements

| ID | Requirement |
| -- | ----------- |
| NFR-01 Latency | Warm layout render (≤300 views) p90 ≤ 700 ms, drawable p90 ≤ 400 ms, save→updated-preview p90 ≤ 1 s. Cold host start ≤ 5 s target / 10 s max with progress UI; host pre-warms on activation when an Android resource tree is detected. First-ever run adds one-time artifact download (progress shown; size per Q4). |
| NFR-02 Resources | Host JVM heap cap default 1 GB (`inflate.hostMaxHeap`); host idles down (configurable, default: keep alive while VS Code open); extension activation adds ≤ 200 ms to VS Code startup (lazy everything). |
| NFR-03 Offline | After first-run caching, all functionality works offline. Cache location = extension globalStorage; `Inflate: Clear Engine Cache` empties it; cache is versioned per engine pin (stale pins removable). |
| NFR-04 Privacy/Security | No telemetry in v1. The only network traffic is artifact download from Google Maven (`dl.google.com`), pinned versions + SHA-256. Project files never leave the machine. Host runs with no project bytecode loaded (AD-007). |
| NFR-05 Robustness | Host crash never crashes/wedges VS Code (P1-I); concurrent previews supported (≥3 open previews; renders serialized per host, latest-wins per document); no orphan processes. |
| NFR-06 Dependencies | macOS 13+ (arm64/x64); JDK 17 minimum (AD-008); VS Code stable. No Android Studio, no Android SDK, no Gradle/MSBuild invocation ever. |
| NFR-07 Quality gate | Golden-image corpus (≥30 real-world fixtures: ≥12 Gradle-shaped, ≥12 .NET-shaped, ≥6 drawable galleries) rendered in CI on every change; diffs beyond an anti-aliasing tolerance fail the build. |

### Implicit-dimension sweep (Complex tier — every dimension resolved or N/A)

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | Malformed XML → P1-A AC3; unresolved refs → P1-G AC4; render canvas capped at 4096×4096 px (larger → error notice); include-cycle detection → Edge Cases |
| Failure / partial-failure | Host crash/timeout/restart → P1-I; partial artifact download → P1-H AC4; render-with-warnings is the standard partial mode |
| Idempotency / retry / duplicates | Renders idempotent; coalescing latest-wins + stale-response discard → P1-F AC3; download retry → P1-H AC4 |
| Auth boundaries & rate limits | N/A because local-only tool; no auth surface. Supply-chain integrity covered by pinned versions + SHA-256 (NFR-04) |
| Concurrency / ordering | Per-document latest-wins, per-host serialized queue (NFR-05); host state machine gates dispatch (P1-I AC3) |
| Data lifecycle / expiry | Engine cache versioned + clearable (NFR-03); per-file config in workspace state (P1-E AC5); no other persisted data |
| Observability | Output channel + render IDs + timings + Doctor (P1-H AC5, P1-I AC5) |
| External-dependency failure | Google Maven unreachable → clear offline error + retry; cached installs unaffected (NFR-03) |
| State-transition integrity | Host lifecycle state machine with legal-transition set (P1-I AC3) |

---

## Architecture Decisions (open — final selection in Design phase)

Facts below verified 2026-07-19 against Paparazzi source/CHANGELOG, Maven metadata, and Google Maven indexes.

### D2 — JVM host engine sourcing & packaging

**Context**: The host must load layoutlib headlessly without Gradle. Verified: `app.cash.paparazzi:paparazzi` works as a plain JVM library — `Environment` is a public constructor (appTestDir, packageName, compileSdkVersion, resourcePackageNames, localResourceDirs, moduleResourceDirs, libraryResourceDirs, asset dirs) and `PaparazziSdk` is the test-framework-agnostic core (environment/deviceConfig/theme/renderingMode → `onNewFrame(BufferedImage)`). Since 1.3.5 no Android SDK is needed — two system properties point at layoutlib runtime + framework resources, both fetched from Google Maven (`com.android.tools.layoutlib:layoutlib`, `:layoutlib-runtime` classifiers `mac|mac-arm|linux|win`, `:layoutlib-resources`; Apache-2.0 POMs).

| Option | Trade-offs |
| ------ | ---------- |
| **(leaning) Paparazzi-as-library**: host = thin Kotlin app over `PaparazziSdk`, constructing `Environment` ourselves | Reuses Cash App's battle-tested layoutlib environment bootstrapping (fonts, ICU, keyboards, natives); we track their pins. Risk: `PaparazziSdk` isn't a stability-guaranteed API — pin exactly, wrap behind our own interface, be fork-ready |
| Direct layoutlib bridge (à la Studio / johnsonlee/layoutlib) | No Paparazzi dependency; but we own all bootstrap complexity layoutlib requires — highest-effort, highest-control |
| Robolectric/Roborazzi engine | Real native graphics (RNG/Skia), but different renderer than Studio → breaks the Studio-parity promise; heavier environment |

**Packaging**: host fat-JAR (Paparazzi + our protocol layer, no layoutlib) ships in the VSIX; layoutlib runtime/resources + androidx/Material AARs download per AD-006. Protocol: JSON-RPC over stdio; images returned as PNG (transport mechanism—shared temp file vs base64—decided in Design).

### D3 — Resource-tree resolution across project types

**Context**: The engine consumes resource *directories* (`localResourceDirs`, `libraryResourceDirs`) — no aapt2, no build. Our resolver must map any project shape onto that.

Approach (P1-G): convention-based root discovery (walk up to `res/`/`Resources/`), sibling source-set enumeration, `inflate.resourceRoots` override, priority chain ending in bundled library + framework res. Explicitly rejected for v1: Gradle tooling API / MSBuild evaluation (violates AD-001's no-build-system rule; slow; heavy). Consequence documented: dependency resources beyond the bundled set don't resolve (warning per P1-B AC4).

### D4 — androidx/Material strategy

Bundled pinned set (FR-2 list): download AARs from Google Maven; extract `classes.jar` → host classpath, `res/` → `libraryResourceDirs`, list package names in `resourcePackageNames`. This mirrors how Paparazzi tests see libraries (test classpath), so the mechanism is proven. Open in Design: exact version set (Material 1.12+?), upgrade cadence policy (per extension release), and whether AppCompat theme-only projects need extra shims.

### D5 — Render protocol & host lifecycle

One host per VS Code window (not per workspace folder); state machine per P1-I AC3; request coalescing latest-wins per document; pre-warm on activation; `tools:`/data-binding preprocessing via shadow-overlay copy of the previewed file (Q3 default) so the on-disk project is never modified.

### D6 — Engine version pinning

Single pinned matrix per extension release: {Paparazzi, layoutlib, framework-resources, androidx set, min JDK}. Initial pin decided (AD-008): Paparazzi 1.3.5 + JDK 17 minimum; M0 confirms the exact layoutlib version 1.3.5 pairs with and whether the layoutlib artifacts (directories we control via system properties) can be bumped independently of Paparazzi. The preview's Android platform version is the pin's, independent of the project (assumption logged). Doctor reports the full pin.

---

## Technical Risks & Mitigations

| # | Risk | Likelihood / Impact | Mitigation |
| - | ---- | ------------------- | ---------- |
| R1 | layoutlib has no stable public API; internals shift between versions | High / High | Pin exact versions per release (D6); wrap all engine access behind one host-internal interface; golden-image corpus (NFR-07) catches behavior drift on every upgrade; never float versions |
| R2 | Paparazzi's `PaparazziSdk`/`Environment` are internal-ish APIs that may churn (2.x is alpha; alpha04+ requires JDK 21) | Medium / High | Same pinning + wrapper; keep the Paparazzi surface we touch minimal (documented list); maintain a fork-ready vendored build path; M0 validates the 1.3.5 pin end-to-end; the 2.x/JDK-21 migration is a planned post-v1 upgrade, not a v1 exposure |
| R3 | Resource-resolution divergence across ecosystems (.axml, `Resources/` casing, flavors, multi-module) breaks renders on real projects | High / Medium | P1-G acceptance corpus includes Gradle multi-module, flavored, .NET modern + legacy-Xamarin fixtures (NFR-07); graceful degradation (P1-G AC4) keeps partial renders useful; `inflate.resourceRoots` escape hatch |
| R4 | Bundled androidx/Material version ≠ project's version → missing attrs/components render wrong | Medium / Medium | Warning with bundled-version name (P1-B AC4); documented limitation; upgrade cadence policy (D4); future opt-in to project artifacts is P3-T's territory |
| R5 | Custom views everywhere in real projects → previews full of placeholders, perceived low value | Medium / Medium | Placeholder shows class name at correct size (AD-007) so structure remains readable; P3-T (opt-in bytecode) is the roadmap answer; docs set expectations |
| R6 | Material-under-layoutlib rendering quirks (shadows, elevation overlays) | Medium / Low | Fidelity bar = Android Studio parity, not device parity (same engine); catalog quirks during M4 corpus work (Q5) |
| R7 | Google Maven artifact availability/layout changes | Low / High | Pinned URLs + checksums; cache means existing users unaffected; CI canary that fetches the pin daily; fallback mirror decision deferred until a failure is observed |
| R8 | Cold-start latency sours first impressions | Medium / Medium | Pre-warm on activation (NFR-01); progress UI with staged messages; keep host resident |
| R9 | State-injection for the state picker turns out not to work inside a layoutlib session (Q2) | Low / Medium | Spike in M0; fallback: re-inflate selector per state (slower but correct) |
| R10 | The pinned 1.3.5 engine line ages (released Nov 2024): its layoutlib renders an older Android platform than current Studio | Medium / Low | Accepted trade-off of AD-008 (JDK-17 reach beats newest-platform fidelity); M0 checks whether layoutlib can be bumped independently; revisit at the first post-v1 upgrade window (JDK 21 migration) |

---

## Internal Milestones (sequencing only — nothing ships publicly before M7, per AD-002)

| M | Content | Proves |
| - | ------- | ------ |
| M0 | Spike on the pinned engine (Paparazzi 1.3.5 / JDK 17 — AD-008): layoutlib pairing + independent-bump check (Q1 residue), state injection (Q2), arbitrary-file render path (Q3), measured download size (Q4). Hello-render: hardcoded LinearLayout → PNG → webview | Architecture viability; resolves remaining open questions |
| M1 | Walking skeleton: extension ↔ host protocol, lifecycle state machine, JDK detection, artifact fetch + checksums, doctor | P1-H, P1-I foundations |
| M2 | Resource resolver: root discovery (both ecosystems), reference kinds, qualifiers, themes, degradation + warnings | P1-G |
| M3 | Framework layout surface + hot reload + error mapping | P1-A, P1-F |
| M4 | androidx/Material bundle + themes + corpus | P1-B (+Q5 catalog) |
| M5 | Drawable surface (all FR-3 types) + state picker + backdrop/size controls | P1-C, P1-D |
| M6 | Config toolbar complete (day/night, devices, density, orientation, persistence) + zoom/pan re-render | P1-E |
| M7 | Hardening: latency targets, golden corpus in CI, docs, marketplace packaging → v1.0 | NFR-01..07 |

---

## Edge Cases

- WHEN the previewed XML's root is not a known layout/drawable element THEN the system SHALL state the detected root and that preview is unsupported for it (no crash).
- WHEN `<include>` chains form a cycle THEN the system SHALL abort inflation of the cycle, render the includer with a placeholder at the cycle point, and warn with the cycle path.
- WHEN a layout exceeds the 4096×4096 px canvas cap at the selected config THEN the system SHALL render clipped with a "canvas capped" notice.
- WHEN the file is deleted or renamed while previewed THEN the panel SHALL show a "file gone" state and release its render session.
- WHEN a `.9.png` has malformed stretch markers THEN the nine-patch preview SHALL fall back to plain-image render with a marker-error warning.
- WHEN fonts are referenced via `@font/` THEN font files present in the resource tree SHALL be used; unresolvable fonts fall back to the platform default with a warning.
- WHEN the previewed file has unsaved changes and hot reload triggers from a dependency save THEN the render SHALL use the previewed file's last-saved content (buffer content only via explicit Refresh — P1-F AC4).
- WHEN two previews of the same file are opened THEN the system SHALL reuse one panel (reveal, not duplicate).
- WHEN the workspace contains no Android resource tree at all THEN single-file mode applies (assumption) with its notice.
- WHEN a style chain contains a missing parent THEN theme application SHALL degrade to the nearest resolvable ancestor and warn.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| LAY-01 framework surface render | P1-A | Design | Pending |
| LAY-02 structural tags (include/merge/ViewStub/fragment) | P1-A | Design | Pending |
| LAY-03 custom-view placeholder + warning | P1-A | Design | Pending |
| LAY-04 data-binding unwrap + tools: preprocessing | P1-A | Design | Pending |
| LAY-05 androidx/Material surface render | P1-B | Design | Pending |
| LAY-06 theme/?attr resolution incl. inheritance | P1-B | Design | Pending |
| LAY-07 AdapterView empty-render | P1-A | Design | Pending |
| DRW-01 vector render (full feature set) | P1-C | Design | Pending |
| DRW-02 shape/layer-list/inset/clip/scale/rotate/level-list | P1-C | Design | Pending |
| DRW-03 selector/ripple render | P1-C/D | Design | Pending |
| DRW-04 animated types static frame + badge | P1-C | Design | Pending |
| DRW-05 nine-patch source render | P1-C | Design | Pending |
| DRW-06 adaptive-icon, color swatch, bitmap | P1-C | Design | Pending |
| DRW-07 state picker + matched-item indicator | P1-D | Design | Pending |
| DRW-08 backdrop/size override controls | P1-C | Design | Pending |
| RES-01 root discovery both ecosystems (.xml/.axml) | P1-G | Design | Pending |
| RES-02 reference-kind resolution chain | P1-G | Design | Pending |
| RES-03 qualifier matching per config | P1-G/E | Design | Pending |
| RES-04 graceful degradation + warnings strip | P1-G | Design | Pending |
| RES-05 resourceRoots setting + multi-module convention | P1-G | Design | Pending |
| CFG-01 day/night toggle | P1-E | Design | Pending |
| CFG-02 device presets + orientation | P1-E | Design | Pending |
| CFG-03 density selection | P1-E | Design | Pending |
| CFG-04 theme picker (project + bundled) | P1-E | Design | Pending |
| CFG-05 per-file config persistence | P1-E | Design | Pending |
| UX-01 open/refresh commands + title button + eligibility sniffing | P1-A | Design | Pending |
| UX-02 hot reload on save + dependency tracking + coalescing | P1-F | Design | Pending |
| UX-03 zoom/pan + crisp re-render | P1-E | Design | Pending |
| UX-04 error panel with line mapping + stale-render retention | P1-A/I | Design | Pending |
| UX-05 warnings strip | P1-A/G | Design | Pending |
| HOST-01 lifecycle state machine + auto-restart + no orphans | P1-I | Design | Pending |
| HOST-02 render queue: serialize, coalesce, stale-discard | P1-F/I | Design | Pending |
| HOST-03 render timeout + crash isolation | P1-I | Design | Pending |
| SETUP-01 JDK detection chain + guided error | P1-H | Design | Pending |
| SETUP-02 artifact fetch + SHA-256 + cache lifecycle | P1-H | Design | Pending |
| SETUP-03 doctor command | P1-H | Design | Pending |
| NFR-01..07 | cross-cutting | Design | Pending |

**Coverage:** 37 requirement IDs + 7 NFRs; all mapped to P1 stories; 0 unmapped. P2/P3 stories intentionally carry no IDs yet (assigned when promoted).

---

## Success Criteria

- [ ] On a clean macOS machine (VS Code + JDK only — no Android Studio, no SDK), install → first successful layout render completes with only guided steps, and afterwards works offline.
- [ ] The golden corpus (≥30 fixtures spanning FR-1/2/3 across Gradle-shaped and .NET-shaped trees) renders in CI with zero errors and pixel-stability within anti-aliasing tolerance.
- [ ] A Material3 production-grade layout (ConstraintLayout + ≥6 Material widget types) renders with visual parity to Android Studio's preview of the same file (manual baseline comparison, documented).
- [ ] Day/night toggle on a night-qualified fixture demonstrably switches resources and theme variants in < 1 s warm.
- [ ] Every drawable type in FR-3 opens and renders from the gallery fixture; selector states switch correctly via the picker.
- [ ] Warm-loop latency targets of NFR-01 met at p90 on a base Apple-Silicon machine.
- [ ] Zero VS Code hangs/crashes attributable to host failures across the corpus + kill-the-host chaos test.

---
---

## UI Polish Fix-Pack (Amendment — 2026-07-26)

> Follow-up fixes to the delivered v1 (NOT a new feature). Requirement IDs `POLISH-01..08` and
> stories `FP-1..FP-5` extend the v1 sets without collision; tasks continue the feature numbering as
> **T61–T68** (phases 11–14) in `tasks.md`. Verifier output is appended to `validation.md` as a
> dated fix-pack section — the v1 PASS record above it is never rewritten.

### Problem Statement

First real-world use of the v1 preview panel surfaced five UX defects: a confusing Backdrop button, a
Size field that silently does nothing for layouts, a transient red error flash on first open, the
rendered image painting **over** the toolbar when it overflows, and an orientation control with no
visible state. This fix-pack polishes the preview panel's toolbar and viewport without touching the
render host or the wire protocol.

**Investigated root causes (2026-07-26, code-verified):**

- **Backdrop** toggles the stage between checkerboard (transparency indicator) and a solid editor
  background; CSS-only. Its state was never persisted (dead ConfigStore plumbing — the webview never
  sends a backdrop change). User decision: remove the button, keep the checkerboard permanently.
- **Size** maps to `RenderRequest.config.drawable.sizeDp`, consumed **only** by
  `DrawableRenderer`/`NinePatchRenderer` — layouts ignore it entirely (canvas = device preset ×
  orientation × density). User decision: remove the field, add drag-to-resize for both document
  kinds. Feasible with zero host changes: the wire carries plain `widthDp`/`heightDp` numbers.
- **Red flash on first open**: the webview contract has `setStatus` but no extension code ever sends
  it, so the panel is blank during the multi-second first-open pipeline (JDK detect → engine
  check/download → JVM host spawn → first render incl. session build); any transient failure paints
  `#errorPanel` red. The scheduler has **no retry** — the observed "renders by itself a few seconds
  later" is an accidental second render (e.g. config-hydration event). Related latent bug: the panel
  queues only the **last** pre-ready message (`PanelEntry.lastMessage` is a single slot), so earlier
  messages (e.g. `setConfig` hydration) are lost when the webview loads slowly.
- **Image over toolbar**: `#preview` is CSS-transformed (`translate(pan) scale(zoom)`) inside
  `#stage`, which has `min-height: 60vh` but **no `overflow: hidden`**; the toolbar creates no
  stacking context. Tall images overflow the body (page scrollbar) and the transformed image paints
  over the toolbar.
- **Orientation** is a `<button>` that flips portrait↔landscape with no visible current state.

### Goals (fix-pack)

- [ ] The preview panel never paints render output outside its stage; the toolbar is always visible
      and operable at any panel size, zoom, and pan.
- [ ] First open shows an in-panel loading indicator with phase text; a red error appears only when
      the operation truly ends in failure.
- [ ] The preview is resizable by dragging its edges — drawables re-render at the dragged dp size,
      layouts re-render at a custom device size — replacing the Size field.
- [ ] Orientation is a dropdown (Portrait/Landscape, default Portrait); the Backdrop button is gone.

### Out of Scope (fix-pack)

| Feature | Reason |
| ------- | ------ |
| Host (Kotlin) or wire-protocol changes | All five fixes are extension/webview-side; `widthDp`/`heightDp`/`sizeDp` already flow |
| Left/top edge drag handles | Right/bottom/corner mirrors Android Studio; keeps gesture disambiguation simple |
| Touch/pinch gestures | v1 targets desktop VS Code; wheel/pointer only |
| Webview screenshot/visual-regression infra | No such harness exists; CSS outcomes get string-level invariants + manual UAT |
| Replacing the download notification toast | The panel additionally mirrors progress; the VS Code notification stays |
| New device presets | Preset list unchanged; only a transient "Custom" entry is added while a drag-size is active |
| Re-opening any v1 requirement | The v1 spec/validation record stands; this amendment covers only POLISH-01..08 |

### Assumptions & Open Questions (fix-pack)

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | --------------- | --------- | ---------- |
| Backdrop button fate | Remove button + all backdrop plumbing; stage permanently checkerboard | User decision after findings (transparency indicator stays) | y |
| Size field fate | Remove; drag-to-resize for both drawables (sizeDp) and layouts (custom device size) | User decision ("resize when the mouse skirts the edges") | y |
| Resize handle zones | 8 px inner band on right edge, bottom edge, and bottom-right corner of the displayed image | Mirrors common preview tools; avoids colliding with pan-drag | n (agent default, logged) |
| Resize clamps | min 16×16 dp; max clamped so rendered px ≤ 4096 (existing canvas cap) at current density × pixelScale | Prevents degenerate/oversized canvases; reuses the UX-03 cap | n (agent default, logged) |
| Live drag behavior | Ghost outline during drag; exactly one re-render on pointerup; pointercancel/Esc aborts with no render | Avoids render storms | n (agent default, logged) |
| Custom device entry | `{id:'custom', label:'Custom (W×H dp)'}`; picking any preset discards the custom size; custom size persists per file (CFG-05 pattern) | Consistent with existing per-file persistence | n (agent default, logged) |
| Retry policy | Host-level failures (spawn/crash/timeout) of the **latest** request retry automatically exactly once; domain errors (`status:'error'`) never retry and are shown when delivered; every failed attempt is logged to the output channel | Deterministic version of the accidental recovery the user observed; domain errors are real content errors | n (agent default, logged) |
| Loading indicator visuals | Small CSS spinner + phase label, theme-colored, replacing the blank stage area (last-good image stays dimmed behind it when present) | Minimal, no new assets | n (agent default, logged) |
| Loading phases | "Preparing render engine…" (+ artifact + % during download), "Starting render host…", "Rendering…" | Matches the real pipeline stages in `prepareRealHost`/`openPreviewFor` | n (agent default, logged) |
| Orientation labels | Dropdown shows "Portrait"/"Landscape"; wire values stay `portrait`/`landscape`; default Portrait | User asked for droplist w/ portrait default; matches Device picker style | y |
| Old persisted `backdrop` fields | Left in workspaceState, ignored on read (no migration) | Harmless; ConfigStore reads named fields only | n (agent default, logged) |
| Webview learns docKind | Via the `setConfig` hydration message (extension classifies; kind is stable per document) | Needed to route a drag to `sizeDp` vs custom device size | n (agent default, logged) |

**Open questions:** none — all resolved or logged above.

### Fix-Pack User Stories

#### FP-1 (P1): Trustworthy first-open feedback ⭐

**User Story**: As a developer opening a layout preview, I want a loading indicator while the engine
prepares/downloads/renders, and an error only when something actually failed, so that I don't see a
scary red message that then fixes itself.

**Why P1**: It's the first impression of every session; the current red flash reads as broken.

**Acceptance Criteria**:

1. WHEN a preview is opened and engine preparation, host start, or a render is in progress THEN the
   panel SHALL display a loading indicator with the current phase text ("Preparing render engine…"
   with artifact + percent during a download, "Starting render host…", "Rendering…") instead of a
   blank stage. (POLISH-02)
2. WHEN a render completes with `status:'ok'` THEN the loading indicator SHALL clear and the image
   SHALL display. (POLISH-02)
3. WHEN a render attempt fails at host level (spawn/crash/timeout) and it is still the document's
   latest request THEN the scheduler SHALL automatically dispatch exactly one retry, the panel SHALL
   keep showing the loading indicator (no error painted), and the failed attempt SHALL be logged to
   the "Inflate" output channel. (POLISH-03)
4. WHEN the automatic retry also fails (or a host-level failure occurs on a request that already
   retried) THEN the panel SHALL show the error exactly as today (red `#errorPanel`, last-good image
   dimmed + stale). (POLISH-03)
5. WHEN a render attempt fails but a newer render for the same document is already pending or in
   flight THEN the panel SHALL NOT paint the error (latest-wins preserved; the newer outcome
   decides). (POLISH-03)
6. WHEN the host returns a domain error (`status:'error'`, e.g. malformed XML) THEN it SHALL be shown
   immediately when delivered — never retried, never suppressed once it is the settled latest
   outcome. (POLISH-03)
7. WHEN messages are posted to a panel before its webview signals `ready` THEN ALL of them SHALL be
   delivered in original order once ready (today only the last survives). (POLISH-04)

**Independent Test**: With the fake host in a fail-once mode, open a preview: spinner phases appear,
no error is ever painted, the image lands. With a fail-always mode: spinner, then exactly one retry,
then the red error.

#### FP-2 (P1): The preview stays inside its stage ⭐

**User Story**: As a developer previewing a big layout, I want the image clipped to its viewport with
pan/zoom to reach every part, so that it never scrolls over the toolbar buttons.

**Why P1**: Painting over the toolbar makes the controls unusable — a correctness bug (user's
screenshot, 2026-07-26).

**Acceptance Criteria**:

1. WHEN the rendered image (at any zoom/pan/panel size) exceeds the stage THEN it SHALL be clipped at
   the stage bounds and SHALL NOT paint over the toolbar, status, warnings, or error strips.
   (POLISH-05)
2. WHEN the webview is any size THEN the page body SHALL NOT scroll (no page-level scrollbars); the
   toolbar SHALL remain visible and clickable at the top. (POLISH-05)
3. WHEN the image is larger than the stage THEN the existing wheel-pan/drag-pan SHALL reach every
   part of the image (clampPan bounds unchanged). (POLISH-05)

**Independent Test**: Open a tall layout in a narrow panel, zoom in, pan up — the image visibly clips
at the toolbar's lower border; all toolbar controls stay clickable.

#### FP-3 (P2): Resize the preview by dragging its edges

**User Story**: As a developer, I want to drag the preview's edges to change the rendered size —
instead of a Size text field that only ever worked for drawables — so that resizing is direct and
works for layouts too.

**Why P2**: Replaces a misleading control with the interaction the user expects (Android
Studio-like), no host changes needed.

**Acceptance Criteria**:

1. The toolbar SHALL NOT contain the Size text field; the drawable State picker keeps working
   unchanged. (POLISH-06)
2. WHEN the pointer is within the 8 px inner band of the displayed image's right edge, bottom edge,
   or bottom-right corner THEN the system SHALL show the matching resize cursor and a pointerdown
   there SHALL start an edge-drag (pan-drag SHALL NOT start). (POLISH-07)
3. WHEN an edge-drag is in progress THEN a ghost outline SHALL track the pointer and NO render
   request SHALL be dispatched until pointerup. (POLISH-07)
4. WHEN an edge-drag ends on a **drawable** preview THEN the system SHALL re-render with
   `drawable.sizeDp` equal to the outline's size converted through the current zoom, density factor,
   and pixelScale, rounded to integer dp and clamped to [16 dp, 4096 px]. (POLISH-07)
5. WHEN an edge-drag ends on a **layout** preview THEN the system SHALL re-render at a custom device
   size (same conversion/clamping), the Device dropdown SHALL show a selected "Custom (W×H dp)"
   entry, and the custom size SHALL persist per file and restore on reopen. (POLISH-07)
6. WHEN a device preset is picked while a custom size is active THEN the preset SHALL replace the
   custom size and the "Custom" entry SHALL disappear from the dropdown. (POLISH-07)
7. WHEN the drag is canceled (pointercancel or Esc) THEN the ghost SHALL disappear and no render
   SHALL be requested. (POLISH-07)
8. WHEN no image is displayed (first load, fileGone, error with no last-good image) THEN no resize
   affordance SHALL appear. (POLISH-07)

**Independent Test**: Drag a layout preview's corner smaller → it re-renders at the smaller size and
Device shows "Custom (…)"; pick "Phone" → custom disappears and the preset size renders.

#### FP-4 (P2): Orientation as a dropdown

**User Story**: As a developer, I want Orientation to be a dropdown showing Portrait/Landscape (like
Device), so that I can see which orientation is active.

**Why P2**: The current button shows no state — the control is unreadable.

**Acceptance Criteria**:

1. The toolbar SHALL show Orientation as a dropdown with exactly two options, "Portrait" and
   "Landscape", replacing the button. (POLISH-08)
2. WHEN a file has no persisted config THEN the dropdown SHALL default to Portrait. (POLISH-08)
3. WHEN the user picks an orientation THEN the system SHALL emit the existing
   `configChanged{orientation}` (re-render), persist it per file, and restore it on reopen —
   identical semantics to today's toggle. (POLISH-08)

**Independent Test**: Pick "Landscape" → render swaps dimensions; reopen the preview → dropdown still
shows Landscape.

#### FP-5 (P3): Simpler toolbar without the Backdrop button

**User Story**: As a developer, I want the transparency checkerboard always on and the Backdrop
button gone, so the toolbar only holds controls that change the render.

**Why P3**: Pure simplification; no information is lost (checkerboard stays).

**Acceptance Criteria**:

1. The toolbar SHALL NOT contain the Backdrop button; the stage background SHALL always be the
   checkerboard. (POLISH-01)
2. The backdrop plumbing SHALL be removed end-to-end (toolbar `Backdrop` type/`toggleBackdrop`/solid
   branch, webview click handler, `HydratedConfig.backdrop`, `StoredPreviewConfig.backdrop` +
   patch field); previously persisted `backdrop` values are ignored harmlessly. (POLISH-01)

**Independent Test**: Open any preview — checkerboard behind transparent regions, no Backdrop button;
reopen — unchanged.

### Edge Cases (fix-pack)

- WHEN a resize drag would cross the 4096 px canvas cap at the current density × pixelScale THEN the
  requested size SHALL clamp (and the existing `canvasCapped` handling stays intact).
- WHEN a resize drag shrinks below 16×16 dp THEN the request SHALL clamp to 16 dp on that axis.
- WHEN a newer user action (save/config/refresh) arrives while an automatic retry is pending or in
  flight THEN latest-wins ordering SHALL hold (the retry result is discarded if stale — existing id
  discipline).
- WHEN the engine download fails (network) THEN the guided error/warning path behaves as today; the
  in-panel indicator SHALL clear to the error state, not spin forever.
- WHEN the density or pixelScale changes while a custom size is active THEN the custom dp dimensions
  SHALL persist unchanged (only px output changes).
- WHEN the warnings strip is expanded with many warnings THEN it SHALL scroll internally rather than
  push the page into body scroll (containment holds).

### Requirement Traceability (fix-pack)

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| POLISH-01 | FP-5: Backdrop removal | Tasks | Pending |
| POLISH-02 | FP-1: Loading indicator + phases | Tasks | Pending |
| POLISH-03 | FP-1: Transient suppression + bounded retry | Tasks | Pending |
| POLISH-04 | FP-1: Pre-ready message queue | Tasks | Pending |
| POLISH-05 | FP-2: Stage containment | Tasks | Pending |
| POLISH-06 | FP-3: Size field removal | Tasks | Pending |
| POLISH-07 | FP-3: Drag-to-resize (drawable sizeDp / layout custom device) | Tasks | Pending |
| POLISH-08 | FP-4: Orientation dropdown | Tasks | Pending |

**ID format:** `POLISH-NN` (extends the v1 id set — LAY/RES/CFG/UX/… — without collision).
**Coverage:** 8 total, 8 mapped to tasks (`tasks.md` amendment, T61–T68), 0 unmapped.

### Success Criteria (fix-pack)

- [ ] Opening a large layout in a narrow panel never paints render output over the toolbar; controls
      stay usable at every zoom/pan.
- [ ] A cold first open shows spinner phases and ends in either an image or a single, final error —
      never a red flash that self-heals.
- [ ] A drawable and a layout can each be resized by edge-drag with one re-render per drag; the Size
      field and Backdrop button are gone; Orientation reads as a dropdown defaulting to Portrait.
- [ ] Extension unit + integration gates green; host and corpus untouched; the v1 sections of this
      file and the v1 `validation.md` PASS record unmodified.

### Defect Amendment (2026-07-26): DF-1 — edge-drag resize never completes (native image drag hijack)

> Found in the first interactive use after fix-pack verification — exactly the real-webview smoke
> test T68's commit recommended (no display was available in the implementation sandbox). Video
> evidence (user recording, 2026-07-26): the resize cursor appears over the edges, then on drag a
> translucent copy of the whole preview follows the pointer with the macOS green "+" copy badge, and
> no re-render ever happens. Fix tasks: **T69–T70 (phase 15)** in `tasks.md`; requirement
> **POLISH-09** below; platform discovery recorded as **AD-018** in `.specs/STATE.md`.

**Root cause (code-verified):** `<img id="preview">` in `panelShellHtml`
(`extension/src/webview.ts:129`) is natively draggable — the HTML default for images; the shell sets
neither `draggable="false"` nor `-webkit-user-drag: none` — and the `#stage` `pointerdown` handler
(`extension/webview-ui/main.ts:363`) never calls `preventDefault()`. On press-and-move Chromium
starts a native HTML5 image drag: that is the translucent full-image ghost in the video. Starting a
native drag cancels the pointer stream (`pointercancel`), and the webview's FP-3 AC7 abort path —
added by T68 and working exactly as specified — hides the resize ghost and discards the gesture. So
the hover cursor works (FP-3 AC2 needs no button press), but a drag can never reach `pointerup`: no
`configChanged` is ever posted. Pan-drag started inside the image dies the same way (masked
day-to-day by wheel-pan). Every automated gate passed because none runs a real Chromium drag
pipeline — jsdom/string-level tests cannot observe browser-native default behaviors (the exact known
gap recorded in STATE.md Handoff "Known accepted gaps" item (3) and T68's commit body).

#### POLISH-09: Native-drag suppression on the gesture surface (restores POLISH-07 end-to-end)

1. The preview image SHALL NOT be natively draggable: `draggable="false"` on `#preview` plus a
   `-webkit-user-drag: none` CSS rule; gestures inside the stage SHALL NOT start text/image
   selection (`user-select: none` on `#stage` and `#preview`). (T69)
2. WHEN a pointerdown starts an edge-drag or a pan-drag THEN the handler SHALL call
   `preventDefault()` and capture the pointer on the stage (`setPointerCapture`), and the page SHALL
   suppress `dragstart` document-wide (`preventDefault()`, belt-and-braces) — so
   `pointermove`/`pointerup` keep flowing for the whole gesture, including outside the webview
   bounds. (T70)
3. WHEN the pointer is released outside the panel mid-drag THEN the edge-drag SHALL complete
   normally (exactly one re-render, ghost cleared — no stuck ghost); Esc/`pointercancel` abort
   semantics (FP-3 AC7) SHALL be unchanged. (T70)
4. Because this defect class is invisible to jsdom/string gates, the fix SHALL be verified by
   string-level shell invariants (suppression attribute + rules present) AND a mandatory interactive
   UAT in a real VS Code webview exercising FP-3's Independent Test, with the evidence recorded in
   the closing commit body. (T69+T70)

**Unchanged:** FP-3's ACs stand as written — this amendment adds the platform preconditions they
implicitly assumed. No wire, host, config-store, or gesture-math change.

## Release & Publish Automation (Amendment — 2026-07-26)

> Final pre-release work on the delivered v1 (NOT a new feature): Marketplace listing content, CI
> trigger policy, and a fully automated release pipeline. Requirement IDs `REL-01..05` extend the
> v1 sets without collision; tasks continue the feature numbering as **T71–T76** (phases 16–18) in
> `tasks.md`. Verifier output is appended to `validation.md` as a dated release-automation section —
> prior PASS records are never rewritten.

### Problem Statement

v1 is complete and verified but cannot ship: there is no Marketplace publisher account, no publish
pipeline, and no Marketplace listing content (`extension/` has no `README.md`/`CHANGELOG.md`, so the
listing page would be empty). CI auto-runs on every PR/push, conflicting with the maintainer's
CI-usage policy, and the `smoke-x64` job spends an Intel runner without exercising any
architecture-specific path (native layoutlib paths live only in `engineTest`/corpus, which it never
runs). The maintainer requires: **zero local commands** in the release flow, one-click publishing,
manual-only CI, and SemVer with automated release notes — without conventional commits (conflicts
with the repo's verb-first commit convention) and without CI-computed versions. **GitVersion was
evaluated and rejected** (2026-07-26): it patches `package.json` at build time (repo version becomes
a placeholder), generates no release notes, adds .NET tooling, and still needs human bump hints
(`+semver:` tokens). **release-please rejected**: requires conventional commits on main.

### Requirements

| ID | Requirement | Acceptance criteria (spec-defined outcomes) |
| -- | ----------- | ------------------------------------------- |
| REL-01 | Marketplace listing content | AC1: `extension/README.md` exists, is packaged (`vsce ls` output contains `README.md`), and covers: what the extension does, feature list, requirements (macOS, JDK 17+), quickstart, settings reference, repo/issues links. AC2: `extension/CHANGELOG.md` exists, is packaged (`vsce ls` contains `CHANGELOG.md`), and has a `1.0.0` section. AC3: `cd extension && npm run package` exits 0. |
| REL-02 | CI runs only on demand | AC1: `ci.yml` `on:` contains exactly `workflow_dispatch` and `workflow_call` — no `push`, no `pull_request`. AC2: the `smoke-x64` job is removed; the remaining gate job runs on `macos-26`. AC3: both triggers accept an optional string input `ref` (default `''`) and every `actions/checkout` step in the gate passes `ref: ${{ inputs.ref }}` (empty ⇒ default-branch behavior). AC4: `canary.yml` keeps `schedule` (daily) + `workflow_dispatch` and its job runs on `macos-26`. |
| REL-03 | Maintainer-only `/run ci` on PRs | AC1: new `run-ci-comment.yml` triggers on `issue_comment` type `created`. AC2: the gate job runs only when ALL hold — comment is on a PR, body starts with `/run ci`, and `comment.author_association` ∈ {OWNER, MEMBER, COLLABORATOR}; fork-PR authors (CONTRIBUTOR / FIRST_TIME_CONTRIBUTOR / NONE) can never trigger it. AC3: the gate is `ci.yml` reused via `workflow_call` with `ref: refs/pull/<PR#>/merge` (tests the merge result). AC4: an ack comment linking the run is posted on the PR. AC5: neither this workflow nor `ci.yml` references `VSCE_PAT`/`OVSX_TOKEN` — publish credentials are unreachable from comment-triggered runs. |
| REL-04 | One-click release pipeline | AC1: new `release.yml` triggers ONLY on `workflow_dispatch` with a required `bump` choice input ∈ {patch, minor, major}. AC2: order is gate → bump → build → publish → record: full gate (reuses `ci.yml`), `npm version <bump>` (no local tag yet), root `npm run package` (host shadowJar + VSIX), `vsce publish --packagePath` authenticated by the `VSCE_PAT` secret, then commit `Release <version>` + tag `v<version>` pushed to the run's branch, then GitHub Release `v<version>` created with `--generate-notes` and the VSIX attached. Marketplace publish precedes the push, so a failed gate/build/publish leaves the branch untouched. AC3: Open VSX publish runs only when the `OVSX_TOKEN` secret is non-empty (shell-level guard; satisfies the v1 "Marketplace + Open VSX" assumption without blocking on the optional account). AC4: `concurrency: release` with `cancel-in-progress: false` serializes releases. AC5: workflow-level `permissions:` grants `contents: write` and nothing broader. |
| REL-05 | Zero-local-command runbook | AC1: `docs/release-checklist.md` gains a dated amendment documenting publisher setup (Microsoft account → Azure DevOps org → PAT with Marketplace→Manage scope over "All accessible organizations" → create publisher at marketplace.visualstudio.com/manage → set the real `publisher` in `extension/package.json` → add `VSCE_PAT` repo secret → optional `OVSX_TOKEN`), the Azure DevOps global-PAT retirement (2026-12-01) with the Entra-credential alternative, and the first release = Release button with bump `major` (0.0.1 → 1.0.0). AC2: `CONTRIBUTING.md` documents the CI policy — no automatic runs; maintainers trigger from the Actions tab or with a `/run ci` PR comment (maintainer/collaborator-only). AC3: `docs/limitations.md` notes Intel Macs are best-effort (no Intel CI leg; users still receive the correct x64 engine artifacts at runtime). |

### Non-Goals

- No repo-settings automation (branch protection, secrets) — GitHub UI steps, documented only.
- No pre-release channel; no GitVersion/release-please adoption.
- No change to the shipped code surface — only packaging metadata, workflows, and docs.

Decisions recorded in `STATE.md` as **AD-019** (release automation model) plus an **AD-004
amendment note** (Intel = best-effort, untested in CI).

## Defect Amendment (2026-07-27): DF-2 — host wedges in 'starting' when startup fails during the first-run engine download

> Found in the first real Marketplace install (v1.0.0, 2026-07-27 ~01:25): the first preview never
> rendered; exthost.log shows `Error: host exited (code=1, signal=null) during startup` twice, and
> the "Inflate" channel shows the placeholder host's stderr (`no render engine configured yet…`)
> looping with `[host] state -> starting`, every render failing
> `cannot render while host state is 'starting'`. Reproduced independently the same day in a
> Devin-driven first-run test with the identical channel signature. A reinstall "fixed" it only
> because the engine cache in `globalStorage` survives uninstall — the second run has no download
> window. Fix tasks: **T77–T82 (phase 19)** in `tasks.md`; requirement **HOST-04** below; discovery
> recorded as **AD-020** in `.specs/STATE.md`. Ships as **patch release 1.0.1** (SemVer: bug fixes
> only — no new capability; release via the REL-04 pipeline with bump `patch`).

**Root cause (code-verified, three layers):**

1. **Stuck state machine (`extension/src/host.ts:263-271`).** When the child dies during startup,
   the `exit` handler rejects the startup promise and `return`s — it never transitions the state
   out of `'starting'` (the `'error'` path at :272-279 has the same gap). The documented state
   machine (host.ts:6-7) has no failure edge out of `starting`. From then on the manager is
   wedged: `pendingReady` is cleared, so every `ensureReady()` falls through the guard and
   re-spawns with **no backoff and no crash accounting**, and every `render()` rejects with
   `cannot render while host state is 'starting'`.
2. **Reconfigure can never land (`extension/src/host.ts:161`).** `reconfigure()` no-ops unless
   state is exactly `'stopped'` — so once wedged (or even merely crashed), the real `java` command
   assembled by `prepareRealHost` is silently discarded forever; the manager keeps the activation
   placeholder (`activation.ts:353-362`: `node -e 'stderr; exit(1)'` — the `code=1` in exthost.log).
3. **The race that arms it (`extension/src/activation.ts:140-181, 394-468`).** During the one-time
   ~170 MB engine download inside `prepareRealHost`, any render trigger (file save/auto-save →
   `notifyFileSaved`; panel refresh; toolbar config change) reaches the scheduler, whose retry path
   calls `hostManager.ensureReady()` directly (`activation.ts:146`) — booting the still-configured
   placeholder mid-download. The placeholder exits 1 → layer 1 wedges the state → layer 2 blocks
   recovery. On a warm cache the configuration window is ~milliseconds, which is why the defect
   only manifests on a true first run.

**Why every gate passed:** `host.test.ts` asserts `ensureReady()` *rejects* on `crash-on-start` but
never asserts the manager's **state after** a failed startup; integration suites run under
`INFLATE_TEST_FAKE_HOST`, which short-circuits `ensureRealHostConfigured` — the placeholder command
and the configuration race are structurally invisible to both suites (same blindness class as
AD-018: the defect lives in a path the harness replaces).

### HOST-04: Startup-failure recovery & first-run configuration gating (restores P1-I resilience on first run)

1. WHEN the host child exits or errors while state is `starting` (startup failure) and the kill was
   not intentional THEN `HostManager` SHALL reject the pending `ensureReady()` with the existing
   readable reason AND transition `starting → crashed` with full crash bookkeeping —
   `getLastCrashReason()` set, crash-window count incremented, backoff auto-restart scheduled. The
   state SHALL NOT remain `'starting'` after a startup failure. The state-machine doc (host.ts
   header) SHALL gain the `starting -> crashed` edge. (T77)
2. WHEN `dispose()`/`restart()` terminates a child mid-startup (intentional kill) THEN no crash
   SHALL be recorded and no auto-restart scheduled — the caller owns the transition, as today. (T77)
3. WHEN `reconfigure()` is called while no live child exists (state `'stopped'` OR `'crashed'`)
   THEN the new command/args/initializeParams/renderTimeoutMs SHALL take effect on the next spawn;
   WHEN a live child exists (`'starting'`/`'ready'`/`'rendering'`) THEN `reconfigure()` SHALL remain
   a no-op. Recovery invariant: startup failure on command A, then `reconfigure(B)`, then
   `ensureReady()` SHALL reach `'ready'` running command B. (T78)
4. WHEN any render path (scheduler dispatch or retry — save, dep-save, refresh, config change)
   needs the host before real-host configuration has completed THEN the extension SHALL await the
   real-host configuration before calling `ensureReady()` — the deferred placeholder command SHALL
   never be spawned by a render path — AND concurrent configuration requests SHALL join a single
   in-flight `prepareRealHost` call (never two concurrent engine installs). A settled (failed)
   configuration attempt SHALL NOT be cached — the next request re-runs it. (T79)
5. WHEN Doctor reports an installed engine cache THEN code-only AARs (AARs shipping no `res/`)
   SHALL be reported `installed` — the per-artifact check SHALL key on the extracted AAR directory
   (its `AndroidManifest.xml`), not on `res/` presence. Cache `ready` remains gated solely by the
   `.complete` marker (unchanged). (T80)
6. First-run outcome (end-to-end): WHEN a user on a cold cache opens a preview and triggers a
   render (e.g. Cmd+S on the layout) while the one-time engine download is still running THEN the
   first preview SHALL still complete successfully after the download — no session-permanent
   `cannot render while host state is 'starting'` wedge. Verified by mandatory interactive UAT
   (clear engine cache → reload window → open preview → save during the download window). (T82)

**Edge cases:**

- WHEN startup fails 4 times within the rolling crash window THEN `manualRestartRequired` SHALL
  latch exactly as for render-time crashes (existing P1-I AC3 semantics, now correctly applied to
  startup failures); `inflate.restartHost` recovers.
- WHEN `prepareRealHost` itself fails (no JDK, offline) THEN the in-flight gate SHALL clear so a
  later attempt re-runs setup; the scheduler path surfaces the failure as a host error on the
  panel (no infinite spin, no placeholder spawn).

**Assumptions (logged per closure gate):**

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Startup failure maps to `'crashed'` (not `'stopped'`) | `handleCrash` path | Reuses crash bookkeeping, stderr-tail reason, backoff auto-restart → self-healing once reconfigure lands | yes (2026-07-27) |
| `reconfigure()` gate | "no live child" (`stopped`/`crashed`) | Original intent was "don't reconfigure a LIVE host"; `crashed` has no child, swap is safe and required for recovery | yes (2026-07-27) |
| Single-flight scope | joins concurrent calls only; no success/failure memoization | `prepareRealHost` is already documented idempotent-and-cheap once configured; failed attempts must retry | yes (2026-07-27) |

### Requirement Traceability (DF-2)

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HOST-04 | P1-I: Failure transparency & resilience | Tasks | Verified — AC1-AC5 via automated gates (T77-T80), AC6 via interactive UAT (T82, 2026-07-27, Devin-driven install of `inflate-1.0.0.vsix` against `fixtures/gradle-sample`: save during the live engine download, host recovered and rendered in the same session); pending the closing Verifier pass |

**Unchanged:** HOST-01/02/03 and P1-I's ACs stand as written — this amendment adds the missing
`starting`-failure edge and the first-run configuration gate they implicitly assumed. No wire
protocol, host-side (JVM), scheduler, or webview change.

## Defect Amendment (2026-07-27): DF-3 — `/run ci` ack fails 403 and the gate is invisible on the PR

> Found in the first live `/run ci` use (PR #1, run 30284080541, 2026-07-27): the guard accepted the
> comment and the gate ran, but the ack job died with `gh: Resource not accessible by integration
> (HTTP 403)` — a live violation of REL-03 AC4 — and the PR itself showed nothing (no pending, no
> green/red): the run is only discoverable from the Actions tab. Flipping the repo-level "Read and
> write permissions" toggle did not (and cannot) fix the 403 — the workflow declares explicit
> `permissions:`, which replaces the repo default entirely. Fix tasks: **T83+ (phase 20)** in
> `tasks.md` (created on spec approval); requirement **REL-06** below; user decisions captured in
> `context.md` ("CI Comment Pipeline Context (Amendment — 2026-07-27)"). **Ships by merging to
> `main`** — `issue_comment` workflows execute from the default branch; the VSIX is untouched, so no
> Marketplace release and no version bump are involved (unlike DF-2's 1.0.1).

**Root cause (both symptoms verified against live logs + GitHub docs, 2026-07-27):**

1. **Ack 403 — wrong token permission for a PR conversation comment
   (`run-ci-comment.yml:42-43`).** The ack job grants `issues: write` only. PR conversation
   comments are indeed created via the issues REST endpoint
   (`POST /repos/{owner}/{repo}/issues/{n}/comments`), but GitHub permission-checks the endpoint
   against the **target resource**: commenting on a PR requires `pull-requests: write`;
   `issues: write` covers only true issues. The workflow's own inline comment ("PR conversation
   comments use the issues API") described the endpoint correctly and the permission incorrectly.
   Evidence: the failing run had `issues: write` in place, and the guard restricts the job to PR
   comments only — the 403 is fully explained.
2. **No PR status — `issue_comment` runs attach to the default branch, not the PR.** For
   `issue_comment` events, `GITHUB_SHA` is the last commit on the default branch, so the run and
   its checks associate with `main` — nothing links them to the PR head, and the PR checks area
   stays empty by design. The established pattern for comment-triggered CI is explicit **commit
   statuses on the PR head SHA** (`POST /repos/{owner}/{repo}/statuses/{sha}`, `statuses: write`):
   pending when the run is accepted, success/failure when the gate concludes, `target_url` = the
   run. That is exactly what standard `pull_request`-triggered CI feedback looks like on a PR.

### REL-06: PR-visible gate status & working ack (completes REL-03's PR feedback loop)

1. WHEN a guard-passing `/run ci` comment is accepted THEN the ack comment (REL-03 AC4, unchanged
   wording) SHALL post successfully — the posting job's token SHALL carry `pull-requests: write`
   (replacing `issues: write`; the job posts only to PRs by guard construction).
2. WHEN the run is accepted THEN the workflow SHALL resolve the PR head SHA **once, at accept
   time**, and set commit status context **`full-gate`** to `pending` on that SHA with
   `target_url` = this run's URL (`statuses: write`).
3. WHEN the gate concludes THEN a reporting job (`needs: [accept, gate]` — accept is a dependency
   too, so the job can read its captured `head_sha` output; `if: always()`) SHALL set the same
   context on the same captured SHA to `success` (gate success) or `failure` (gate failure,
   including a merge-ref checkout failure on a conflicted PR). Ack/accept-step failures SHALL never
   block the gate or the final status (job independence, extending REL-03's ack/gate separation).
4. WHEN the run is cancelled (manual, or superseded via the existing per-PR concurrency group) THEN
   that run SHALL NOT write a final status — a superseding run re-sets `pending` on the same
   context+SHA; a manual cancel with no successor leaves `pending` (documented, self-heals on the
   next `/run ci`).
5. Security invariants: the REL-03 guard triple (PR + `/run ci` prefix + author_association ∈
   {OWNER, MEMBER, COLLABORATOR}) SHALL remain on every job (user decision 2026-07-27: scope
   unchanged); jobs holding `pull-requests: write`/`statuses: write` SHALL contain no checkout and
   execute no PR code; the gate job SHALL keep `contents: read` and nothing broader; publish
   secrets stay unreachable (REL-03 AC5 unchanged); `ci.yml` itself SHALL NOT change (release/canary
   callers unaffected).
6. Required check (user decision 2026-07-27): `full-gate` SHALL become a **required status check on
   `main` via a repository ruleset** whose bypass list carries the **GitHub Actions app** (so
   `release.yml`'s direct `Release <v>` push keeps working — required checks block direct pushes
   too) and **Repository admin** (maintainer direct pushes, today's practice). Strict "require
   branches to be up to date" stays OFF (each base move would demand a fresh paid macOS run).
   Configured as manual UI steps documented in the runbook — AD-019's "no repo-settings automation"
   non-goal stands.

**Edge cases:**

- WHEN a commit is pushed between the comment and the accept step THEN statuses land on the SHA
  captured at accept; the newer head shows no status, and under the required check a stale green on
  an older SHA can never unlock a merge (protection keys on the latest head).
- WHEN the accept step's API calls fail THEN that run produces no statuses; the gate still runs and
  the failure is visible in the Actions log (same posture as an ack failure).
- WHEN `/run ci` is commented on the PR that carries THIS fix THEN the **old** workflow still
  governs it (`issue_comment` executes the default-branch definition) — the ack still 403s and no
  status appears; expected, see rollout below.

**Rollout & live verification (ordered — workflow YAML has no local runtime, AD-019):**

1. Merge this amendment's PR (the old pipeline governs its own `/run ci`; the YAML change is gated
   by parse/structural checks + review).
2. On the next PR: comment `/run ci` → verify live: ack posts (no 403), `full-gate` pending appears
   in the PR checks area, final status matches the gate result. These are REL-06's live ACs.
3. Only then create the ruleset (the context has now been reported once and is selectable):
   required status check `full-gate`, bypass = GitHub Actions app + Repository admin, strict
   up-to-date OFF. Runbook amendment documents the exact clicks.
4. The next release proves the bypass (recovery for a blocked push is already documented in
   `release.yml`'s header — publish-before-push). Fallback if the `github-actions` app cannot be
   added to the bypass list (availability of that picker entry is **flagged uncertain**): keep
   Repository-admin bypass and switch `release.yml`'s push step to an owner fine-grained PAT
   (new secret) — documented in the runbook, applied only if needed.

**Assumptions (logged per closure gate):**

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Status mechanism | Commit statuses API, not check runs | Check runs created with the Actions `GITHUB_TOKEN` attach to the creating run's own check suite (known limitation); statuses have none of that and full required-check parity | agent default (2026-07-27) |
| Status context | Single rollup context `full-gate` | Mirrors `ci.yml`'s single gate job 1:1; the string is what branch protection keys on, so it must stay stable | agent default (2026-07-27) |
| Ack permission | `pull-requests: write` replaces `issues: write` (not both) | Endpoint is dual-listed (Issues/Pull requests) but the check follows the target resource, always a PR here; step 2 of rollout live-verifies | agent default (2026-07-27) |
| Status target | PR **head** SHA (gate still tests `refs/pull/<N>/merge`) | The PR checks UI and branch protection key on the head commit — identical to how `pull_request`-triggered CI reports | agent default (2026-07-27) |
| Trigger scope | Guard unchanged: OWNER/MEMBER/COLLABORATOR | User decision 2026-07-27 — collaborators can already push code, so no added exposure; fork-PR authors remain excluded | user (2026-07-27) |
| Merge gating | Required check via ruleset + bypass list | User decision 2026-07-27 — "everything flows normally"; bypass keeps AD-019's release push and admin direct pushes alive | user (2026-07-27) |
| Result feedback | Statuses only; ack stays; no completion comment | User decision 2026-07-27 — the status flip is the result signal, no extra PR noise | user (2026-07-27) |

### Requirement Traceability (DF-3)

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| REL-06 | REL-03: Maintainer-only `/run ci` on PRs | Spec | Implemented (T83–T87, phase 20) — pending live verification (rollout steps 2–4, post-merge) |

**Unchanged:** REL-01..05 stand as written — this amendment fixes REL-03 AC4's live failure and adds
the PR-side visibility REL-03 never specified. The AD-019 security model is untouched: guard,
default-branch workflow execution, publish-secret isolation, per-PR concurrency group, and the
gate's read-only token all stay exactly as verified.

## Defect Amendment (2026-07-28): DF-4 — root layout params ignored: every layout preview fills the whole device canvas

> Found in real-world use (2026-07-28): a user compared Inflate side-by-side with Android Studio on
> two production ConstraintLayouts (a .NET Android app). Both roots declare
> `android:layout_height="wrap_content"` (one also `layout_marginHorizontal="16dp"` +
> `layout_marginTop="16dp"`). Android Studio renders the card wrapped to its content, inset by its
> margins; Inflate stretches it over the entire device canvas. The second screenshot shows the
> knock-on effect: a child constrained `top_toBottomOf` a sibling AND `bottom_toBottomOf="parent"`
> floats vertically centered in the stretched space instead of sitting right below the sibling
> inside the wrapped bounds. Every layout preview since v1.0.0 is affected the same way — the
> defect is systematic, not layout-specific. Fix tasks: **T89–T94 (phase 21)** in `tasks.md`
> ("Layout Root Params Fix Tasks", approved 2026-07-28, **executed and complete 2026-07-29**);
> requirement **LAY-08** below; discovery recorded as **AD-022** in `.specs/STATE.md`. Ships as
> **patch release 1.0.2** (new CHANGELOG `## 1.0.2` section; SemVer: bug fix, no new capability;
> REL-04 pipeline, bump `patch` — 1.0.1 already shipped).

**Root cause (code-verified down to the pinned engine's bytecode):**

1. **Root LayoutParams are never generated (`host/src/main/kotlin/engine/EngineAdapter.kt:290`).**
   `inflateOrNull` calls `layoutInflater.inflate(layoutId, null)`. With a null parent, Android's
   `LayoutInflater` never calls `generateLayoutParams(attrs)`, so the root element's
   `layout_width`/`layout_height`/`layout_margin*`/`layout_gravity` are silently discarded — the
   inflated root carries **null LayoutParams**. (The classic Android null-parent inflate pitfall,
   on our live render path.)
2. **Paparazzi then defaults them to full-bleed (pinned 1.3.5 sources, `PaparazziSdk.kt:291`).**
   `takeSnapshots` adds the view via single-arg `viewGroup.addView(modifiedView)` to the session
   content root — a `match_parent`×`match_parent` `FrameLayout` under `RenderingMode.NORMAL`
   (`contentRoot()`, `PaparazziSdk.kt:616-621`). Single-arg `addView` keeps a child's existing
   LayoutParams but falls back to `generateDefaultLayoutParams()` for a null-params child — for
   FrameLayout that is **MATCH_PARENT×MATCH_PARENT**. Net: every previewed root is stretched to
   the full canvas, margins dropped.
3. **Android Studio does not have this defect by construction (layoutlib 14.0.11 bytecode,
   `RenderSessionImpl`).** Studio inflates the previewed XML *as* the session content —
   `BridgeInflater.inflate(mBlockParser, mContentRoot)` with `mContentRoot` an
   `android.widget.FrameLayout` — so `FrameLayout.LayoutParams` (width/height/margins/gravity) are
   generated from the root element's own attributes. Honoring root params via a FrameLayout parent
   IS the Studio behavior, not an approximation of it.

**Why every gate passed:** corpus goldens are generated by this same engine, so a systematic
geometry bias reproduces itself in the reference images — 42/42 stayed green while every
non-`match_parent` root rendered wrong; no engineTest asserts the *bounds* of the inflated root or
the transparency of uncovered canvas. A bias this uniform is invisible to self-referential gates;
the first divergence report had to come from a human comparing against Android Studio.

### LAY-08: Previewed root's layout params honored (restores P1-A AC2 fidelity at the root element)

1. WHEN a layout is inflated for preview THEN the engine SHALL generate the root view's
   LayoutParams from the root element's own attributes against a `FrameLayout` parent
   (`inflate(layoutId, parent, attachToRoot=false)` semantics — Studio's content-frame
   equivalent): `wrap_content` SHALL wrap to measured content, a fixed dp size SHALL measure at
   that size, and `match_parent` SHALL keep filling the canvas exactly as today.
2. WHEN the root element declares margins (`layout_margin`, per-edge, `layout_marginHorizontal`/
   `Vertical`, `Start`/`End`) THEN they SHALL inset the root within the device canvas,
   density-scaled, matching FrameLayout child semantics.
3. WHEN the root element declares `layout_gravity` THEN it SHALL position the root within the
   canvas per FrameLayout child semantics; absent, the default SHALL be top|start (Studio parity).
4. Canvas contract unchanged: the PNG SHALL remain device-config-sized (`RenderingMode.NORMAL`,
   `useDeviceResolution`); canvas not covered by the root SHALL show the resolved theme's
   `windowBackground`/`colorBackground` — Studio-parity (**amended 2026-07-28, mid-execution
   correction**: engine-verified during T89 that `decor=false` only suppresses system chrome via
   `SessionParams.setForceNoDecor()`, NOT window-background painting — Bridge paints the theme
   background onto the content root regardless, confirmed by swapping a dark vs. light framework
   theme and observing the exact `background_material_dark`/`_light` colors show through; the
   original "stays transparent" assumption was factually wrong, see the amendment note below);
   `imageWidth`/`imageHeight` and the wire protocol SHALL NOT change.
5. WHEN the root element lacks `layout_width` or `layout_height` (mid-edit state) THEN the render
   SHALL still complete with status `ok` using the pinned engine's native missing-dimension
   handling (bytecode-verified: `BridgeTypedArray.getLayoutDimension` logs "You must supply a …
   attribute." and returns **0 px** for that axis) — no render error, no host crash.
6. Scope guard: the new param generation SHALL apply only to layout-by-id inflation
   (`LayoutRenderer`, and the M0 `HelloRender` probe which shares `inflate`). A `<merge>` root
   SHALL keep filling the canvas (its Structural wrapper already declares explicit
   `match_parent`×`match_parent` — correct Android semantics, P1-A AC4 unchanged). Drawable,
   color, and nine-patch rendering paths (host-built views, `configureRender` SHRINK/NORMAL) SHALL
   be behavior-identical.
7. End-to-end outcome (the reported shapes): a fixture modeled on each reported layout —
   (a) root `match_parent`×`wrap_content` with `layout_marginHorizontal="16dp"` +
   `layout_marginTop="16dp"`, background, and padding; (b) root `match_parent`×`wrap_content`
   containing a child constrained `top_toBottomOf` a sibling AND `bottom_toBottomOf="parent"` —
   SHALL render top-anchored with the declared margins showing the resolved theme background as
   insets, the wrapped height strictly less than the device height (pixels below the wrapped
   bounds showing the resolved theme background, not the root's own background), and (b)'s
   bottom-constrained child laid out inside the wrapped bounds directly below its sibling, not
   vertically centered in the device.

**Edge cases:**

- WHEN the previewed file is a data-binding layout (`<layout>` root, LAY-04 unwrap) THEN the
  unwrapped inner root's layout params SHALL be honored (the inner root becomes the overlay root
  the engine inflates — no extra handling).
- WHEN `tools:` overrides target root layout attributes THEN the promoted values govern (existing
  ToolsAttributes preprocessing runs before inflation — unchanged, now actually visible).
- WHEN the root's fixed size exceeds the device canvas THEN existing NORMAL-mode measure semantics
  and the MAX_CANVAS_PX clip apply unchanged.
- WHEN the root uses `layout_marginStart`/`End` under an RTL config THEN resolution follows
  framework MarginLayoutParams semantics (no Inflate-side handling).

**Assumptions (logged per closure gate):**

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Param-generation parent | `FrameLayout(context)`, `attachToRoot=false` | Matches BOTH Studio's content frame (`RenderSessionImpl.mContentRoot`) and Paparazzi's snapshot host; single-arg `addView` preserves pre-set params (1.3.5 source-verified); `removeAllViews()` in its `finally` keeps the throwaway parent leak-free | yes (2026-07-28, spec approval) |
| Uncovered canvas rendering | shows the resolved theme's `windowBackground`/`colorBackground` (Studio-parity) | **Amended 2026-07-28 (mid-execution correction, T89):** originally assumed to stay transparent on the premise that Inflate's `decor=false` disables windowBackground painting entirely — engine-verified FALSE: `decor=false` only maps to `SessionParams.setForceNoDecor()` (suppresses system chrome — status/nav bar — not window-background painting); Bridge paints the resolved theme's background onto the content root regardless (confirmed: a dark framework theme painted exactly `#FF303030` = `background_material_dark`, a light one exactly `#FFFAFAFA` = `background_material_light`, tracking the theme precisely). Forcing genuine transparency would require reaching into Bridge internals beyond the AD-009 friend-paths surface — new engineering outside T89's scope. Accepting the theme background is MORE faithful to Studio (which the spec's own root-cause section already documents as painting `windowBackground` there), not less | yes (2026-07-28, user decision after the T89 discovery superseding the original spec-approval assumption) |
| Canvas size for layouts | stays device-sized (no SHRINK-to-content) | Studio's design surface shows the full device frame with the layout wrapped inside it — that IS the fidelity target; drawables keep their existing SHRINK path | yes (2026-07-28, spec approval) |
| Missing root dimension behavior | engine-native: warning log + 0 px axis | Bytecode-verified pinned-engine behavior = Studio behavior on the same engine line; degenerate mid-edit input self-heals on the next keystroke; no custom fallback code to maintain | yes (2026-07-28, spec approval) |
| Corpus goldens | regenerate affected goldens, human-review each diff | Goldens encoded the defect; every diff must be explainable by root-param honoring alone — any other change is a regression | yes (2026-07-28, spec approval) |

**Verification note:** corpus goldens whose layout roots are not `match_parent`×`match_parent` WILL
change — regeneration with per-image review is part of the fix tasks, not a side effect. The
regression engineTests assert pixels (alpha of uncovered canvas, margin insets, wrapped-bounds
child positions), the class of assertion the original gates never made.

### Requirement Traceability (DF-4)

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| LAY-08 | P1-A: Preview a framework-widget layout | ✅ Verified | T89–T94 (phase 21) complete 2026-07-29; Verifier PASS 2026-07-29 (`validation.md`, "Layout Root Params Fix Verification"); ships as 1.0.2 (AD-022) |

**Unchanged:** LAY-01..07 and P1-A's ACs stand as written — this amendment closes the gap between
P1-A AC2's "measure/layout results identical to layoutlib's output" and the engine adapter feeding
layoutlib defaulted root params. Placeholder visual styling for custom views (screenshot 2's
InfoMessageCard box color/position within its size) remains the AD-007/AD-013 accepted limitation —
its mis-*position* was this defect and is covered by LAY-08 AC7. No wire protocol, extension-side,
scheduler, or webview change; drawable rendering untouched.

---

## Defect Amendment (2026-07-29): DF-5 — UTF-8 BOM'd XML files fail to preview ("PI must not start with xml")

> Found in real-world use (2026-07-29): a user opened a production `RelativeLayout` (pt-BR Android
> app: toolbar `<include>`, a ScrollView list, a FAB `<include>`) and got an empty preview with the
> error strip `PI must not start with xml (position:unknown ﻿@1:5 in java.io.StringReader@…)
> (line 1:5)`. The file on disk starts with the UTF-8 byte-order mark (`EF BB BF`) — the exception's
> own position echo contains the raw U+FEFF (visible as an invisible character in the report), and
> `@1:5` is exactly one column right of where a document-start `<?xml` is accepted. A leading BOM is
> **valid XML** (the spec requires processors to accept and discard it; the Android toolchain and
> Studio handle such files), so this is an Inflate-only fidelity gap on every non-dirty render.
> Fix tasks: **T95–T98 (phase 22)** in `tasks.md` ("BOM Ingestion Fix Tasks", drafted 2026-07-29,
> **approved by the user 2026-07-29**); requirement **HOST-05** below; discovery to be recorded as **AD-023** in
> `.specs/STATE.md` at close-out (T98). Ships as **patch release 1.0.3** (SemVer: bug fix, no new
> capability; REL-04 pipeline, bump `patch` — 1.0.2 already shipped).
>
> The reported file ALSO contains a genuine well-formedness error the BOM failure currently masks —
> a stray `a` after `android:layout_width="match_parent"` on the ScrollView's inner `LinearLayout`.
> After this fix that exact file errors truthfully at that line until the stray character is
> removed; a BOM'd file without it renders. AC2 pins this.

**Root cause (code-verified down to the pinned parser's jar):**

1. **Ingestion keeps the BOM.** Only `refresh` (dirty-buffer) renders carry `inlineContent`
   (`extension/src/scheduler.ts:232`); every `save`/`depSave`/`config`/`reopen` render makes the
   host read disk bytes — `docFile.readText()` at `host/src/main/kotlin/render/LayoutRenderer.kt:58`
   and `render/DrawableRenderer.kt:78`. The JDK's UTF-8 decoder deliberately does not strip a BOM
   (JDK-4508058, wontfix), so the content string begins with U+FEFF.
2. **kxml2's Reader path rejects the shifted declaration.** `Preprocessor.validate`
   (`preprocess/Preprocessor.kt:112-125`) feeds the string via `StringReader` to `KXmlParser` — the
   one parser entry with **no BOM handling** (the byte-level `setInput(InputStream)` path sniffs and
   skips BOMs; the Reader path cannot). kxml2 accepts the `<?xml …?>` declaration only at the
   absolute start of input; anything before it — even the single BOM code point — demotes it to an
   ordinary processing instruction, and PI targets starting with `xml` are illegal →
   `PI must not start with xml` thrown at `@1:5` (`net.sf.kxml:kxml2:2.3.0` from the pinned engine
   closure — error string verified in the cached jar's `KXmlParser.class`, and the thrown position
   matches the report exactly, BOM echo included).
3. **The truthful-error contract breaks with it.** The exception surfaces through the UX-04 syntax
   path as a `RenderError` at line 1:5 — a misleading message about a file that is, per the XML
   spec, perfectly valid. Flip-flop symptom: typing momentarily heals the preview (VS Code decodes
   the BOM away from the editor buffer, and `refresh` sends that buffer inline), then the next
   save/reopen re-reads the BOM'd bytes and fails again.
4. **Silent secondary casualty.** `MaterialAttrCheck.unknownAttrs(content)`
   (`render/LayoutRenderer.kt:139`) parses the same raw string, catches the same exception
   internally, and returns an empty list — so P1-B AC4's unknown-res-auto-attribute warnings are
   silently dropped for BOM'd files too. The same single strip fixes it (the check runs off the
   ingested string, before preprocessing). Site inventory (evidence, not assumption): no other
   host `readText`/`readBytes` call ingests user XML — `LayoutRenderer.kt:120` re-reads the
   host-written overlay (BOM-free by construction once ingestion strips), `Structural.kt:104` is a
   regex-only include-graph walk (position-independent, BOM-harmless), `EngineFetcher` reads a
   non-XML sidecar, `FrameworkDelegateGenerator` reads jar bytes.

**Why every gate passed:** a byte-scan of the repo (2026-07-29) finds **zero** fixture/corpus XML
files beginning with `EF BB BF`; host unit tests feed Kotlin string literals; the 42/42 corpus is
self-referentially BOM-free. No gate ever ingested a BOM — the first divergence had to come from a
real-world tree. BOM'd resource XML is common in legacy Windows-authored projects — squarely the
AD-001 .NET/Xamarin audience.

### HOST-05: Render ingestion strips a leading UTF-8 BOM (restores P1-A/P1-C preview of BOM'd files and UX-04 error truthfulness)

1. WHEN either XML render executor ingests previewed content (layout or drawable/color path;
   `inlineContent` or the disk fallback) THEN the host SHALL strip exactly one leading U+FEFF
   before ANY downstream consumer (well-formedness validation, `MaterialAttrCheck`, every
   preprocessing stage, the overlay write), and a valid file differing from a BOM-less twin only by
   the leading BOM SHALL render status `ok` with a byte-identical PNG.
2. WHEN a BOM'd file contains a genuine XML syntax error THEN the surfaced error SHALL be that real
   error at its real 1-based line/column (UX-04 contract) — never the
   `PI must not start with xml … @1:5` artifact. (Covers the reporting file's stray `a` after
   `android:layout_width="match_parent"`: truthful error at that line until corrected.)
3. WHEN the previewed layout `<include>`s an on-disk layout file that itself starts with a BOM THEN
   the render SHALL complete with the included content rendered — the engine parses on-disk
   resource files through kxml2's byte-level `InputStream` path, which auto-detects BOMs (pinned by
   an engineTest against the real Bridge, not assumed) — and Structural's include-graph walk (cycle
   detection, regex-based) SHALL be unaffected.
4. WHEN ingested content has no leading BOM THEN ingestion SHALL be an identity pass-through — a
   U+FEFF at any position other than offset 0 is document content (zero-width no-break space) and
   SHALL NOT be altered; the corpus SHALL stay 42/42 with zero golden byte-diffs and zero existing
   assertion changes.
5. WHEN a BOM'd layout uses a res-auto attribute unknown to the bundled Material closure THEN the
   P1-B AC4 warning SHALL be emitted exactly as for its BOM-less twin (pins the strip point AHEAD
   of `MaterialAttrCheck`, whose malformed-XML catch currently swallows those warnings).

**Edge cases:**

- WHEN the file is only a BOM (or BOM + whitespace) THEN the render SHALL error with the existing
  empty/invalid-document message — accurate, not the PI artifact.
- WHEN a file pathologically starts with more than one U+FEFF THEN exactly one SHALL be stripped;
  the remainder is content and errors accurately (strict-parser behavior; Studio errors there too).
- UTF-16/UTF-32 encoded files: out of scope — ingestion is UTF-8 (`readText()`); such files fail
  today for unrelated decoding reasons and are unchanged by this amendment.
- `.axml` files take the same shared ingestion path — the strip applies identically (AD-001 tree
  parity).
- Nine-patch previews: N/A — PNG bytes, no XML ingestion.

**Assumptions (logged per closure gate):**

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Strip location | exactly one leading U+FEFF, at the two executor ingestion lines (`LayoutRenderer.kt:58`, `DrawableRenderer.kt:78`), via a named shared helper (`preprocess/Bom.kt`) | the single choke point ahead of EVERY consumer including the pre-preprocess `MaterialAttrCheck` (a Preprocessor-internal strip would leave the AC5 warning gap); applies to `inlineContent` too, removing any reliance on editor behavior | yes (2026-07-29, spec approval) |
| No extension-side change | none — host-only fix | VS Code decodes the BOM away from editor buffers (its `utf8bom` handling re-adds it only on save), and `classifier.ts`'s root-element sniff regex is position-independent, so classification never breaks; the host strip defensively covers any inline BOM regardless | yes (2026-07-29, spec approval) |
| Engine-side include parsing needs no code change | none expected | kxml2's `setInput(InputStream)` byte-sniffs BOMs (public 2.3.0 source; only the Reader path is BOM-blind) — AC3's engineTest pins this against the pinned Bridge instead of assuming; if it proves false, STOP: user files are never rewritten (design Q3), so the include fix shape returns to spec | yes (2026-07-29, spec approval) |
| Corpus goldens | zero changed goldens expected (42/42 byte-identical) | the strip is identity for BOM-free input; asserted as an outcome at every gate, never assumed | yes (2026-07-29, spec approval) |
| Release vehicle | patch 1.0.3 via REL-04 (bump `patch`) | pure bug fix, no new capability; 1.0.2 already shipped | yes (2026-07-29, spec approval) |

**Verification note:** the new engineTests must be RED before the production change lands (the
executor records the pre-fix failure reproducing the exact reported error). Discrimination
candidates for the Verifier: (a) remove the ingestion strip — the AC1/AC2/AC5 tests must go red
with the PI artifact; (b) relocate the strip inside `Preprocessor.preprocess` — the AC5
warning-parity test alone must kill it; (c) defang a BOM fixture (strip its bytes) — every BOM
fixture carries an in-test byte-integrity guard (first 3 bytes `EF BB BF`) so a future
editor/formatter pass cannot silently neutralize the suite.

### Requirement Traceability (DF-5)

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HOST-05 | P1-A + P1-C (shared executor ingestion), in service of P1-I/UX-04 error truthfulness | Done | Implemented (T95–T98, phase 22, 2026-07-29) — `dead0a6`/`05a81fe`/`e4154a9` + close-out; recorded as **AD-023**; ships as patch **1.0.3** on release |

**Unchanged:** UX-04's error contract stands as written — this amendment makes it truthful for
BOM'd files (the error reported is now the file's real problem, or none). LAY-01..08, DRW-*, RES-*
and both preview stories' ACs are untouched; no wire protocol, extension-side, scheduler, webview,
or classifier change; overlay naming/writing untouched (overlays are written from the stripped
string — they were never BOM'd, since validation failed first).
