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

> **Update (AD-016, 2026-07-20):** Q-TEXTAPP and Q-COLOR are now **FIXED** — see the fix note under
> each quirk. The four formerly-degraded widgets inflate as their real classes and themed
> backgrounds/tints paint their real Material colours (no magenta). Only **Q-GUIDE** remains open.

- `?attr/colorPrimary` (the 40 dp probe, top-right) resolves to the Material3 primary (indigo/purple),
  confirming theme-attribute resolution through the inheritance chain (AC2).
- MaterialButton "A"/"B" form a spread chain; "Below barrier" sits under the bottom barrier (AC3);
  both buttons paint the Material3 primary container colour (Q-COLOR fixed — formerly magenta).
- Chip / ChipGroup ("One"/"Two"/"Grouped"), TextInputLayout/TextInputEditText, the Extended FAB
  ("Extended") and BottomNavigationView all inflate as their **real classes** (Q-TEXTAPP fixed —
  formerly grey MockView placeholders).

## Per-component parity verdict (§FR-2)

| Component | Inflates as real class | Render in our engine | Verdict vs documented Studio behaviour |
| --------- | ---------------------- | -------------------- | -------------------------------------- |
| ConstraintLayout | ✅ | container laid out | **OK** |
| Guideline | ✅ (class) | present; constrained view NOT repositioned | **Quirk Q-GUIDE** |
| Barrier | ✅ | bottom barrier positions dependent view correctly | **OK** |
| Group | ✅ (class) | inflates; visibility propagation not asserted | **OK (partial)** |
| Flow | ✅ (class) | inflates; wrap positioning not asserted | **OK (partial)** |
| MaterialButton | ✅ | shape + text correct; background paints Material primary | **OK** (Q-COLOR fixed) |
| MaterialTextView | ✅ | text correct | **OK** |
| Chip / ChipGroup | ✅ / ✅ | Chip inflates as real class | **OK** (Q-TEXTAPP fixed) |
| TextInputLayout / TextInputEditText | ✅ / ✅ | EditText inflates as real class | **OK** (Q-TEXTAPP fixed) |
| MaterialCardView | ✅ | card shape; background paints themed colour | **OK** (Q-COLOR fixed) |
| TabLayout (+ TabItem) | ✅ (TabItem consumed) | tab strip inflates | **OK** |
| MaterialToolbar | ✅ | inflates (empty toolbar) | **OK** |
| Slider | ✅ | inflates; track/thumb paint themed colour | **OK** (Q-COLOR fixed) |
| MaterialSwitch | ✅ | inflates | **OK** |
| FloatingActionButton | ✅ | shape correct; background paints themed colour | **OK** (Q-COLOR fixed) |
| ExtendedFloatingActionButton | ✅ | inflates as real class | **OK** (Q-TEXTAPP fixed) |
| BottomNavigationView | ✅ | inflates as real class | **OK** (Q-TEXTAPP fixed) |
| RecyclerView / ViewPager2 | ✅ (per §FR-2, empty at bounds) | not in this gallery | n/a here |

## Quirks

### Q-TEXTAPP — TextAppearance ThemeEnforcement failure (Chip, TextInputEditText, ExtendedFAB, BottomNavigationView)

**Symptom:** inflation throws
`IllegalArgumentException: This component requires that you specify a valid TextAppearance attribute.
Update your app theme to inherit from Theme.MaterialComponents (or a descendant).` /
`NullPointerException: TextAppearance.getTextSize()`, so the inflater substitutes a labelled MockView
placeholder (AD-013) — the render still completes with a `substitutedClass` warning.

**Cause (precise, corrected under AD-016):** these components call
`ThemeEnforcement.obtainStyledAttributes(...)` and read a text-appearance resource id via
`a.getResourceId(R.styleable.<Widget>_android_textAppearance, -1)` — the **framework** attr
`android:textAppearance` inside the widget's styleable array. The bug was NOT that a theme attribute
resolved to null; it was that the **generated library `R.styleable` arrays zeroed every `android:`
framework-attr slot**. `RClassGenerator` ran AGP's `mergeAndRenumberSymbols` with an **empty platform
symbol table**, so every `android:`-namespaced styleable child was written as id `0` (AGP substitutes
the platform id for those slots, or `0` when the platform table lacks them). At render time
`obtainStyledAttributes` therefore read id `0` for `android:textAppearance` and `getResourceId(...)`
returned `-1`, tripping `ThemeEnforcement.checkTextAppearance` (ExtendedFAB/BottomNavigationView throw;
Chip NPEs on the resulting null TextAppearance). This was broader than "text appearance" — every
framework attr in every library styleable was affected (see Q-COLOR, same root cause).

**Fix (AD-016):** `RClassGenerator` now reconstructs the platform (`android:`) ATTR symbol table from
the canonical framework ids that aapt2 already baked into the AAR `R.txt` styleable arrays, and passes
it to `mergeAndRenumberSymbols`. Framework-attr slots now keep their real ids (e.g. `Chip[4]` =
`0x01010034` for `android:textAppearance`), which layoutlib resolves natively; own-library `0x7f` ids
are unchanged, so id-consistency with the loaded `R` classes is preserved. No pin bump; no SDK.

**Status: FIXED.** Verified by `render.MaterialTextAppearanceTest` (the three formerly-degraded widgets
inflate as real classes) and the regenerated `material/gallery` corpus golden.

### Q-COLOR — themed background/tint renders as the magenta placeholder (MaterialButton, MaterialCardView, Slider, FAB)

**Symptom:** the widget's class and geometry are correct, but its background/tint paints as the
`#FF00FF` unresolved-resource placeholder (T27) instead of the themed container colour.

**Cause (corrected under AD-016):** SAME root cause as Q-TEXTAPP. The widget reads its
background/tint (a themed `ColorStateList`) through a framework attr slot in a library styleable (e.g.
`android:backgroundTint`, `android:tint`). Those slots were zeroed by the empty-platform-table bug, so
the tint reference resolved to nothing and layoutlib painted the `#FF00FF` unresolved-colour fallback.
Direct `?attr/colorPrimary` (a simple colour theme attribute, not read through a library styleable's
framework slot) always resolved — which is why the probe was correct while widget fills were magenta.

**Fix (AD-016):** the same `RClassGenerator` platform-table fix restores the framework-attr ids, so the
themed background/tint now resolves and paints its real Material colour.

**Status: FIXED.** Verified by the regenerated `gradle/grid_layout`, `gradle/linear_horizontal` and
`material/gallery` corpus goldens (formerly-magenta MaterialButton fills now paint Material3 primary).

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

- **Q-TEXTAPP / Q-COLOR fixed (AD-016):** Chip, TextInputEditText, ExtendedFloatingActionButton,
  BottomNavigationView now render as real classes, and MaterialButton/MaterialCardView/Slider/FAB paint
  their themed colours — all corpus-eligible at the standard tolerance. The `material/gallery` golden
  and the affected `grid_layout`/`linear_horizontal`/`material_buttons` goldens were regenerated to the
  corrected rendering; corpus is 42/42 @ 0% diff.
- **Guideline fixtures:** assert chains/barriers, not guideline-relative positions (Q-GUIDE — still open).
- Widgets marked **OK** above are corpus-eligible at the standard AA pixel tolerance once a real Studio
  baseline is captured on a workstation.

## Q5 verdict

**Q5 (Material rendering parity catalog) is RESOLVED, with one remaining caveat:**
- The §FR-2 surface inflates against the bundled, pinned artifacts with no project configuration; the
  core widgets render faithfully in geometry/text; `?attr/` theme resolution and ConstraintLayout
  chains/barriers work (P1-B AC1/AC2/AC3 core mechanism proven).
- **Q-TEXTAPP and Q-COLOR are FIXED (AD-016)** — all §FR-2 widgets inflate as their real classes and
  paint their themed colours, no pin bump. The remaining divergence is **Q-GUIDE** (guideline
  positioning), a distinct ConstraintLayout id-application issue tracked separately and a candidate for
  the post-v1 Paparazzi 2.x / layoutlib upgrade.
- **Provenance caveat:** verdicts are against documented Studio behaviour, not a captured Studio
  pixel baseline; capturing that baseline on a workstation is the one open follow-up for full Q5 sign-off.
