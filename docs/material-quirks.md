# Material rendering quirks catalog (Q5)

**Requirement:** P1-B (§FR-2), Q5 closure, R6 mitigation, NFR-07 (corpus tolerance input).
**Engine pin:** Paparazzi 1.3.5 · layoutlib 14.0.11 (API 34) · tools 31.4.2 · JDK 17 (AD-008).
**Fixture:** `fixtures/galleries/material/material_gallery.xml` (+ `material_attr_missing.xml`).

## Provenance — read this first (honesty note)

This catalog is built from **our engine's real render** of the Material gallery, checked in at
[`fixtures/galleries/material/our-engine-render/material_gallery.png`](../fixtures/galleries/material/our-engine-render/material_gallery.png)
(768×1280, Theme.Material3.DayNight, produced by `render.MaterialGalleryTest` — regenerate with
`INFLATE_DUMP_GALLERY_PNG=<path> ./gradlew engineTest --tests render.MaterialGalleryTest`).

**No Android Studio baseline was captured and no pixel-diff against Studio was performed** — Android
Studio cannot run in this environment. The "Studio parity" column therefore compares our render against
**documented/known** Android Studio + Material Components behaviour (official Material docs and the
components' published rendering contract), **not** against a captured Studio screenshot. Where a real
Studio pixel baseline is needed it must be captured on a workstation in a follow-up; until then the
checked-in our-engine render is the reference image. This is a deliberately conservative, non-fabricated
provenance per the T42 constraint.

## What the reference render shows

- `?attr/colorPrimary` (the 40 dp probe, top-right) resolves to the Material3 primary (indigo/purple),
  confirming theme-attribute resolution through the inheritance chain (AC2).
- MaterialButton "A"/"B" form a spread chain; "Below barrier" sits under the bottom barrier (AC3).
- Several widgets show a **magenta (#FF00FF)** fill — that is our unresolved-resource placeholder
  (T27), not a Material colour: the widget class + geometry are correct but its themed
  background/tint colour did not resolve (see quirk Q-COLOR below).
- Four widgets render as **grey labelled boxes** — the MockView placeholder (AD-013) after an
  inflation failure (see quirk Q-TEXTAPP below).

## Per-component parity verdict (§FR-2)

| Component | Inflates as real class | Render in our engine | Verdict vs documented Studio behaviour |
| --------- | ---------------------- | -------------------- | -------------------------------------- |
| ConstraintLayout | ✅ | container laid out | **OK** |
| Guideline | ✅ (class) | present; constrained view NOT repositioned | **Quirk Q-GUIDE** |
| Barrier | ✅ | bottom barrier positions dependent view correctly | **OK** |
| Group | ✅ (class) | inflates; visibility propagation not asserted | **OK (partial)** |
| Flow | ✅ (class) | inflates; wrap positioning not asserted | **OK (partial)** |
| MaterialButton | ✅ | shape + text correct; background tint → magenta | **Quirk Q-COLOR** |
| MaterialTextView | ✅ | text correct | **OK** |
| Chip / ChipGroup | ChipGroup ✅ / Chip ❌ | Chip → MockView placeholder | **Quirk Q-TEXTAPP** |
| TextInputLayout / TextInputEditText | Layout ✅ / EditText ❌ | EditText → MockView placeholder | **Quirk Q-TEXTAPP** |
| MaterialCardView | ✅ | card shape; background → magenta | **Quirk Q-COLOR** |
| TabLayout (+ TabItem) | ✅ (TabItem consumed) | tab strip inflates | **OK** |
| MaterialToolbar | ✅ | inflates (empty toolbar) | **OK** |
| Slider | ✅ | inflates; track/thumb → magenta | **Quirk Q-COLOR** |
| MaterialSwitch | ✅ | inflates | **OK** |
| FloatingActionButton | ✅ | shape correct; background → magenta | **Quirk Q-COLOR** |
| ExtendedFloatingActionButton | ❌ | MockView placeholder | **Quirk Q-TEXTAPP** |
| BottomNavigationView | ❌ | MockView placeholder | **Quirk Q-TEXTAPP** |
| RecyclerView / ViewPager2 | ✅ (per §FR-2, empty at bounds) | not in this gallery | n/a here |

## Quirks

### Q-TEXTAPP — TextAppearance ThemeEnforcement failure (Chip, TextInputEditText, ExtendedFAB, BottomNavigationView)

**Symptom:** inflation throws
`IllegalArgumentException: This component requires that you specify a valid TextAppearance attribute.
Update your app theme to inherit from Theme.MaterialComponents (or a descendant).` /
`NullPointerException: TextAppearance.getTextSize()`, so the inflater substitutes a labelled MockView
placeholder (AD-013) — the render still completes with a `substitutedClass` warning.

**Cause:** these components run Material's `ThemeEnforcement`/`MaterialResources.getTextAppearance`,
which reads a text-appearance *theme attribute* (e.g. `?attr/textAppearanceBodyLarge`). Under the pinned
layoutlib 14.0.11 + our SDK-free, dynamically-numbered R / generated-R resource scheme (Q3), that
text-appearance theme attribute resolves to null even though `Theme.Material3.DayNight` is applied and
other theme attributes (e.g. `?attr/colorPrimary`) resolve. Widgets that do not enforce a text
appearance (MaterialButton, MaterialTextView, Slider, MaterialSwitch, FAB, MaterialCardView, TabLayout,
MaterialToolbar) are unaffected.

**Studio behaviour:** renders these components fully. **Divergence: high** for the four affected widgets.
**Follow-up:** track as a corpus tolerance exclusion (below); a real fix likely requires closing the
text-appearance theme-attribute resolution gap and is out of scope for the pinned-engine v1.

### Q-COLOR — themed background/tint renders as the magenta placeholder (MaterialButton, MaterialCardView, Slider, FAB)

**Symptom:** the widget's class and geometry are correct, but its background/tint paints as the
`#FF00FF` unresolved-resource placeholder (T27) instead of the themed container colour.

**Cause:** the widget's background/tint resolves through a theme colour reference that does not resolve
under the current resource scheme, so degradation substitutes the magenta placeholder. Direct
`?attr/colorPrimary` (a simple colour theme attribute) DOES resolve — the gap is specific to the
themed background/tint (ColorStateList / drawable) chain of these widgets.

**Studio behaviour:** paints the themed container colour. **Divergence: medium** (shape/size/text are
faithful; fill colour is not).

### Q-GUIDE — ConstraintLayout Guideline does not reposition constrained views

**Symptom:** a view constrained to a `Guideline` (`layout_constraintStart_toStartOf`/
`layout_constraintTop_toTopOf="@id/guideline"`) stays at (0,0); the Guideline itself inflates as the
real class. Chains and Barriers position correctly.

**Cause:** guideline resolution under the dynamic-id scheme; the guideline's id/position is not applied
to dependent constraints. **Divergence: medium** (other ConstraintLayout features — constraints,
chains, barriers — are faithful). **Follow-up:** corpus tolerance / investigate id resolution for
guideline references.

## Missing-attribute behaviour (AC4)

`material_attr_missing.xml` uses a real bundled attribute (`app:cornerRadius`) plus a fabricated one
(`app:madeUpMaterialAttr`). The render succeeds with the unknown attribute ignored and emits exactly one
`materialAttrMissing` warning naming the attribute and the bundled Material version (`1.12.0`), per
P1-B AC4 (`render.MaterialAttrMissingTest`). This is the mechanism for R4 (bundled version ≠ project
version): unknown Material attributes are surfaced, not silently dropped.

## Corpus tolerance implications (NFR-07)

- **Exclude from the golden corpus (until fixed):** Chip, TextInputEditText,
  ExtendedFloatingActionButton, BottomNavigationView (Q-TEXTAPP — they render as placeholders, so a
  Studio pixel-diff would be meaningless). Track as known-limitation fixtures.
- **Loosen colour tolerance / mask fill regions:** MaterialButton, MaterialCardView, Slider, FAB
  (Q-COLOR — geometry matches, fill does not; compare shape/bounds, not the fill colour, or mask it).
- **Guideline fixtures:** assert chains/barriers, not guideline-relative positions (Q-GUIDE).
- Widgets marked **OK** above are corpus-eligible at the standard AA pixel tolerance once a real Studio
  baseline is captured on a workstation.

## Q5 verdict

**Q5 (Material rendering parity catalog) is RESOLVED, with caveats:**
- The §FR-2 surface inflates against the bundled, pinned artifacts with no project configuration; the
  core widgets render faithfully in geometry/text; `?attr/` theme resolution and ConstraintLayout
  chains/barriers work (P1-B AC1/AC2/AC3 core mechanism proven).
- **Caveats / documented divergences carried forward:** Q-TEXTAPP (4 widgets → placeholder),
  Q-COLOR (themed background/tint → magenta on 4 widgets), Q-GUIDE (guideline positioning). These are
  pinned-engine (layoutlib 14.0.11 + SDK-free dynamic-id) limitations, tracked as corpus tolerances
  above, and are candidates for the post-v1 Paparazzi 2.x / layoutlib upgrade.
- **Provenance caveat:** verdicts are against documented Studio behaviour, not a captured Studio
  pixel baseline; capturing that baseline on a workstation is the one open follow-up for full Q5 sign-off.
