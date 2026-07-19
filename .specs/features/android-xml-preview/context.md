# android-xml-preview Context

**Gathered:** 2026-07-19
**Spec:** `.specs/features/android-xml-preview/spec.md`
**Status:** Ready for design — spec confirmed 2026-07-19 (assumptions reviewed; engine pinned per AD-008)

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
