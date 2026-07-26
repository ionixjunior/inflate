# android-xml-preview Context

**Gathered:** 2026-07-19
**Spec:** `.specs/features/android-xml-preview/spec.md`
**Status:** Ready for design — spec confirmed 2026-07-19 (assumptions reviewed; engine pinned per AD-008)
**Amendment:** UI Polish fix-pack context gathered 2026-07-26 — see the amendment section at the end of this file.

---

## Feature Boundary

A VS Code extension ("Inflate") that renders faithful previews of Android layout XML and drawable XML directly in the editor — powered by layoutlib (Android Studio's rendering engine) in a headless JVM subprocess — for any project using the standard Android XML schema (native Gradle and .NET Android alike), with no Android Studio and no Android SDK installed. Preview-only: no visual editing, no Compose, no build-system integration.

---

## Implementation Decisions

### Audience & release shape

- Both ecosystems (Gradle and .NET Android) are equal-priority at launch; neither is "the port".
- The first public release is complete — all supported layouts and all drawable types render. The MVP framing from the original brief was explicitly retracted by the user ("the first deliverable needs to render all the things"). Thin slices exist only as internal milestones (M0–M7).
- v1 targets macOS (arm64 + x64) only; Windows/Linux are fast-follows (user selected only macOS in the platform question).

### Machine dependencies

- Require a preinstalled JDK; detect it automatically (settings override → JAVA_HOME → PATH → platform-standard locations); guided setup message when absent. Never download or bundle a JVM. (User asked "is it possible to require preinstalled JDK but try to detect it automatically?" — answered yes; adopted.)

### Rendering engine

- Unified engine (AD-005): every preview goes through the layoutlib host in v1; the drawable SVG fast path is deferred to P2 behind a reserved routing seam. (Agent decision grounded in user's completeness requirement + verified research; documented with full trade-off table in spec §D1.)

### Custom / unknown views

- Labeled placeholder box (class name, sized by layout params). No project bytecode loading in v1; host protocol reserves a classpath slot for a future opt-in (P3-T).

### Stateful & animated drawables

- Static rendering plus a toolbar state picker (default/pressed/checked/disabled/focused/selected/activated) for selector/ripple/animated-selector. Animated types show their initial frame with a "static preview" badge. Playback is P3.

### Preview interactivity

- Static image with zoom/pan and a config toolbar: day/night, device preset, orientation, density, theme picker, drawable state, backdrop/size controls. Click-to-source is P2; full inspector is P3.

### Agent's Discretion

Areas where the user gave direction but left specifics to the agent (encoded as reviewable assumptions in the spec):

- `tools:` attribute core set and preprocessing approach
- Data-binding unwrap behavior and expression defaults
- AdapterView empty-render default; level-drawable 50% default; adaptive-icon circular mask
- Hot-reload trigger set (save + dependency saves + manual refresh; on-type = P2 default-off)
- Theme default chain, config persistence, single-file mode, device-preset list
- Latency targets, cache management, license (Apache-2.0). The engine pin was elevated to a user decision: Paparazzi 1.3.5 + JDK 17 minimum (AD-008)

### Declined / Undiscussed Gray Areas → Assumptions

None declined. Gray areas not explicitly asked about were converted to the Assumptions table in spec.md (all marked Confirmed? = n, reviewable at spec confirmation).

---

## Specific References

- Fidelity bar: "matches Android Studio's preview" (same engine, layoutlib) — not "matches physical device".
- Architectural precedent the user named: layoutlib via Paparazzi (Cash App) as a headless process; validated by research (PaparazziSdk usable without the Gradle plugin; Google Maven publishes layoutlib standalone).
- Market context (verified 2026-07-19): no layoutlib-based VS Code extension exists; .NET Android devs' official workaround is copy-paste into Android Studio; closest architectural prior art is the "Compose Preview" extension (headless JVM rendering, Compose-only).

---

## Deferred Ideas

- Windows + Linux support (P2-J) — natives verified available; macOS-first was a focus decision.
- Side-by-side day/night comparison view (P2-K) — extends the light/dark requirement.
- Click-to-source sync (P2-L), hierarchy inspector (P3-S).
- `tools:listitem` design-time adapter items (P2-M).
- SVG fast path for vectors / JDK-free degraded mode (P2-N) — fills the AD-005 routing seam.
- Locale/RTL/font-scale configs (P2-O); render-in-parent context `tools:showIn` (P2-P); on-type live render (P2-Q).
- Animation playback (P3-R); custom-view bytecode opt-in (P3-T); PNG export (P3-U).
- Menu/preference/navigation XML previews — separate future features, out of this feature's boundary.

---
---

## UI Polish Fix-Pack Context (Amendment — 2026-07-26)

**Gathered:** 2026-07-26
**Spec:** the "UI Polish Fix-Pack" amendment section in `spec.md` (POLISH-01..08, stories FP-1..FP-5)
**Status:** Ready for tasks (design phase skipped — no architectural decisions; all changes sit
inside existing components: `panel.ts`, `scheduler.ts`, `config.ts`, `activation.ts`,
`webview-ui/*`)

### Fix-Pack Boundary

Five polish fixes to the existing preview panel: backdrop-button removal, Size-field →
edge-drag-resize replacement, first-open loading indicator + transient-error suppression, stage
containment (image never over toolbar), orientation dropdown. Extension/webview only — no host
(Kotlin), protocol, or corpus changes. The v1 scope and its verified requirements are not re-opened.

### Implementation Decisions

#### Backdrop button (user question 1)

- Findings presented: checkerboard = transparency indicator (user's own screenshot shows the widget
  layout's transparent window background through it); toggle was CSS-only and its state was never
  persisted (dead ConfigStore plumbing).
- **User decision: remove the button, keep the checkerboard permanently.** Remove the dead plumbing
  end-to-end; no migration for previously persisted `backdrop` values (ignored on read).

#### Size field → drag-to-resize (user question 2)

- Findings presented: `sizeDp` is consumed only by the drawable/nine-patch renderers — layouts ignore
  it (canvas = device × orientation × density), which is why it "didn't work"; the wire already
  carries plain `widthDp`/`heightDp`, so arbitrary sizes need zero host changes.
- **User decision: remove the field and implement edge-drag resize for BOTH kinds** — drawables
  re-render via `drawable.sizeDp`; layouts re-render at a custom device size, with the Device
  dropdown showing a transient selected "Custom (W×H dp)" entry; picking a preset snaps back.

#### First-open feedback (user request 3, no gray area — behavior fully described by user)

- Loading indicator while the operation is working (downloading dependencies, starting host,
  rendering); error only if the operation finishes with a problem. Formalized as: phase-labelled
  in-panel spinner; exactly one automatic retry for host-level failures of the latest request; domain
  errors shown immediately; all failures logged to the output channel.

#### Containment (user request 4) and Orientation dropdown (user request 5)

- Clear defect / clear request — no discussion needed. Containment via app-shell CSS (body no-scroll,
  toolbar fixed, stage clipped, existing pan/zoom reaches everything). Orientation becomes a
  two-option dropdown (Portrait default), reusing the existing `configChanged{orientation}` path.

#### Agent's Discretion

- Resize handle zone width (8 px), clamps (16 dp floor, 4096 px cap), ghost-outline styling, spinner
  visuals/phase strings, "Custom (W×H dp)" label format, how the webview learns docKind (via
  `setConfig` hydration). All logged as assumptions in the spec amendment.

#### Declined / Undiscussed Gray Areas → Assumptions

- None declined; remaining defaults are recorded in the spec amendment's Assumptions & Open
  Questions table.

### Specific References

- User screenshot (2026-07-26): widget layout preview where the transformed image paints over the
  Theme/Orientation/Size controls — the POLISH-05 defect and the transparency-checkerboard evidence.
- "Like the device option" — Orientation dropdown should match the Device `<select>` pattern.
- Android Studio's resizable preview — the interaction model for edge-drag resize.

### Deferred Ideas

- None — discussion stayed within the fix-pack scope.
