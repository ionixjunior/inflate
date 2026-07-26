# Known limitations

Inflate aims for a complete, faithful v1 (AD-002) — but "faithful" has real, documented edges. This
page lists every known divergence from Android Studio's own preview/runtime rendering, and every
functional gap discovered during development, plainly and without overstating what's delivered.
Every entry below traces back to a spec decision, an architecture decision (`.specs/STATE.md`), or
an empirically-verified gap found while building and testing the golden-image corpus (Phase 10).

## Material / androidx fidelity gaps (Q5)

Under the pinned engine (layoutlib 14.0.11 + the SDK-free dynamic-id resource scheme — see
[Engine and version pinning](#engine-and-version-pinning) below). Full per-widget detail, including
the reference render and reasoning, is in [docs/material-quirks.md](material-quirks.md).

**Fixed in AD-016 (no pin bump):** `Chip`, `TextInputEditText`, `ExtendedFloatingActionButton` and
`BottomNavigationView` now inflate as their **real classes** (formerly grey placeholder boxes), and
widget backgrounds/tints now paint their **real themed colours** (formerly the magenta `#FF00FF`
placeholder). Root cause: the generated library `R.styleable` arrays zeroed every `android:`
framework-attr slot because `RClassGenerator` merged symbols with an empty platform table, so
`obtainStyledAttributes(...).getResourceId(android:textAppearance, -1)` returned `-1` and Material's
`ThemeEnforcement` failed. The generator now reconstructs the framework-attr ids from the AAR `R.txt`
styleable arrays, so those slots keep their canonical framework ids (layoutlib resolves them natively).

**Remaining divergence:**

- **`ConstraintLayout`'s `Guideline` does not reposition the views constrained to it** (chains and
  barriers DO work correctly). A layout relying on a guideline for positioning will show the
  guideline's dependent view in the wrong place. This is a distinct id-application issue, not related
  to the AD-016 fix above.

The corpus's Material fixtures assert what the pinned engine faithfully produces today.

## Custom / unknown view classes render as placeholders (AD-007)

Any view class Inflate doesn't recognize (your own custom `View` subclasses, or a third-party
library not in the bundled androidx/Material set) renders as a labeled placeholder box — the class
name, sized per its layout params — rather than the real widget. This matches Android Studio's own
fallback behavior when a class can't load, and is a deliberate v1 scope decision: **Inflate never
loads project bytecode** (no build system is ever invoked to produce it, and loading arbitrary
project code into the render host would be a real security/sandbox concern). A future opt-in,
sandboxed mode that renders real custom views from your project's build output is tracked as a
post-v1 story (P3-T) — not delivered in v1.

## Data-binding layouts: expressions replaced with placeholders

A `<layout>`-rooted data-binding file is unwrapped and every `@{...}` binding expression is replaced
with a type-appropriate default value (not evaluated against real data) before rendering, with a
"binding expressions replaced" notice. This means a data-bound layout previews its **structure**
faithfully but never its **live bound values** — there is no view-model or data context in a
preview-only tool. Known edge case: the unwrap logic assumes Android Studio's typical `<layout>` tag
formatting; a hand-written `<layout>` file with unusual multi-line attribute placement inside the
same content line as a tag boundary may not unwrap cleanly (see KDoc on `preprocess/DataBinding.kt`).

## Preprocessing scope (known correctness gap — tracked, not yet fixed)

The preprocessor's regex-based passes (structural `<merge>`/`<include>` handling, data-binding
unwrap, custom-view/tag scanning) are **not comment-aware**: tag-like text inside an XML comment
(e.g. `<!-- TODO: convert to <merge> -->`) can be matched and rewritten as if it were real markup,
which can break inflation on a file that is otherwise completely valid. This is a known, tracked
correctness gap (not a v1-scope decision) — it is flagged here for transparency rather than silently
shipped as if it didn't exist. If a real-world file with XML comments containing tag-like text fails
to render unexpectedly, this is very likely why.

## Unresolved-resource degradation is real but only proven in isolation

`Degradation` (per-kind placeholder substitution + an `unresolvedRef` warning when a layout
references a missing resource) exists and is tested on its own, but as of this writing is **not yet
wired into the live render path** — a real layout referencing e.g. `@color/does_not_exist` will fail
to render with a mapped inflation error rather than showing a magenta placeholder + warning as the
degradation design intends. This is tracked as an open integration gap, not a design decision.

## Two additional gaps discovered while building the Phase 10 golden corpus

These were found empirically while proving the real render host end-to-end for the golden-image
corpus and chaos-testing work, and are recorded here for the same reason as the preprocessing gap
above — transparency over silence:

- **Legacy Xamarin resource-directory casing is not recognized.** The real render pipeline's
  resource-folder scan is case-sensitive: a traditional Xamarin.Android `Resources/Layout/`
  (capitalized `Layout`) directory is **not** recognized as a layout resource folder, even though the
  extension's own file-eligibility check matches it case-insensitively (so "Open Preview" lights up
  on such a file, but the render itself currently fails). The modern .NET SDK-style lowercase
  convention (`Resources/layout/`, `Resources/values/`, `Resources/drawable/`) **does** work end to
  end — this is what the corpus's `.NET`-shaped fixtures use. If you have an older Xamarin.Android
  project using the capitalized convention, previews will not render until this is fixed upstream.
- **The render request's `packageName` must always be the engine's fixed internal package**, not
  your project's real `applicationId`/manifest package — the pinned engine registers exactly one
  package name for its dynamic resource-id scheme at startup, and any other value makes every
  resource id resolve to zero. This is an internal wiring detail (not something you configure), noted
  here for completeness since it was a real, previously-undiscovered gap in the render pipeline.

## Edge-drag resize under fit-to-window zoom refits the whole preview (by design)

The preview's zoom defaults to **fit-to-window**. When an edge-drag resize completes, the preview
re-renders at the new dp size and the new image — which has different pixel dimensions — is fitted
to the stage again with one uniform scale for both axes (`min(stageW/imageW, stageH/imageH)`). Two
visible consequences whenever the axis you dragged is (or becomes) the one that limits the fit:

- the dragged axis stops growing on screen (it pins at the stage bound), and
- the on-screen box **changes size on the axis you didn't drag** — e.g. dragging the bottom edge of
  a tall portrait layout downward makes the displayed preview *narrower*, because the now-taller
  render is fitted back into the same stage height.

The render itself is correct: the Device dropdown's "Custom (W×H dp)" entry shows exactly the size
the drag produced, and only the dragged axis changed in dp (the displayed-px → dp conversion is
per-axis and round-trips the undragged axis exactly). Only the *displayed* size moves on both axes,
because fit-to-window always preserves the render's aspect ratio inside the stage — the same refit
that happens when you pick a different device preset.

**If you want the drag to be WYSIWYG**, zoom to a manual level first (Ctrl/Cmd + wheel): a manual
zoom percent is not recomputed after a render, so the resized preview lands exactly where the ghost
outline was released and the undragged axis doesn't move on screen. Making drag-resize WYSIWYG under
fit mode too (e.g. locking the zoom when a drag completes) is a possible future UX enhancement that
needs its own design — it requires a zoom/fit toolbar control that doesn't exist yet (zoom is
currently wheel-gesture only, so silently leaving fit mode would strand the user with no way back).

## Engine and version pinning

- **Engine pin**: Paparazzi 1.3.5 + layoutlib 14.0.11 (Android API 34), JDK 17 minimum. This is an
  intentionally **older** pin than current Android Studio for v1 stability (AD-008) — a post-v1
  migration to Paparazzi 2.x (JDK 21) is planned but not part of this release.
- **Bundled library versions may not match your project's.** Inflate bundles ONE pinned version each
  of the supported androidx/Material libraries (Material 1.12.0, ConstraintLayout 2.2.1, etc. — see
  `host/src/main/kotlin/engine/EngineArtifacts.kt` for the exact pins) rather than reading your
  project's actual dependency versions (no build system is ever invoked, so your real resolved
  versions aren't available to read). If your project uses a meaningfully different version of a
  bundled library, an attribute/component that exists only in your version (or was renamed/removed
  since the bundled one) may render incorrectly or show a `materialAttrMissing` warning naming the
  bundled version. This is a deliberate, documented trade-off (R4), not a bug.
- **The preview platform itself is pinned**, not tied to your project's `compileSdkVersion`/target —
  every preview renders against API 34 regardless of what your manifest declares.

## What's out of scope for v1 (by design, not oversight)

- AdapterViews (`ListView`, `GridView`, `RecyclerView`, `ViewPager2`, …) render empty at their
  correct bounds — no item content (`tools:listitem` support is a tracked post-v1 story, P2-M).
- `tools:showIn` / render-in-parent-context and include-parent navigation are not supported.
- No click-to-source selection sync, no hierarchy inspector, no animation playback — all tracked as
  post-v1 stories in the spec's P2/P3 backlogs.
- Windows and Linux are not supported in v1 (macOS arm64/x64 only, AD-004) — the underlying engine
  natives are published for both and a fast-follow is planned, but v1 ships macOS-only.
