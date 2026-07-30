# android-xml-preview Validation

**Date**: 2026-07-19
**Spec**: `.specs/features/android-xml-preview/spec.md`
**Diff range**: `58079fd..HEAD` (72 commits; T1–T60 + T38b + state/close commits)
**Verifier**: independent sub-agent (author ≠ verifier; evidence-or-zero, re-derived)

---

## Overall: ✅ FEATURE PASS — AD-016 Material-fidelity fix closed & verified (2026-07-20); G1/G2/G3 closed (2026-07-19); 1 minor residual noted

> **Latest (2026-07-20):** independent Closing Verification of the AD-016 Material-fidelity fix (`7fe5d25`) → **PASS**. Fix soundness (id-consistency) confirmed against real AGP source; 14 golden regens re-derived as correctness improvements (not masked regressions); pre-fix bug reproduced in scratch; no test/tolerance weakened; gates green (host unit 111, engineTest 47, corpus 42/42 @ 0%). AD-002 satisfied (Material fidelity), AD-008 preserved. Q-GUIDE remains a documented out-of-scope quirk. See the **Closing Verification — AD-016** section below.

**Re-verifier (fix-loop iteration 1, 2026-07-19, independent; author ≠ verifier).**
The prior CONDITIONAL-FAIL's three ship-blocking gaps (G1/G2/G3) are now closed
end-to-end and independently re-derived (evidence-or-zero — not trusting the fix
worker's self-report). All regression gates are green and each new test was
empirically confirmed discriminating by scratch mutation (reverted; tree left
clean). One narrow residual remains (`degradeStyleParent` unwired — spec:453 edge
case), classed **minor / non-ship-blocking** (see Re-Verification section).

- **Fixes verified**: G2 `69db995` (degradation on live path) · G1 `d7a8900` (comment-aware preprocessor) · G3 `7d2ac99` (case-insensitive host resolution). All three commits are **host-only** (no extension surface touched → extension gates not required).
- **Gate (re-verifier-run, `--rerun-tasks`, not inferred)**: host unit **111** ✅ · host engineTest **46** ✅ · corpus **42/42** @ 0.000% diff ✅. 0 failed, 0 skipped anywhere. (Extension unit 154 / integration 19 unchanged — no extension files in the fix diff.)
- **New-test discrimination (scratch mutation, killed → reverted)**: CommentAwareTest 8/8 killed · DegradationLiveTest killed · LegacyCasingTest killed.
- **Original sensor**: 5 mutations injected, 5 killed, 0 survived (below, unchanged).

---

## Closing Verification — AD-016 Material Fidelity Fix (2026-07-20)

**Independent closing verifier (author ≠ verifier; evidence-or-zero; did NOT implement the fix; re-derived every claim).**
Scope: commit `7fe5d25` "Resolve library styleable framework-attr ids…" (+ `9f47104` STATE record). Diff surface = `host/src/main/kotlin/engine/RClassGenerator.kt` (+52), new `host/src/engineTest/kotlin/render/MaterialTextAppearanceTest.kt`, `host/ENGINE_SURFACE.md`, `docs/{material-quirks,limitations}.md`, 14 corpus goldens + 1 doc render. No extension surface touched (0 `extension/` files in the diff → extension gates not required).

### Verdict: ✅ FEATURE PASS — AD-002 satisfied (Material fidelity), AD-008 preserved (no pin bump).

### 1. Fix soundness — id-consistency HOLDS; no risk to non-zero slots
Verified against the REAL AGP `mergeAndRenumberSymbols` source (decompiled `com.android.tools:sdk-common` `SymbolUtils.kt`; runtime pin 31.4.2, algorithm cross-checked against 31.13.2 sources — identical shape):
- **`idProvider.next()` is invoked ONLY for the app/dependency normal-symbols and own ATTRs** (SymbolUtils.kt:121). Platform (`android:`) symbols are **never** renumbered — they are only *looked up* (SymbolUtils.kt:153-157). Therefore adding the reconstructed platform table **cannot shift any own-library `0x7f` id**; own-library styleable children are resolved through `attrToValue` (SymbolUtils.kt:161-166), which is independent of `platformSymbols`.
- **For an `android:`/`android_` styleable child** (SymbolUtils.kt:148-171): an EMPTY platform table → `platformSymbol == null` → falls through to `attrToValue[<prefixed name>]` which is always null for framework-prefixed names → **writes `0`** (SymbolUtils.kt:170). A populated table → writes the canonical framework id. This exactly reproduces the claimed pre-fix zeroing and the fix.
- **Conclusion:** the only slots that change are framework-attr styleable slots that were provably `0` pre-fix, now set to their canonical `0x0101xxxx` id (resolved natively by layoutlib's framework R). **Strictly additive — a previously-`0` slot can only be corrected, never a previously-good non-zero slot corrupted.** `putIfAbsent` (first non-zero wins) is safe because framework attr ids are globally fixed by the platform, so cross-AAR duplicates carry identical values. This matches how a real AGP build bakes framework attrs into library styleables.

### 2. Golden regeneration — IMPROVEMENTS, not blessed regressions (visually re-derived)
For each sampled fixture I compared the pre-fix golden (`git show 7fe5d25^:…`) against the current golden and confirmed the current one is what the live engine now produces (corpus 42/42 @ 0.000%):
| Fixture | Pre-fix (buggy) | Post-fix (correct) | Why it legitimately changed |
| --- | --- | --- | --- |
| `material/gallery` (default+night, 53KB→34KB) | Grey **MockView** boxes labeled `chip.Chip` ×3 / `TextInputEditText` / `BottomNavigationView` / `ExtendedFloatingActionButton`; magenta "A"/"B" buttons | Real Chips ("One"/"Two"/"Grouped"), real text field, real TabLayout, real "Extended" FAB, real BottomNavigationView; purple Material3 buttons; **zero MockView, zero magenta** | The 3 §FR-2 widgets that tripped `ThemeEnforcement.checkTextAppearance` now read a real `android:textAppearance` id and construct; framework tint slots resolve |
| `gradle/material_buttons` | "Tap" button **magenta** | "Tap" button Material3 purple | `Button`→`MaterialButton` (Material3 view-inflater) reads `backgroundTint` framework slot — was `0`→magenta, now canonical→themed |
| `gradle/grid_layout` (surprising) | 4 buttons all **magenta** | 4 buttons Material3 purple | Same `Button`→`MaterialButton` substitution; own `@color/background` (blue) unchanged, confirming only the framework-attr tint changed |
| `gradle/checkbox_switch`, `constraint_basic`, `linear_horizontal` (surprising) | small tint/text-appearance deltas | themed | `CheckBox`/`Switch`/`RadioButton`/`TextView` are substituted to Material variants under `Theme.Material3.DayNight` and read framework attr slots — same additive correction |

Every changed golden is explained by the one mechanism (framework-attr slot `0`→canonical under the Material view-inflater). No golden change is unexplained; none is a masked regression. (`MaterialTextAppearanceTest` asserts the 3 hard-throwing widgets as real classes; `TextInputEditText` is covered end-to-end by the regenerated gallery golden.)

### 3. Pre-fix state was genuinely buggy (reproduced in scratch, tree restored clean)
Reverted ONLY `RClassGenerator.kt` to `7fe5d25^`, force-regenerated the R classes (`--rerun-tasks generateEngineTestRClasses`), ran `MaterialTextAppearanceTest` → **FAILED at line 73** (widgets degrade to MockView, not real classes). This confirms (a) the pre-fix code was buggy exactly as claimed and (b) the new test genuinely discriminates the fix (fails when reverted). Restored `RClassGenerator.kt` to HEAD and regenerated correct R classes; `git status` = clean (only pre-existing untracked `host/local.properties`).

### 4. No weakening
- **Tolerances unchanged**: `corpus/manifest.json` last modified in `1a16ecc` (T55), untouched by `7fe5d25`. The only two `tolerance: 0.02` entries (material-gallery default+night) pre-date the fix.
- **No test deleted/skipped/weakened**: non-golden/non-doc diff is exactly 3 files (RClassGenerator +52, new test, ENGINE_SURFACE). `MaterialGalleryTest` unmodified and non-contradictory (its required-class list never included the 3 formerly-degraded widgets).
- **Counts**: host unit **111** (unchanged), engineTest **46→47** (+1 = the new discriminating test).

### 5. Gates (run by this verifier, not inferred)
| Gate | Command | Result |
| --- | --- | --- |
| Host build+unit+engine | `cd host && ./gradlew build test engineTest` | ✅ BUILD SUCCESSFUL — unit **111**/0 fail/0 skip; engineTest **47**/0 fail/0 skip |
| Golden corpus | `npm run corpus` | ✅ **42/42 passed, 0.000% diff** each |

### 6. AD-002 / Q-GUIDE
AD-002 (complete + faithful v1) is now satisfied for Material fidelity **without a pin bump** (AD-008 preserved): all §FR-2 Material widgets — including Chip, explicitly named in P1-B's Independent Test — inflate as their real classes and paint their themed colours. **Q-TEXTAPP and Q-COLOR are FIXED** (docs/material-quirks.md, docs/limitations.md, ENGINE_SURFACE.md updated). The single remaining divergence is **Q-GUIDE** (ConstraintLayout `Guideline` does not reposition constrained views) — a **distinct root cause** (ConstraintLayout id application, unrelated to the styleable framework-attr fix), which remains a **documented, out-of-scope v1 quirk**. No lesson recorded (clean PASS, no grounded failure).

---

## Fix-Loop Iteration 1 Re-Verification (2026-07-19)

### G2 — Degradation on the live render path → ✅ CLOSED
- **Wiring (static, independently confirmed)**: `RpcServer.kt:186` → `RenderRouting.render` (`RenderRouting.kt:46`, `DocKind.layout`) → `LayoutRenderer.render` → `Degradation(log, overlayResDir).degradeReferences(...)` at `LayoutRenderer.kt:120`, gated by `adapter.appResourceExists` (NOT the dynamic-id getIdentifier, Q3). Degradation is now referenced from `main/` (previously only its own test). The overlay is rewritten and, when a drawable placeholder is emitted, the app repo is invalidated + rebuilt so the render completes.
- **Own discriminating probe**: `render.DegradationLiveTest` drives the `unresolved-refs` fixture (`broken.xml`, four missing kinds) through the REAL `RenderRouting.render` and asserts status `ok`, `pngPath` present, **exactly 4** `unresolvedRef` warnings with kinds `{color,dimen,string,drawable}`, per-kind overlay substitutions (`#FF00FF` / `0dp` / name text / `@drawable/inflate_degraded_placeholder`), AND the magenta background is visible in the rendered PNG center. PASS. Scratch mutation (disable the degrade-apply block) → test FAILS (magenta absent) → confirmed discriminating.
- **Residual (minor, non-ship-blocking): `degradeStyleParent` is NOT wired on the live path** — it is still called only by `DegradationTest` (an instance of lesson L-001, dead-on-live-path). The spec:453 edge case ("WHEN a style chain contains a missing parent THEN theme application SHALL degrade to the nearest resolvable ancestor and warn") is therefore **uncovered end-to-end**: the "warn + nearest-ancestor" behavior does not run. Assessment: distinct from G2's hard SHALL (P1-G AC4 unresolved refs, which IS closed) — style parents live in on-disk `values/` (not the previewed layout the preprocessor rewrites), and layoutlib does not hard-crash on a missing style parent (render still completes, attrs just don't inherit), so it is not a render-failing ship-blocker. Left as a minor follow-up, not a new fix-loop iteration. Covered generally by existing lesson L-001; no new lesson recorded.

### G1 — Comment-aware preprocessor → ✅ CLOSED
- **Approach (independently confirmed)**: `preprocess/Comments.kt` computes `<!-- … -->` spans (non-greedy, DOT_MATCHES_ALL); every regex stage (`ToolsAttributes`, `DataBinding`, `Structural` merge/fragment/include, `Scan` refs + `UnknownViewSubstitutor` view-class form) skips any match whose start falls inside a comment. Nothing is masked/shifted → LineMap stays correct; comments reach the overlay byte-identical.
- **Own discriminating probe**: `preprocess.CommentAwareTest` (8 tests) — for each stage a commented construct (`<merge>`, `<fragment>`, `<include>`, `tools:`, `@{…}`, custom tag, `<view class>`, `@drawable/ghost`) stays **byte-identical + inert (no warning/substitution/dependency)** while the SAME construct OUTSIDE a comment still transforms; a full-pipeline test asserts the combined-construct comment survives to the overlay byte-identical, the real root is preserved, and no substitution/binding/notice warnings fire. PASS. Scratch mutation (`Comments.inComment` → always false) → 8/8 FAIL → confirmed discriminating.

### G3 — Case-insensitive host resource resolution → ✅ CLOSED
- **Approach (independently confirmed)**: `EngineAdapter.normalizeResRoot` presents each res root (roots + overlay, order preserved for RES-02) to layoutlib via a shadow dir of canonical lowercase-type symlinks; pure-lowercase roots are returned untouched (fast path → RES-02 ordering and the working lowercase path unaffected; corpus 42/42 incl. 12 lowercase `.NET` fixtures still 0% diff). `canonicalFolderName` lowercases only the type segment, preserving qualifiers (`-rUS`, `-sw600dp`). `Structural.resolveLayoutFile` and `LayoutRenderer.resolveResourceFile` also match type dirs case-insensitively.
- **Own discriminating probe**: `render.LegacyCasingTest` renders `dotnet-sample/Resources/Layout/Main.axml` (capital `L`, mixed-case tree also containing lowercase `drawable`/`values`/`layout-sw600dp`) and its lowercase-dir twin, asserting both status `ok`, the capital render non-blank (`>1` distinct pixel), and **pixel-identical** to the twin. PASS. Scratch mutation (`normalizeResRoot` → identity) → test FAILS → confirmed discriminating.

### Regression
- Host `./gradlew test engineTest --rerun-tasks`: **unit 111 / 0 fail / 0 skip; engineTest 46 / 0 fail / 0 skip** (counts read from JUnit XML, matching the expected 111 / 46). Full `build test engineTest` also green.
- `npm run corpus`: **42/42 passed, 0.000% diff** each.
- Q5/Chip (AD-015) and the theme-render spec-precision minor from the original report are unaffected by this iteration and remain as previously recorded (AD-015 investigate-first spike is queued next).

---

## Original Verifier Findings (retained for history — CONDITIONAL FAIL, pre-fix)

- **Spec-anchored check**: core P1 ACs traced to discriminating tests; **3 gaps** at the end-to-end layer (now closed above).
- **Gate**: extension unit 154 ✅ · extension integration 19 ✅ · host unit 103 ✅ · host engineTest 44 ✅ · corpus 42/42 ✅. 0 failed, 0 skipped anywhere.
- **Sensor**: 5 mutations injected, **5 killed, 0 survived**.

---

## Gate Check (all run by the Verifier, not inferred)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Extension unit | `cd extension && npm test` | **154 passed**, 0 failed (13 files) |
| Extension integration | `cd extension && npm run test:integration` | **19 passed**, 0 failed (incl. NFR-05 concurrency-serialized + 6 chaos scenarios) |
| Host unit | `cd host && ./gradlew test` | **103 passed**, 0 failed, 0 skipped (19 classes) |
| Host engine | `cd host && ./gradlew engineTest` | **44 passed**, 0 failed, 0 skipped (18 classes) |
| Golden corpus | `npm run corpus` (root) | **42/42 render combos passed**, 0.000% diff each (33 fixtures) |
| Engine fetch (prereq) | `cd host && ./gradlew fetchEngine` | OK — 159.9 MB / 16 artifacts cached |

**Test count deltas**: greenfield repo; counts match the handoff's claimed totals exactly.
**Not run by the Verifier**: clean-profile smoke (`extension/src/test/smoke.ts`, real ~170 MB download) — relied on the author's T60 smoke evidence (documented pixel-identical render + offline re-render) plus the offline corpus, which independently proves render fidelity from the cache.

---

## Discrimination Sensor (scratch-only; tree left clean)

| # | File:line | Behavior-level fault | Test run | Killed? |
| - | --------- | -------------------- | -------- | ------- |
| 1 | `extension/src/scheduler.ts:206` | stale-response discard `if (id < lastRequestId)` → `if (false)` (never discard stale) | `scheduler.test.ts` | ✅ 2 failed |
| 2 | `extension/src/host.ts:291` | FIFO serialization `await myTurn` → `await Promise.resolve()` (concurrent renders race) | `host.test.ts` | ✅ 1 failed (concurrency-serialized) |
| 3 | `extension/src/roots.ts:102` | case-insensitive type-dir match `name.toLowerCase()` → `name` | `roots.test.ts` | ✅ 3 failed |
| 4 | `engine/ConfigMapper.kt:29` | `toNightMode` NIGHT/NOTNIGHT flipped | `ConfigMapperTest` | ✅ 1 failed |
| 5 | `engine/Degradation.kt:52` | color degrade `#FF00FF` → `#00FF00` | `DegradationTest` (engineTest) | ✅ 1 failed |

**Sensor depth**: lightweight+ (5 mutations across both stacks and the P1-critical pure logic: scheduler coalescing, host concurrency, resolver casing, config mapping, degradation).
**Result**: **5/5 killed** — the suite discriminates the behaviors it covers. (Note: mutation #5 proves DegradationTest discriminates the color, yet that code is unwired — see G2.)

---

## Spec-Anchored Acceptance Criteria (representative + gap-bearing)

| Criterion | Spec outcome | Evidence (file — assertion) | Result |
| --------- | ------------ | --------------------------- | ------ |
| P1-A AC2 nested framework render | layoutlib-identical geometry | `host …/render/LayoutRendererTest.kt` (6-deep gallery renders) + corpus `framework_gallery` 0% diff | ✅ |
| P1-A AC3 syntax error + stale | 1-based line/col, keep last good | `LayoutRenderer.kt:79-88` maps kxml2 error; integration `hotreload.test.ts` "syntax error … stale image retained" | ✅ |
| P1-A AC4 include/merge/ViewStub/fragment | per-clause behavior | `StructuralTest` + `LayoutRendererTest` | ⚠️ correct for clean files; **G1** breaks it when tag-like text sits in a comment |
| P1-A AC6 data-binding unwrap + notice | replace `@{}`, notice | `DataBindingTest` | ⚠️ same G1 comment exposure |
| P1-B AC1/AC3 androidx/Material + ConstraintLayout | real classes, positioned | `MaterialGalleryTest` (real class assertions, chains/barriers) | ⚠️ **Chip/TextInputEditText/ExtendedFAB/BottomNav degrade to MockView** (Q5) — see AD-002 note |
| P1-B AC2 `?attr/` inheritance | full chain resolves | `MaterialGalleryTest` `?attr/colorPrimary` | ✅ |
| P1-B AC4 unknown Material attr → warning + version | `materialAttrMissing` names attr+version | `MaterialAttrMissingTest`; `LayoutRenderer.kt:116-123` | ✅ |
| P1-C AC1/AC2/AC5 drawable render/sizing/refs | via host, intrinsic/128dp, refs resolve | `DrawableCoreTest`; corpus drawables 0% diff | ✅ |
| P1-C AC4 nine-patch | corners unscaled at 2 sizes; malformed→fallback+warn | `NinePatchTest` | ✅ |
| P1-C AC6 adaptive-icon circular | corner transparent/center opaque | `AdaptiveIconTest` | ✅ |
| P1-D AC1–AC4 state picker | 4 states differ, matched index, ripple settled | `DrawableStateTest`; integration `drawable.test.ts` | ✅ |
| P1-E AC1 day/night selects `-night` | night differs iff night-varying inputs | `QualifierTest` (night→green pixels, notnight→blue) + integration plumbing | ✅ (host fidelity + plumbing) |
| P1-E AC2 device/orientation qualifiers | `-sw600dp` picked on tablet | `QualifierTest` (tablet→yellow) + integration plumbing | ✅ |
| P1-E AC3 density | density-qualified selection | `QualifierTest`/`ConfigMapperTest`; integration density | ✅ |
| P1-E AC4 theme picker applies | chosen theme applied | `ThemeCatalogEngineTest` + integration plumbing (theme sent, re-render) | ⚠️ Spec-precision: theme-switch **render** fidelity verified at plumbing layer only; themes do apply (renders run under Theme.Material3.DayNight) |
| P1-E AC5 per-file config persistence | restore on reopen incl. zoom | `config.test.ts`; integration "config and zoom persist … restore exactly" | ✅ |
| P1-F AC3 coalescing, no stale | latest wins, stale discarded | `scheduler.test.ts` (10-save burst) — **sensor #1 confirms discriminating** | ✅ |
| P1-G AC1 root discovery both trees, **case-insensitive type dir** | locate root for `res/` & `Resources/` | `roots.test.ts` (discovery, `.axml`, legacy casing) | ⚠️ discovery ✅ but **G3**: capital `Resources/Layout/` render fails end-to-end |
| P1-G AC2 reference-kind chain | priority resolution | `SessionTest` (app-beats-lib pixels) | ✅ |
| P1-G AC4 unresolved → per-kind degrade + warnings, **render still completes** | magenta/0dp/name + `unresolvedRef` list | `DegradationTest` (isolated only) — **sensor #5 confirms it discriminates** | ❌ **G2**: NOT wired into live `render` path (see below) |
| P1-H AC1–AC5 setup/download/doctor | verified downloads, guided JDK, doctor | `artifacts.test.ts`, `jdk.test.ts`, `doctor.test.ts`; author smoke (T60) | ✅ |
| P1-I AC1/AC3 crash/timeout/state machine | kill+backoff restart, gated dispatch | `host.test.ts` + chaos integration (kill/wedge/OOM/4th-crash) | ✅ |
| NFR-01 latency | warm layout p90 ≤700ms etc. | `docs/performance.md`: 84–99/13–15/79/82–86 ms — all PASS wide margin | ✅ |
| NFR-05 concurrency serialized | ≥3 previews, serialized per host | integration "3 concurrent … serialized" — **sensor #2 confirms discriminating** | ✅ |
| NFR-07 corpus ≥30 (≥12/≥12/≥6) | golden corpus in CI | 33 fixtures = 12 gradle + 12 dotnet + 6 drawable + 3 galleries; 42 combos | ✅ |

---

## Known-Open Gaps — CONFIRMED independently

### G1 — Preprocessor is not comment-aware (CONFIRMED, empirical)
Regex transform passes run on raw text with no comment protection. Verified with a throwaway probe (`Structural.process`, since removed):
- `<!-- TODO: convert to <merge> later -->` → the `<merge>` inside the comment was rewritten to `<FrameLayout …>` (`G1-COMMENT-CORRUPTED=true`).
- `<!-- <fragment android:name="Foo"/> -->` → substituted to a `<TextView …#5566AACC>` placeholder inside the comment.
Root cause: `preprocess/Structural.kt` (`MERGE_OPEN`, `FRAGMENT_SELF_CLOSE`, `INCLUDE_LAYOUT`), plus `DataBinding`/`Scan` all operate on raw content; `Preprocessor.validate()` only checks well-formedness, it does not strip/mask comments. **No discriminating test exists** → coverage ZERO for this behavior. Impact: real files with tag-like text in comments render wrong or `inflated to null` (LAY-02/LAY-04, P1-A AC4/AC6).

### G2 — Degradation not wired into the live render path (CONFIRMED)
`grep` proves `engine/Degradation.kt` is referenced **only** by `DegradationTest.kt` (engineTest); it is never called from `Preprocessor`, `LayoutRenderer`, `RenderRouting`, or `RpcServer`. No engineTest other than the isolated `DegradationTest` asserts `unresolvedRef`/magenta through the live path (`LayoutRendererTest` has no unresolved-ref case). Sensor #5 shows the isolated unit test *is* discriminating — but the code it guards is dead on the live path. Impact: a real layout referencing `@color/missing` fails inflation instead of degrading to `#FF00FF` + `unresolvedRef` warning. **Directly violates P1-G AC4 "the render SHALL still complete" and UX-05/RES-04.** End-to-end coverage ZERO.

### G3 — Legacy Xamarin capital-cased resource dirs don't render (CONFIRMED)
`fixtures/dotnet-sample/Resources/Layout/Main.axml` (capital L) exists but is **rendered nowhere** — all 12 .NET corpus fixtures use lowercase `fixtures/dotnet-gallery/Resources/layout/`. Extension discovery is case-insensitive (`roots.ts:102` `toLowerCase`, `isResFolderName`) so "Open Preview" lights up and the root is found; but host-side resolution is case-sensitive (`Structural.resolveLayoutFile`/`LayoutRenderer.resolveResourceFile`: `f.name == "layout" || startsWith("layout-")`) and layoutlib's folder-type parsing expects lowercase, so the render fails. **Violates P1-G AC1's "matched case-insensitively on the type dir" for the `Resources/` tree and AD-001 (.NET first-class), Q6.**

---

## Q5 / Chip vs AD-002 — user release-gate decision (recommend, not decide)

Under the AD-008 pin (Paparazzi 1.3.5 / layoutlib 14.0.11 / Material 1.12, JDK 17), **Chip, TextInputEditText, ExtendedFloatingActionButton, BottomNavigationView degrade to labeled MockView placeholders** (Q-TEXTAPP: Material `TextAppearance` ThemeEnforcement throws `NPE: TextAppearance.getTextSize()`), and several Material backgrounds/tints render as the magenta unresolved-color placeholder (Q-COLOR). **Chip is explicitly named in P1-B's Independent Test** and `MaterialGalleryTest` deliberately excludes it from its "inflates as the REAL class" assertion. This is documented in `docs/material-quirks.md`, not silently shipped.

**Tension**: AD-002 (user: "complete + faithful v1, render all the things") vs AD-008 (user: pin JDK 17 → older layoutlib). Fixing Chip fidelity requires a newer layoutlib/Paparazzi 2.x line that raises the floor to JDK 21, contradicting AD-008.

**Recommendation** (user decides): NOT an automated-test gap. Surface to the user as an explicit release-gate before v1 sign-off. Given it is (a) documented, (b) forced by an explicit user pin decision, and (c) still renders a readable labeled placeholder preserving structure, it is defensible as a documented v1 limitation — **but AD-002 is a USER decision, so the user must accept the Chip/Material-fidelity caveat (or authorize a pin bump) rather than the Verifier waiving it.**

---

## Ranked Gap List → Fix Tasks

1. **G2 (Major, hard SHALL)** — wire `Degradation.degradeReferences`/`degradeStyleParent` into the live path (pre-degrade content before overlay write in `Preprocessor`/`LayoutRenderer`). *Discriminating test to add*: engineTest — render a layout referencing `@color/missing @dimen/missing @string/missing @drawable/missing`; assert render **completes**, output shows magenta at the color'd view, and `RenderResponse.warnings` lists exactly 4 `unresolvedRef` entries with correct kinds. (AC: P1-G AC4 / RES-04 / UX-05.)
2. **G1 (Major, correctness)** — make the Preprocessor comment-aware (mask/skip `<!-- … -->` spans across `Structural`, `DataBinding`, `Scan`). *Discriminating test to add*: unit — a file with `<!-- <merge> @{expr} <com.x.Custom/> -->` must be inert (overlay byte-identical inside the comment; no substitutedClass/bindingReplaced warning; correct root). (AC: LAY-02/LAY-04, P1-A AC4/AC6.)
3. **G3 (Major, ecosystem)** — make host-side resource-dir resolution case-insensitive (or normalize casing into the overlay/session) so `Resources/Layout/*.axml` renders. *Discriminating test to add*: engineTest/corpus — render `dotnet-sample/Resources/Layout/Main.axml` (capital) and assert a non-blank render equal to its lowercase twin. (AC: P1-G AC1 / RES-01 / AD-001 / Q6.)
4. **Chip/Q5 (user decision)** — not a fix task; escalate AD-002-vs-AD-008 to the user for release sign-off.
5. **Minor (optional)** — P1-E AC4 theme-switch render fidelity is verified at the plumbing layer + `ThemeCatalog`; consider one engineTest asserting two different themes produce different renders of the same layout to close the spec-precision gap.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| LAY-01, LAY-05, LAY-06, LAY-07 | ✅ Verified |
| LAY-02, LAY-04 | ✅ Verified (**G1 CLOSED** — comment-aware preprocessor, `CommentAwareTest`) |
| LAY-03 | ✅ Verified (custom-view placeholder + warning) |
| DRW-01..08 | ✅ Verified (host-side worked around ripple/adaptive-icon per design) |
| RES-01 | ✅ Verified (**G3 CLOSED** — case-insensitive host resolution, `LegacyCasingTest`) |
| RES-02, RES-03, RES-05 | ✅ Verified |
| RES-04 | ✅ Verified (**G2 CLOSED** — degradation on live path, `DegradationLiveTest`); ⚠️ minor residual: `degradeStyleParent` (spec:453 style-parent edge case) still unwired |
| CFG-01/02/03/05 | ✅ Verified |
| CFG-04 | ⚠️ theme-apply render at plumbing layer |
| UX-01/02/03 | ✅ Verified |
| UX-04 | ✅ Verified (line mapping + stale retention) |
| UX-05 | ✅ Verified (**G2 CLOSED** — unresolvedRef warnings emitted on live path) |
| HOST-01/02/03 | ✅ Verified (state machine, FIFO queue, timeout/crash) |
| SETUP-01/02/03 | ✅ Verified (unit + author smoke) |
| NFR-01..07 | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Not Ready — 3 confirmed spec-AC gaps → fix tasks (bounded 3-iter).
**What works**: the entire happy-path surface — framework + androidx/Material render, all drawable types + state picker, config toolbar (day/night/device/density/theme/persistence), hot reload with coalescing + stale-discard, host lifecycle/crash-recovery/FIFO concurrency, setup/download/doctor, NFR-01 latency (wide margin), NFR-07 corpus (33 fixtures/42 combos, 0% diff). Sensor 5/5.
**Issues**: G1 (comment-unaware preprocessor, correctness), G2 (degradation dead on live path — hard SHALL uncovered), G3 (legacy Xamarin casing unrendered). Plus the Chip/AD-002 user decision.
**Next steps**: route gaps 1–3 to fix tasks with the discriminating tests above; escalate the Chip/Q5 vs AD-002 decision to the user.

---

## UI Polish Fix-Pack Verification (2026-07-26)

**Diff range**: `6d100e9..94a26b5` (T61–T68, "UI Polish Fix-Pack" amendment — POLISH-01..08, stories FP-1..FP-5).
**Verifier**: independent sub-agent (author ≠ verifier).

> **Editorial note (added by the iteration-2 re-verifier, 2026-07-26):** `tasks.md` (line ~2055) and `STATE.md` both state this section should already exist here — "results appended to `validation.md` as a dated 'UI Polish Fix-Pack Verification' section." No such section was found in this file when the re-verification pass began (confirmed by grepping the file for `POLISH`, `Fix-Pack`, and every string named in the handoff — zero matches; `git log` on this file shows no commit touching it since `213a948`, the v1 close). The iteration-1 Verifier's FAIL verdict and ranked gap list were relayed faithfully in the re-verification task brief, so they are reconstructed below for continuity, but they were **not independently re-derived from a persisted iteration-1 report** — they are recorded as received. This is itself a process gap (the persisted-report step was skipped or lost) and is flagged, not silently patched over.

### Verdict (iteration 1, as relayed): ❌ FAIL

**Ranked gap list (iteration 1):**
1. **[Major, real defect]** Busy/loading indicator never cleared if the render-engine download failed after the JDK was found — `activation.ts`'s `ensureRealHostConfigured` failure branch never cleared `entry.busy`. Violated the fix-pack's own edge case ("the in-panel indicator SHALL clear to the error state, not spin forever").
2. **[Minor]** The literal loading-phase strings ("Preparing render engine…", "Starting render host…", "Rendering…") had zero test evidence — only the generic busy/label mechanism was tested.
3. **[Minor]** `PendingMessageQueue`'s FIFO ordering was proven, but `PreviewPanelManager`'s actual wiring of it (flushing 2+ queued messages on 'ready') was never exercised.
4. **[Minor]** Drag-cancel (pointercancel/Esc) and no-image-no-affordance behavior in `main.ts` had no test evidence (code-reviewed correct, but the task's own Done-when overclaimed "unit-covered where pure").

### Re-verification (iteration 2)

**Fix commit**: `7a63834` "Clear the busy indicator when guided host setup fails" (claims to close gap #1, partially addresses gap #2). Gaps #3/#4 deliberately left open — triaged by the orchestrator as residual risk consistent with this codebase's established convention of never mocking `vscode` and never touching real async webview timing / DOM glue with jsdom (no prior task in 68+ has done either). This re-verification treats #3/#4 as accepted/known, not re-litigated, per its brief.

**Gap #1 — re-checked, genuinely fixed:**
- `extension/src/activation.ts:105-119` — `ensureRealHostConfigured(docPath?, onPhase?)` now takes an optional `docPath`; on `prepareRealHost` failure it calls `panelManager.applyHostError(docPath, new Error(result.guidedMessage))` (line 109) *before* showing the guided warning notification, when a `docPath` is available.
- `extension/src/panel.ts:282-288` — `applyHostError` sets `entry.busy = false` (line 286) and posts a `setError` message — this is the real clear-to-error-state path the spec's edge case demands, not cosmetic.
- `openPreviewFor` (`activation.ts:260-274`) is the one real-panel caller and now passes `docPath` (line 267). `inflate.restartHost` (`activation.ts:339-344`) still omits it — correct per its own comment ("no panel to clear"), since a manual restart has no specific document panel in scope.
- **Coverage reality check**: no test — unit or integration — exercises this exact path. Confirmed by: (a) `grep -rn "applyHostError" src/` finds only the two call sites in `activation.ts` and one comment in `retry.test.ts`; (b) every integration test runs under `INFLATE_TEST_FAKE_HOST` (set in `src/test/integration/runTest.ts:17`), and `ensureRealHostConfigured` short-circuits `if (isFakeHostMode) return true;` (`activation.ts:106`) *before* ever reaching `prepareRealHost` or the new `applyHostError` call — so the fake-host harness structurally cannot reach this line; (c) no `activation.test.ts` exists, and no test anywhere calls `prepareRealHost` or exercises its failure branches (`isGuidedError`/engine-install-catch) directly — this was true before the fix-pack too (this real-JDK-setup path has never had direct test coverage in this project). **Conclusion: pre-existing gap, not worsened by the fix-pack** — the fix is real and correct by code inspection + the discrimination-sensor mutation below, but it remains untested.

**Gap #2 — re-checked, fixed for the literal-string part:**
- `extension/src/loadingPhases.ts` exports `PHASE_PREPARING_ENGINE = 'Preparing render engine…'`, `PHASE_STARTING_HOST = 'Starting render host…'`, `PHASE_RENDERING = 'Rendering…'`, and `preparingEnginePhase(artifactKey, percent?)`. These match the spec's amendment section verbatim (`spec.md:610-612`: `"Preparing render engine…" with artifact + percent during a download, "Starting render host…", "Rendering…"`).
- `extension/src/loadingPhases.test.ts` (3 tests, all passing) asserts the exact three strings and both `preparingEnginePhase` forms (no percent / with percent).
- `activation.ts:21` imports all four; used at lines 174 (`PHASE_RENDERING` via `onDispatch`), 268 (`PHASE_STARTING_HOST`), 409/428 (`PHASE_PREPARING_ENGINE` / `preparingEnginePhase`). Verified no inline literal of any of the three phase strings remains anywhere in `activation.ts`/`panel.ts` outside comments/KDoc (`grep -rn "Preparing render engine…\|Starting render host…\|Rendering…" src/ webview-ui/` — every functional-code hit is a comment or a `panel.test.ts`/`messageQueue.test.ts` fixture literal for the generic busy/label mechanism, not a place that should have imported the constant).
- Gap #3/#4 (queue-flush wiring, drag-cancel/no-affordance) were, per the brief, deliberately not addressed this iteration — accepted as residual, not re-derived here.

### Gate (re-run by this re-verifier, not inferred)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Build | `cd extension && npm run build` | ✅ `dist/extension.js` 315.1kb, `dist/webview.js` 20.1kb — no errors |
| Unit | `cd extension && npm test` | ✅ **193 passed**, 0 failed (15 files, incl. `loadingPhases.test.ts` 3/3) |
| Integration | `cd extension && npm run test:integration` | ⚠️ **20 passed, 5 failed** — all 5 failures are in `chaos.test.ts` ("Inflate chaos and robustness (T58)"), each erroring `initialize failed: .../host/.engine-cache/layoutlib/runtime/build.prop (No such file or directory)`. This worktree has no `host/.engine-cache` (the real layoutlib runtime cache is not present in this isolated checkout) — an environment/fixture-availability issue, not a code defect, and not touched by the fix-pack diff (chaos.test.ts drives a real JVM host unrelated to any POLISH-0x change). Matches the prior pass's note that `chaos.test.ts` failures here are environment-flaky, not a fix-pack regression. The 6th chaos test ("a tiny -Xmx heap crash…") passed since it doesn't depend on the missing cache. |

Note: `node_modules` was not present in this worktree checkout and required `npm install` before any gate command would run (unrelated environment setup, not a code issue). A `--user-data-dir` launch-arg override was needed on the compiled (gitignored) `out/test/integration/runTest.js` to work around a macOS AF_UNIX socket-path-length limit triggered by this worktree's long nested path (`.claude/worktrees/agent-.../.vscode-test/user-data/1.13-main.sock` > 103 chars) — this only touches a gitignored build artifact, never the tracked source, and does not change test behavior or outcomes.

### Discrimination Sensor (scratch-only; tree left clean)

| # | File:line | Mutation | Test run | Result |
| - | --------- | -------- | -------- | ------ |
| 1 | `extension/src/activation.ts:109` | Commented out `if (docPath) panelManager.applyHostError(docPath, new Error(result.guidedMessage));` (the entire gap-#1 fix line) | `npm test` + `npm run test:integration` (full gate, both stacks) | ❌ **Survived** — unit: 193/193 still pass (unchanged); integration: still exactly 20 passed / 5 failed (the same 5 pre-existing chaos failures, nothing new). No test anywhere detects the removal. |

**Sensor depth**: 1 targeted mutation against the specific new fix under re-verification (proportionate — this is a re-verify pass on one already-scoped commit, not a fresh feature).
**Result**: 0/1 killed — **confirms the coverage-reality-check above as an empirical, not just inferred, finding**: this exact line is currently unreachable by any test in the suite (fake-host mode always short-circuits before it), so a regression here would ship silently. This is graded a **residual gap, not a new defect** — the fix itself is correct by inspection (`panelManager.applyHostError` demonstrably sets `entry.busy = false`), and building deterministic coverage for it would require either mocking `vscode` (a testing convention this codebase has never used, across 68+ tasks) or running the integration suite against a real, unconfigured JDK/engine environment (which the fake-host harness exists specifically to avoid). Mutation reverted; `git diff` confirmed empty; `git status` confirmed clean after restore.

### Verdict: ✅ PASS

Gap #1 (the sole Major/blocking finding from iteration 1) is genuinely fixed: `entry.busy` is cleared and the panel is driven to a settled error state on a guided-setup failure, for the one caller (`openPreviewFor`) that has a panel to clear. Gap #2 is fixed for its literal-string claim (now unit-tested, verbatim-matched to spec). Gaps #3/#4 remain intentionally untested, as pre-triaged and accepted by the orchestrator — re-confirmed here as not newly broken, so they do not block PASS per this re-verification's own mandate. No NEW Major defect was found. The one open item is a **known, accepted, and now empirically-confirmed residual gap** (gap-#1's fix line has no direct test — sensor mutation #1 survived) rather than a fresh regression; it is not escalated to a 3rd fix→re-verify iteration because iteration 1's actual blocking defect (the busy indicator never clearing) is resolved and the remaining exposure is coverage-only on code that mirrors this project's long-standing, deliberate real-host-path testing boundary.

**Gate**: build ✅ · unit 193/193 ✅ · integration 20/25 (5 chaos failures, environment-only, non-regression) — same shape as iteration 1's own recorded chaos flakiness.
**Sensor**: 1 mutation injected, 0 killed, 1 survived (documented residual, not treated as a blocking finding per the task's explicit instruction).

## Drag-Resize Defect Fix Verification (2026-07-26)

**Diff range**: `144975d..bf6d24b` (T69–T70, phase 15, "Drag-Resize Defect Fix Tasks" amendment — DF-1, requirement POLISH-09).
**Verifier**: independent sub-agent (author ≠ verifier).

### Task Completion Check

| Task | Done-when item | Evidence | Status |
| ---- | --------------- | -------- | ------ |
| T69 | `draggable="false"` on `#preview` | `extension/src/webview.ts:131` | ✅ |
| T69 | `#preview` rule has `-webkit-user-drag: none` + `user-select: none` | `extension/src/webview.ts:91-92` | ✅ |
| T69 | `#stage` rule has `user-select: none` | `extension/src/webview.ts:89-90` | ✅ |
| T69 | No other shell markup/CSS changed | `git show ea1aa8e --stat` — only `webview.ts` (+8/-3) and `webview.test.ts` (+20) touched; prior POLISH-01/05/08 tests still pass (see gate below) | ✅ |
| T69 | Quick gate passes | `npm run build && npm test` — ✅ (see Gate table) | ✅ |
| T70 | `pointerdown` calls `preventDefault()` + `setPointerCapture` (resize and pan both, since the call precedes the zone branch) | `extension/webview-ui/main.ts:371-372` | ✅ |
| T70 | Capture released on pointerup/pointercancel | `extension/webview-ui/main.ts:437` (pointerup), `:464` (pointercancel) | ✅ |
| T70 | `dragstart` suppressed document-wide | `extension/webview-ui/main.ts:366-368` | ✅ |
| T70 | Esc/pointercancel abort semantics unchanged | pointercancel handler (`main.ts:462-468`) still clears `resizeDrag`/`hideGhost`/`dragStart` with no postMessage, identical to pre-fix FP-3 AC7 logic — only the capture-release line was added | ✅ |
| T70 | Full gate passes | `npm run build && npm test && npm run test:integration` — ✅ (see Gate table) | ✅ |
| T70 | Interactive UAT (AD-018, mandatory) | Recorded in `bf6d24b`'s commit body: corner/edge drags show dashed ghost only (no native ghost/badge), release-outside-panel completes, Esc aborts, center-drag pans, drawable corner-drag re-renders. Code inspection supports every claimed mechanism (see AC table below); the artifact itself (video) is unavailable to this Verifier, so this line is evidence-as-recorded, not independently re-witnessed | ✅ (recorded; not independently re-observed — see caveat below) |

**Caveat on the UAT line**: per AD-018, native-drag hijack is structurally invisible to jsdom/string-level tests — this Verifier has no way to re-run a real Chromium drag either, so the interactive-UAT claim is accepted as evidence per the task's own design (commit-body record + code-level plausibility check), not re-derived from raw video. This mirrors the same trust boundary the fix-pack's own T68 UAT used.

### Spec-Anchored Acceptance Criteria (POLISH-09)

| # | Criterion | Check | Result |
| - | --------- | ----- | ------ |
| AC1 | Preview image not natively draggable; no text/image selection inside the stage | `webview.ts:131` (`draggable="false"`), `:91-92` (`-webkit-user-drag: none; user-select: none` on `#preview`), `:89-90` (`user-select: none` on `#stage`); asserted by 3 new tests in `webview.test.ts:89-107`, all passing | ✅ PASS |
| AC2 | Pointerdown starting resize/pan calls `preventDefault()` + `setPointerCapture`; `dragstart` suppressed document-wide | `main.ts:371-372` (unconditional, before the zone branch, so both resize and pan paths are covered), `:366-368` (document-level `dragstart` listener) | ✅ PASS |
| AC3 | Release outside panel completes normally (no stuck ghost); Esc/pointercancel abort unchanged | `pointerup` (`main.ts:435-458`) and `pointercancel` (`main.ts:462-468`) logic paths unchanged apart from the added capture-release line; window-level listeners (not stage-scoped) already fire regardless of pointer position, and `setPointerCapture` guarantees continued delivery outside the element bounds — this is exactly what capture is for. Confirmed live in the recorded UAT (release-outside-panel case named explicitly in the commit body) | ✅ PASS |
| AC4 | Fix verified by string-level shell invariants AND mandatory interactive UAT, evidence in the closing commit | `webview.test.ts` invariants present and green; `bf6d24b` commit body contains the UAT narrative | ✅ PASS |

**4/4 criteria PASS.**

### Gate (run by this Verifier, not inferred)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Build | `cd extension && npm run build` | ✅ `dist/extension.js` 315.2kb, `dist/webview.js` 20.5kb — no errors |
| Unit | `cd extension && npm test` | ✅ **196 passed**, 0 failed (15 files) |
| Integration | `cd extension && npm run test:integration` | ✅ **25 passed**, 0 failed — includes the two edge-drag config-flow suites (`fix-pack POLISH-07, FP-3 AC5`/`AC4`) and all `chaos.test.ts` (T58) tests; this checkout has a populated `host/.engine-cache`, unlike the prior fix-pack re-verification's worktree |

Full gate green end-to-end — no environment caveats this time.

### Discrimination Sensor (scratch-only; tree left clean)

| # | File:line | Mutation | Test run | Result |
| - | --------- | -------- | -------- | ------ |
| 1 | `extension/src/webview.ts:131` | `draggable="false"` → `draggable="true"` | `npm test -- src/webview.test.ts` | ✅ **Killed** — "marks the preview image non-draggable" fails |
| 2 | `extension/src/webview.ts:92` | Removed `-webkit-user-drag: none; ` from the `#preview` rule | same run | ✅ **Killed** — "suppresses the native drag ghost and text/image selection on #preview" fails |

Both mutations applied together via one `sed` pass, run, then reverted (`mv src/webview.ts.orig src/webview.ts`); `git diff` confirmed empty and `npm test -- src/webview.test.ts` re-run green (14/14) after restore. **2/2 killed.**

Per AD-018 and the task brief, the `main.ts` pointer-glue mutations (AC2/AC3) are **not** sensor-tested here — this is the same structurally-untestable-by-jsdom gap the fix itself exists to work around, already documented in AD-018 and `tasks.md`'s Test Coverage Matrix (real-browser behavior only observable via interactive UAT). No fake DOM test was invented to paper over this.

### Independent dp-math sanity check (not a POLISH-09 requirement — informational, per the implementer's request)

Read `extension/webview-ui/viewport.ts:180-198` (`dragSizeToDp`) and `extension/webview-ui/main.ts:390-397` (`draggedGhostSize`) directly, tracing the zone='right' and zone='bottom' cases by hand:

- `draggedGhostSize`: for `zone==='right'`, `h` is hard-set to `drag.anchor.height` (the drag-start display height) — never `+ dy`; for `zone==='bottom'`, `w` is hard-set to `drag.anchor.width`. So exactly one axis moves with the pointer at the displayed-px level, per zone — correct.
- `dragSizeToDp`: `scaleH = startDp.h / startDisplayPx.h` where `startDisplayPx` is the same `anchor` rect. For `zone==='right'`, `draggedDisplayPx.h === anchor.height` (unchanged from start), so `h_new = round(anchor.height * (startDp.h / anchor.height)) = round(startDp.h)` — the fixed axis's dp value round-trips to itself (identity, modulo rounding), not skewed by the other axis's drag delta. Symmetric argument holds for `zone==='bottom'` and `w`.

**Conclusion: no dp-axis coupling bug.** The fixed axis is genuinely held constant at both the displayed-px and dp levels. This independently corroborates the implementer's diagnosis: the on-screen box appearing to change on an unexpected axis after some edge-drags is consistent with `applyZoom`/`computeFitPercent` (T52, `viewport.ts`/`main.ts`) recomputing the fit-to-window scale from the new PNG's raw pixel dimensions after each render — a **display-layer rescale artifact**, not a resize-math defect. This is out of POLISH-09's scope and is not a gap in this fix; recorded here only as the requested sanity check. No lesson is filed for it (not a grounded gap in the code under test), but it is proposed as a tracked non-blocking follow-up in `STATE.md` (see Handoff addition below, applied by the orchestrator).

### Verdict: ✅ PASS

Both tasks' Done-when criteria are met with direct file:line evidence. All 4 POLISH-09 acceptance criteria pass. Full gate is green (196 unit + 25 integration, 0 failures) — the first fully clean full-gate run recorded in this file's history (no chaos-test environment caveats). The 2 targeted mutations against the one sensor-testable layer (AC1's shell markup/CSS) were both killed. The `main.ts` pointer-glue (AC2/AC3) remains — as AD-018 itself documents — outside what any automated sensor in this stack can exercise; its correctness rests on code inspection plus the recorded interactive UAT, exactly as the task was designed to be verified. No new defect found. The dp-math sanity check requested alongside this verification independently confirms `dragSizeToDp`/`draggedGhostSize` hold the correct axis fixed — the fit-zoom rescale interaction the implementer flagged is a real but out-of-scope UX follow-up, not a POLISH-09 gap.

**Gate**: build ✅ · unit 196/196 ✅ · integration 25/25 ✅ — fully clean, no environment caveats.
**Sensor**: 2 mutations injected against the sensor-testable layer, 2 killed, 0 survived. `main.ts` pointer-glue changes are out of sensor reach per AD-018 (expected, not a gap).
**Informational**: dp-axis sanity check on `dragSizeToDp`/`draggedGhostSize` — no bug found; fit-zoom rescale UX interaction confirmed as the more likely explanation, tracked as a non-blocking follow-up, not a POLISH-09 defect.

---

## Release & Publish Automation Verification (2026-07-26)

**Scope**: spec section "Release & Publish Automation (Amendment — 2026-07-26)" (`spec.md:812-851`, REL-01..REL-05), tasks T71–T76 (phases 16–18)
**Diff range**: `9d7432a..cc356c0` (implementation: `571e1cd` T71, `4a5aa34` T72, `fca863e` T73, `da14ddf` T74, `3f3c25f` T75, `21f8061` renumber, `cc356c0` T76) — diff surface = 4 workflows + `extension/README.md` + `extension/CHANGELOG.md` + 3 docs + specs/STATE.md only; no shipped code touched (matches the amendment's non-goal)
**Verifier**: independent sub-agent (author ≠ verifier); every check below re-run from scratch, not read off the author's gate transcript
**Method note**: workflow YAML has no local runtime (per the amendment's Test Coverage Matrix, `tasks.md:2231-2245`). Verification = YAML parse + an independent 44-assertion structural suite written by this verifier (`ruby -ryaml`, per-AC), packaging/CLI runs, docs greps, and a semantic review of GitHub-side behavior. GitHub-side execution itself is unverifiable locally — see Accepted Residual Gaps.

### Verdict: ✅ PASS

All 20 acceptance criteria across REL-01..REL-05 hold with direct evidence. Independent structural suite 44/44. Packaging gate exit 0 with both listing files packaged. Unit suite 196/196 (no regression; count unchanged from the pre-amendment record, consistent with a no-code-change amendment). Discrimination sensor 3/3 killed. Three beyond-AC semantic findings flagged (1 Major-reliability, 2 hardening) — none violates a spec AC; recommended as follow-up fix material before/at first live use.

### Task Completion

| Task | Status | Evidence |
| ---- | ------ | -------- |
| T71 | ✅ Done | commit `571e1cd`; `tasks.md:2287` |
| T72 | ✅ Done | commit `4a5aa34`; `tasks.md:2297` |
| T73 | ✅ Done | commit `fca863e`; `tasks.md:2306` |
| T74 | ✅ Done | commit `da14ddf`; `tasks.md:2315` |
| T75 | ✅ Done | commit `3f3c25f`; `tasks.md:2325` |
| T76 | ✅ Done | commit `cc356c0` (STATE.md AD-019 `:126-132`, AD-004 amendment `:36`, Handoff `:136-137`); `tasks.md:2334` |

### Spec-Anchored Acceptance Criteria (all re-derived and re-run by the verifier)

| AC | Spec-defined outcome | Evidence (file:line / command output) | Result |
| -- | -------------------- | ------------------------------------- | ------ |
| REL-01 AC1 | `extension/README.md` exists, packaged, covers purpose/features/requirements/quickstart/settings/links | `cd extension && npx vsce ls --no-dependencies` → `README.md` listed (10 files). Topics: purpose `extension/README.md:3-9`, features `:11-19`, requirements macOS `:23` + JDK 17+ `:26-27`, quickstart `:38-45`, settings table `:57-64`, repo/issues links `:89-92` | ✅ PASS |
| REL-01 AC2 | `extension/CHANGELOG.md` exists, packaged, has a `1.0.0` section | `vsce ls` → `CHANGELOG.md` listed; `extension/CHANGELOG.md:6` `## 1.0.0` | ✅ PASS |
| REL-01 AC3 | `cd extension && npm run package` exits 0 | Run by verifier: `package_exit=0`, `DONE Packaged: …/inflate-0.0.1.vsix (12 files, 34.99 MB)` — filename also empirically confirms release.yml's `inflate-<version>.vsix` convention | ✅ PASS |
| REL-02 AC1 | `ci.yml` `on:` exactly `workflow_dispatch` + `workflow_call`; no push/pull_request | `ci.yml:16-30`; ruby parse: `on` keys == `[workflow_call, workflow_dispatch]`, no `push`/`pull_request` keys | ✅ PASS |
| REL-02 AC2 | `smoke-x64` removed; remaining gate on `macos-26` | jobs == `[build-and-test-arm64]` (`ci.yml:42`), `runs-on: macos-26` (`ci.yml:43`); no `smoke-x64:` job key anywhere; removal diff verified in `4a5aa34` | ✅ PASS |
| REL-02 AC3 | Both triggers take optional string `ref` default `''`; every checkout passes `ref: ${{ inputs.ref }}` | dispatch input `ci.yml:18-23`, call input `ci.yml:24-30` (both `type: string`, `required: false`, `default: ''`); 1/1 checkout steps pass it (`ci.yml:45-47`) | ✅ PASS |
| REL-02 AC4 | canary keeps daily `schedule` + `workflow_dispatch`, runs on `macos-26` | `canary.yml:7-10` (`cron: '17 6 * * *'` — day/month/weekday `* * *` = daily), `runs-on: macos-26` `canary.yml:17` | ✅ PASS |
| REL-03 AC1 | triggers on `issue_comment` type `created` | `run-ci-comment.yml:17-19`; parsed == `{issue_comment: {types: [created]}}` (sole trigger) | ✅ PASS |
| REL-03 AC2 | gate only when comment-on-PR AND body startsWith `/run ci` AND author_association ∈ {OWNER,MEMBER,COLLABORATOR}; CONTRIBUTOR/FIRST_TIME_CONTRIBUTOR/NONE can never trigger | `run-ci-comment.yml:48-51` (gate) and `:32-35` (ack): all three conditions AND-joined, exact `fromJSON('["OWNER","MEMBER","COLLABORATOR"]')` list, no other association granted anywhere | ✅ PASS |
| REL-03 AC3 | gate = `ci.yml` via `workflow_call` with `ref: refs/pull/<PR#>/merge` | `run-ci-comment.yml:52-54` — `uses: ./.github/workflows/ci.yml`, `with.ref: refs/pull/${{ github.event.issue.number }}/merge` | ✅ PASS |
| REL-03 AC4 | ack comment linking the run posted on the PR | `run-ci-comment.yml:38-43` — `gh api repos/…/issues/<N>/comments` with `…/actions/runs/${{ github.run_id }}` (same run hosts the reusable-workflow gate, so the link shows the gate) | ✅ PASS |
| REL-03 AC5 | neither run-ci-comment.yml nor ci.yml references `VSCE_PAT`/`OVSX_TOKEN`; publish credentials unreachable from comment-triggered runs | grep: zero non-comment matches and zero `secrets.` usage in both files (sole textual match is the header comment `run-ci-comment.yml:13`, which references nothing). Secrets appear only in `release.yml:78,84`, which has no comment trigger | ✅ PASS (evidence note: a literal raw-text grep false-positives on the comment mention; the spec's operative outcome — credentials unreachable — is what was asserted) |
| REL-04 AC1 | `release.yml` ONLY on `workflow_dispatch` with required `bump` choice ∈ {patch,minor,major} | `release.yml:19-29`; parsed: sole trigger; `bump` `type: choice`, `required: true`, `options == [patch, minor, major]` | ✅ PASS |
| REL-04 AC2 | order gate → bump → build → publish → record; `npm version` no local tag; root `npm run package`; `vsce publish --packagePath` + `VSCE_PAT`; commit `Release <v>` + tag `v<v>` pushed to run's branch; GH Release `--generate-notes` + VSIX; publish precedes push | `release.yml:42-43` gate uses ci.yml, `:46` `needs: gate`; step indices bump(4) < build(5) < marketplace-publish(6) < push(8) < gh-release(9); `--no-git-tag-version` `:68`; root `npm run package` `:73` (script verified: shadowJar + VSIX); `env VSCE_PAT` `:77-78` + `vsce publish --packagePath … -p "$VSCE_PAT"` `:79`; commit msg `:97`, rebase `:99` before tag `:100`, `git push origin "HEAD:${{ github.ref_name }}" "v<v>"` `:101`; `gh release create "v<v>" extension/inflate-<v>.vsix --generate-notes` `:107-110`. Nothing is pushed before `:92` ⇒ failed gate/build/publish leaves the branch untouched | ✅ PASS |
| REL-04 AC3 | Open VSX only when `OVSX_TOKEN` non-empty (shell guard) | `release.yml:86-90` — `if [ -n "$OVSX_TOKEN" ]`, positioned between Marketplace publish and push | ✅ PASS |
| REL-04 AC4 | `concurrency: release`, `cancel-in-progress: false` | `release.yml:35-37`; parsed == `{group: release, cancel-in-progress: false}` | ✅ PASS |
| REL-04 AC5 | workflow `permissions:` = `contents: write`, nothing broader | `release.yml:31-32`; parsed == exactly `{contents: write}` | ✅ PASS |
| REL-05 AC1 | dated runbook: publisher setup chain, PAT retirement 2026-12-01 + Entra alternative, first release = bump `major` 0.0.1 → 1.0.0 | `docs/release-checklist.md:130` (dated heading); Microsoft account `:138`; Azure DevOps org `:139-140`; PAT "All accessible organizations" `:143-144` + "Marketplace → Manage" `:145`; retirement date + `--azure-credential` Entra alternative `:147-150`; create publisher at marketplace.visualstudio.com/manage `:151-153`; set real `publisher` `:154-156`; `VSCE_PAT` secret `:157-158`; optional `OVSX_TOKEN` `:159-162`; "First release: pick `major` — 0.0.1 becomes 1.0.0" `:167-170` | ✅ PASS |
| REL-05 AC2 | CONTRIBUTING documents manual-only CI + `/run ci` (maintainer/collaborator-only) | `CONTRIBUTING.md:63-68` — "on demand only — there are no automatic push/PR runs", Actions tab, `/run ci` "restricted to the owner and explicitly invited collaborators" | ✅ PASS |
| REL-05 AC3 | limitations notes Intel best-effort; users still get correct x64 artifacts at runtime | `docs/limitations.md:142-147` — best-effort + "Intel users still receive the correct x64 engine natives at first run" | ✅ PASS |

**Status**: ✅ 20/20 ACs covered with evidence; 0 spec-precision gaps.

### Gate Check (independently re-run)

- YAML parse: all four workflows parse (`ruby -ryaml`) ✅
- Independent structural suite (written by this verifier, not the author's greps): **44/44 PASS**
- `cd extension && npx vsce ls --no-dependencies`: README.md + CHANGELOG.md listed ✅
- `cd extension && npm run package`: **exit 0** ✅ (built VSIX removed after verification; `*.vsix` is gitignored)
- `cd extension && npm test`: **196/196 passed, 15 files, exit 0** — test count unchanged vs the pre-amendment record (196), correct for an amendment whose coverage matrix declares no code layer touched
- Empirical CLI checks: `npm version major --no-git-tag-version` on a scratch copy outputs exactly `v1.0.0` (single stdout line; `${VERSION#v}` parse correct; `package-lock.json` bumped too and both files are git-added in `release.yml:96`); extension has no `preversion`/`version`/`postversion` scripts that could pollute stdout; vsce **3.9.2** `publish --help` confirms `-i, --packagePath <paths...>` and `-p, --pat <token>`; `ovsx publish [extension.vsix] -p <token>` confirmed against ovsx 1.0.2 via `npx --yes`

### Discrimination Sensor (scratch-only; tree restored and verified clean)

Adapted per the amendment's coverage matrix: the executable "tests" are the per-AC structural assertions; mutations target the workflow invariants the ACs pin.

| # | File | Mutation | Result |
| - | ---- | -------- | ------ |
| A | `.github/workflows/ci.yml` | added a `push: branches: [main]` trigger under `on:` | ✅ **Killed** — REL-02 AC1 assertions fail (on-keys-exact + no-push) |
| B | `.github/workflows/run-ci-comment.yml` | added `"CONTRIBUTOR"` to the `fromJSON` guard list | ✅ **Killed** — 4 REL-03 AC2 assertions fail (exact-list + no-untrusted-grant, ack & gate) |
| C | `.github/workflows/release.yml` | moved the commit+tag+push step before the Marketplace publish | ✅ **Killed** — REL-04 AC2 order assertion fails (push idx 6 < publish idx 7); AC3 position check also trips |

Each mutation applied alone, assertions run, then restored via `git checkout --`; `git status --porcelain` empty after each and at the end; baseline suite re-run 44/44 after final restore. **3/3 killed, 0 survived.**

### Semantic Review Beyond the ACs (real-world GitHub-side hazards the structural ACs cannot see)

**Findings (none violates a spec AC; ranked):**

1. **[Major reliability, PLAUSIBLE — mechanism supported by documented run-level concurrency semantics; not executable locally] Any new comment on a PR cancels that PR's in-progress `/run ci` gate.** `run-ci-comment.yml:26-28` sets *workflow-level* `concurrency: run-ci-comment-pr-${{ github.event.issue.number }}` with `cancel-in-progress: true`, while the `/run ci` guards live only at *job* level (`:32-35`, `:48-51`). `issue_comment` fires for every created comment; job `if`s skip jobs but do not prevent the run from being created and entering the concurrency group, and run-level cancel-in-progress applies when the new run is queued — before job conditions evaluate. Net effect: ordinary PR discussion (any author, any body) during a running gate cancels the gate; an outside commenter can grief-cancel maintainer-started gates at will (cancellation only — no code execution, no secrets; the guard itself remains airtight for *triggering*). The header's stated intent ("a newer /run ci supersedes a still-running older one", `:25`) needs cancellation only among guarded runs. Fix direction for a follow-up task: move the concurrency block to job level on both jobs (skipped jobs never enter a concurrency group), keeping the same group key. Note the runbook's first-run sanity step (one CI dispatch) would not surface this — it needs a comment racing a live gate.
2. **[Minor hardening, PLAUSIBLE] Cache-poisoning chain from comment-triggered gates into the privileged release gate.** `issue_comment` runs execute with `github.ref` = default branch, so a `/run ci` gate that checks out and executes untrusted PR code (`refs/pull/N/merge`) saves `actions/cache` entries (`ci.yml:61-65`, key `engine-cache-<manifest-hash>`) scoped to `main`. PR code that leaves `extension/engine-manifest.json` untouched but poisons `host/.engine-cache` contents before the post-job save publishes a trusted-key, main-scoped poisoned cache — later restored by `release.yml`'s gate, which runs with inherited `contents: write` (`release.yml:31-32`, `:42-43`) and executes the cached engine jars in tests. Narrow preconditions: a maintainer must deliberately `/run ci` a malicious PR AND the exact key must not already be cached (exact-hit skips save — so the window is essentially post-pin-bump). Hardening options: event-scoped cache key or `lookup-only` restores for comment-triggered runs.
3. **[Minor hardening, CONFIRMED grant / minor impact] Untrusted PR code in the gate holds a token with `issues: write`.** `run-ci-comment.yml:21-23` grants workflow-level `contents: read` + `issues: write`; a called workflow's jobs receive at most — and here inherit — the caller's permissions, so PR code run by the gate (`:45-52`) can post/edit issue comments as the bot for the duration of the run. Hardening: job-level `permissions: { contents: read }` on the `gate` job. (Informational nit, no action needed: `startsWith(body, '/run ci')` also accepts e.g. `/run cix` / trailing text — trailing text looks intended, and the association guard still applies.)

**Verified sound (checked, no issue):** `inputs` context is valid for both `workflow_dispatch` and `workflow_call` (REL-02 AC3's single `ref` plumbing is correct for all three callers; empty ref ⇒ checkout's default behavior). ci.yml's workflow-level concurrency group `ci-${{ inputs.ref || github.ref }}` is correctly documented (`ci.yml:32-34`) as ignored under `workflow_call` — callers own their groups (`release`: serialized no-cancel; `run-ci-comment`: per-PR) — and is coherent for direct dispatches. release.yml's git choreography is coherent: detached/branch checkout → commit → `pull --rebase` → tag → single `push origin HEAD:<ref> <tag>` (tag created after rebase points at the landing commit; gitignored build outputs `extension/host.jar`, `dist/`, `out/` keep the tracked tree clean for the rebase; the shallow default checkout still rebases the raced case since raced commits descend from the fetched tip). `vsce publish --packagePath <vsix> -p "$VSCE_PAT"` is a valid vsce 3.9.2 invocation (flags confirmed against the pinned CLI); VSIX filename convention confirmed empirically (`inflate-0.0.1.vsix`). The ack comment cannot re-trigger the workflow (GITHUB_TOKEN-created events start no runs). The `publisher` field is still the `"inflate"` placeholder — publish would fail until the runbook's step 5 is done, and that is exactly what `docs/release-checklist.md:154-156` + STATE.md Handoff `:137` document as an outstanding user step, not a defect.

### Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep (diff surface = exactly the spec'd workflows, listing files, docs, specs) | ✅ |
| Surgical changes (canary diff = runner label + comment only; no shipped-code files touched) | ✅ |
| Matches patterns (amendment sections appended to existing spec/context/tasks files; verb-first atomic commits per task) | ✅ |
| Spec-anchored outcome check (every assertion targets the AC's precise outcome) | ✅ |
| Coverage expectation per the amendment's matrix (static validation + packaging + content presence; no unclaimed tests — no tests added, correct for a no-code amendment) | ✅ |
| Documented guidelines followed (`tasks.md` Execution Protocol; append-only validation.md; STATE.md decision log) | ✅ |

### Accepted Residual Gaps

1. **Live GitHub-side behavior is unverifiable locally** (triggers, guards, publish path, runner labels). Confirmed this is explicitly documented as a runbook step: `docs/release-checklist.md:193-194` ("Sanity-run CI once from the Actions tab — this doubles as the live verification … they cannot be exercised locally") and STATE.md AD-019 trade-off (`.specs/STATE.md:129`). First-run verification remains open by design.
2. **Publish-succeeded/push-failed race window** in release.yml — accepted by REL-04 AC2's design (publish precedes push); recovery documented in `release.yml:7-11` header and `docs/release-checklist.md:176-183` (explicitly: do not re-run).
3. **Publisher account + real `publisher` id + secrets** — cannot be automated; documented outstanding user steps (`docs/release-checklist.md:136-162`, STATE.md Handoff `:137`).

### Requirement Traceability

| Requirement | Status after verification |
| ----------- | ------------------------- |
| REL-01 | ✅ Verified |
| REL-02 | ✅ Verified |
| REL-03 | ✅ Verified (semantic follow-ups #1–#3 recommended, beyond-AC) |
| REL-04 | ✅ Verified |
| REL-05 | ✅ Verified |

### Lessons

None recorded — the policy's qualifying signals (failed/uncovered AC, surviving mutant, spec-precision gap, spec deviation, gate fail) are all absent: 20/20 ACs pass, sensor 3/3 killed, gates green. The three semantic-review findings are beyond-AC follow-up recommendations (candidate fix tasks), not lesson-qualifying verification failures; stated here per the lessons self-check so the skip is explicit, not silent.

### Summary

**Overall**: ✅ PASS — Ready (pending the documented user-side publisher setup and the documented first-run live verification).
**Spec-anchored check**: 20/20 ACs matched the spec-defined outcome; 0 spec-precision gaps.
**Gate**: structural suite 44/44; packaging exit 0 with both listing files packaged; unit 196/196.
**Sensor**: 3 injected, 3 killed, 0 survived.
**Follow-up recommendations (beyond-AC, non-blocking)**: (1) job-level concurrency for `run-ci-comment.yml` so unrelated PR comments can't cancel a running gate — Major reliability; (2) event-scoped or lookup-only engine cache for comment-triggered gates — Minor hardening; (3) `permissions: contents: read` on the `/run ci` gate job — Minor hardening.

### Re-verification — Fix Iteration 1 (2026-07-26, commit `78d6808`)

**Scope**: delta only — `.github/workflows/run-ci-comment.yml` + `.github/workflows/ci.yml` (`78d6808` "Harden the /run ci gate against comment races and untrusted-code reach", 26 insertions / 5 deletions, no other files). Independently re-inspected from the diff and the working files; a 17-assertion delta suite was written and run by this verifier, plus the original 44-assertion structural suite re-run for AC regression.

**Verdict: ✅ PASS — all three findings closed; no new hazard; no AC regression.**

| Finding | Fix as implemented | Closure evidence | Verdict |
| ------- | ------------------ | ---------------- | ------- |
| #1 Major — any comment cancels a running gate | Concurrency group is now a ternary on the exact job guard: `run-ci-comment-${{ (<3-condition guard>) && format('pr-{0}', github.event.issue.number) \|\| github.run_id }}` (`run-ci-comment.yml:31-33`) | Programmatic check: the parenthesized ternary condition, whitespace-normalized, is **string-identical** to both jobs' `if` guards (`:37-40`, `:55-58`) — grouping and job execution can never disagree. Guard-matching `/run ci` ⇒ group `pr-<N>` (newer supersedes older — the intended, now maintainer-only, cancel); every other comment (plain-issue comment, non-command body, untrusted author) ⇒ falsy `&&` chain ⇒ `\|\| github.run_id` ⇒ a unique throwaway group that can cancel nothing. Expression semantics verified: `&&` binds tighter than `\|\|`; the truthy arm `format('pr-{0}', …)` is always a non-empty string, so the `&&/\|\|` ternary idiom's falsy-arm pitfall cannot misfire; `github` context and `startsWith`/`contains`/`fromJSON`/`format` are all valid in workflow-level `concurrency` expressions; the comment body is only ever an operand of `startsWith` inside an expression (no shell, no injection surface) | ✅ CLOSED |
| #3 Minor — untrusted code held `issues: write` | Workflow permissions dropped to `contents: read` (`:23-24`); `issues: write` moved to the ack job (`:42-43`); gate call job pinned to `permissions: contents: read` (`:61-62`) | Job-level `permissions` **replace** the workflow set: ack token = `issues: write` only — safe, ack has no checkout (asserted) and only runs `gh api` to post the comment; gate token = `contents: read` only. `jobs.<id>.permissions` on a `uses:` job is legal and caps the token passed to the called workflow — ci.yml needs only `contents: read` (checkout; setup-java/node, cache restore/save, and upload-artifact@v4 need no GITHUB_TOKEN write scopes). Untrusted PR code now runs with a read-only token | ✅ CLOSED |
| #2 Minor — comment-gate cache writes poison the main-scoped key | Combined `actions/cache@v4` split: unconditional `actions/cache/restore@v4` (`ci.yml:64-68`) + `actions/cache/save@v4` guarded `if: ${{ !startsWith(inputs.ref, 'refs/pull/') }}` placed directly after `fetchEngine` (`ci.yml:90-96`) | `/run ci` passes `ref: refs/pull/<N>/merge` ⇒ save **skipped**; empty `ref` (direct dispatch, release.yml's gate call) ⇒ `startsWith('', 'refs/pull/') = false` ⇒ save **runs** — asserted, and the guard keys on the *ref*, not the event, so even a manual dispatch pointed at a PR-merge ref won't save. Restore/save share identical path+key (asserted); restore < fetchEngine < save ordering asserted — the saved snapshot is produced by trusted-branch code only, before any later step could touch it | ✅ CLOSED |

**New-hazard sweep of the delta (checked, none found):** both files still parse (`ruby -ryaml`); original structural suite **44/44** — REL-02/REL-03 ACs unaffected (triggers, guards, checkout-ref plumbing, secret-freedom all unchanged); release.yml path unaffected (its gate call job sets no job-level permissions and inherits `contents: write` for trusted code, as before); save-step failure semantics equivalent to the old post-job save (skipped if `fetchEngine` fails — nothing to save anyway). Two cosmetic non-hazards noted: (a) on trusted runs with an already-cached key, `actions/cache/save` logs a "cache already exists / unable to reserve" warning and completes without failing (could be silenced by gating on the restore step's `cache-hit` output — optional); (b) the throwaway concurrency groups mean skipped comment-runs still appear in the Actions run list, unchanged from before.

**Honest residual (Low, PLAUSIBLE, non-blocking, inherent):** the guard closes the *workflow's own* save path — the chain this verification's finding #2 described. Code execution inside a gate job could in principle still reach the cache service directly (runner-process credentials), and `EngineFetcher.ensureDownloaded` verifies cached artifacts against their *sidecar* hash, not the pinned manifest (`host/src/main/kotlin/engine/EngineFetcher.kt:47-58`), so a hand-poisoned cache entry would not be self-healing. This class is inherent to executing untrusted code in default-branch-scoped runs and is mitigated by the same human step the feature already requires: a maintainer reviews a PR before commenting `/run ci`. No further action recommended within this amendment.

**Delta sensor (scratch-only; both killed, tree restored and verified clean):**

| # | Mutation | Result |
| - | -------- | ------ |
| M-D1 | dropped the `author_association` clause from the concurrency ternary only (guard drift — would silently re-open the cancel hole for untrusted authors) | ✅ **Killed** — "ternary condition == job guard" assertion fails |
| M-D2 | inverted the save guard (`!startsWith` → `startsWith`; only PR gates would save) | ✅ **Killed** — save-guard assertion fails |

**Gate**: delta suite 17/17 · original suite 44/44 · YAML parse OK. `git status` after restore: `validation.md` is the only modified file.

**Lessons**: none recorded for this iteration — no qualifying signal (no failed AC, 2/2 delta mutants killed, no spec-precision gap); the findings themselves were beyond-AC recommendations, now closed.

---

## First-Run Host Wedge Fix Verification (2026-07-27)

**Spec**: "Defect Amendment (2026-07-27): DF-2" section in `spec.md`, requirement **HOST-04**
**Diff range**: `29e353a..d7c4d13` (T77–T82, phase 19; 6 commits)
**Verifier**: independent sub-agent (author ≠ verifier; evidence-or-zero, re-derived; read-only over the real tree — sensor mutations run in-place and reverted via `git checkout`, confirmed clean before and after each)

### Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T77  | ✅ Done | `3e4b7ea` — `starting -> crashed` edge added |
| T78  | ✅ Done | `ccb3a10` — reconfigure guard widened to "no live child" |
| T79  | ✅ Done | `ed607ba` — `gate.ts` single-flight + activation wiring |
| T80  | ✅ Done | `df8dc66` — code-only AAR installed-check |
| T81  | ✅ Done | `c9a4e80` — 1.0.1 changelog entry |
| T82  | ✅ Done | `d7c4d13` — AD-020 + Handoff + traceability bookkeeping; UAT performed by the user (not by this Verifier — no GUI available; see AC6 row) |

### Spec-Anchored Acceptance Criteria (HOST-04)

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion expression | Result |
| -------------------------- | --------------------- | ----------------------------------- | ------ |
| AC1: child exits/errors while `starting` (unintentional) → reject pending `ensureReady()` + `starting → crashed` with full crash bookkeeping; state SHALL NOT remain `'starting'` | `getState()==='crashed'`, `crashCount()===1`, `getLastCrashReason()` set to the exit reason, backoff auto-restart scheduled | `extension/src/host.test.ts:284` — `expect(manager.getState()).toBe('crashed')`; `:285` — `expect(manager.crashCount()).toBe(1)`; `:286` — `expect(manager.getLastCrashReason()).toContain('exited (code=1')`; spawn-`error` path: `:321` — `expect(manager.getState()).toBe('crashed')`, `:322` — `expect(manager.crashCount()).toBe(1)` | ✅ PASS |
| AC2: `dispose()`/`restart()` intentional kill mid-`starting` → no crash recorded, no auto-restart, caller owns transition | `crashCount()===0`, `needsManualRestart()===false`, state ends `'stopped'` | `extension/src/host.test.ts:308` — `expect(manager.getState()).toBe('stopped')`; `:309` — `expect(manager.crashCount()).toBe(0)`; `:310` — `expect(manager.needsManualRestart()).toBe(false)` | ✅ PASS |
| AC3: `reconfigure()` while no live child (`stopped`/`crashed`) takes effect on next spawn; recovery invariant (failure on A → reconfigure(B) → `ensureReady()` reaches `ready` running B) | crashed → reconfigure → `ensureReady()` resolves to `'ready'`; live-host case stays a no-op | `extension/src/host.test.ts:235` — `expect(manager.getState()).toBe('crashed')`; `:240` — `expect(manager.getState()).toBe('ready')` (after `reconfigure` to the working fake-host mode); live-no-op regression preserved unmodified at `host.test.ts:213-223` | ✅ PASS |
| AC4: render paths await real-host config before `ensureReady()`; placeholder never spawned by a render path; concurrent configuration joins one in-flight `prepareRealHost`; a settled failure is not cached | `singleFlight` joins concurrent callers to one call; a rejected call clears the in-flight slot (next call re-runs); a resolved call is also not memoized | `extension/src/gate.test.ts:13-17` — `expect(calls).toBe(1)` for two concurrent callers; `:28-30` — `expect(gated()).rejects...` then `expect(gated()).resolves.toBe('ok')`, `expect(calls).toBe(2)`; `:40-42` — resolved-not-memoized, `expect(calls).toBe(2)` | ✅ PASS (helper semantics); **the activation.ts wiring itself** (`activation.ts:103-105,118,162,286,361`) that routes `openPreview`/scheduler-retry/`restartHost` through this one gate is verified only by code inspection + the existing integration suite staying green + the human UAT (AC6) — `INFLATE_TEST_FAKE_HOST` structurally bypasses this exact path (AD-018/AD-020, pre-accepted, not a new gap) |
| AC5: code-only AARs (no `res/`) reported `installed`; keyed on the AAR's own `AndroidManifest.xml`; res-bearing AAR unchanged; cache `ready` still gated solely by `.complete` | `installed===true` for a code-only AAR once extracted; `installed===true` unchanged for a res-bearing AAR; `installed===false` before extraction; `.complete`-gating unaffected | `extension/src/artifacts.test.ts:337` — `expect(status?.installed).toBe(true)` (code-only); `:348` — `expect(status?.installed).toBe(true)` (res-bearing, regression); `:357` — `expect(status?.installed).toBe(false)` (never-extracted); `.complete` gating preserved, unmodified test at `artifacts.test.ts:360-383` | ✅ PASS |
| AC6: first-run end-to-end — cold cache, open preview, render trigger (Cmd+S) during the live download → the same-session preview SHALL still complete; no permanent `'starting'` wedge | Preview renders successfully in the same session once the download completes | Interactive UAT (human-performed, 2026-07-27, via Devin against a packaged `inflate-1.0.0.vsix`, `fixtures/gradle-sample`): Cmd+S during the live "preparing render engine (~170 MB)" notification → download completed → same-session preview rendered; passive (no-save) path unaffected. Recorded in `tasks.md` T82 and `STATE.md` AD-020/Handoff. Not independently re-run by this Verifier (no GUI in this environment, per the task's explicit scope) | ✅ PASS (human-confirmed UAT) — internally consistent: `activation.ts:162`'s scheduler `ensureReady` dep awaits `ensureRealHostConfigured()` (the same `configureRealHostGated` singleton `openPreview` is already running against), so a Cmd+S mid-download joins the in-flight install instead of booting the placeholder, and `prepareRealHost`'s success path (`activation.ts:468-471`) calls `hostManager.reconfigure()` with the real command before returning — matching the described recovery |

**Status**: ✅ All 6 ACs covered; 0 spec-precision gaps (every AC in the amendment specifies a precise, machine-checkable outcome except AC6, which is explicitly UAT-scoped by the spec itself).

### Edge Cases

- [x] **4th startup failure within the rolling crash window latches `manualRestartRequired`** (existing P1-I AC3 semantics, now reached from a startup failure): `extension/src/host.test.ts:291-292` — `await waitUntil(() => manager.crashCount() >= 4, 5000); expect(manager.needsManualRestart()).toBe(true)`. ✅ Handled correctly.
- [x] **`prepareRealHost` itself fails (no JDK, offline) → gate clears for the next attempt**: proven at the `singleFlight` unit level (the exact function wrapping `prepareRealHost` in production) — `extension/src/gate.test.ts:20-31` — a rejected call is followed by a resolving call reusing the same gate (`calls` increments to 2, i.e., `fn` re-ran). The scheduler-surfaces-as-host-error / no-infinite-spin / no-placeholder-spawn half of this edge case is covered the same way as AC4's wiring: code inspection + integration-green + UAT, not a dedicated unit test (same accepted AD-018/AD-020 blindness). ✅ Handled correctly; no automated test gap beyond the pre-accepted limitation.

### Discrimination Sensor

| # | File:line | Mutation | Killed? |
| - | --------- | -------- | ------- |
| 1 | `extension/src/host.ts:166` | Reverted T78's reconfigure guard: `if (this.state !== 'stopped' && this.state !== 'crashed') return;` → `if (this.state !== 'stopped') return;` | ✅ Killed — `host.test.ts` "reconfigure() lands after a startup failure..." fails: `Error: host exited (code=1, signal=null) during startup` (the crashed host was never reconfigured off command A) |
| 2 | `extension/src/host.ts:271-277` | Removed the `if (!this.intentionalKill) this.handleCrash(reason);` call from the `exit` handler's startup-failure branch (neutralizes the T77 `starting -> crashed` edge) | ✅ Killed — 2 tests fail: "transitions starting -> crashed..." (`expected 'starting' to be 'crashed'`) and "reconfigure() lands after a startup failure..." (same reason) |
| 3 | `extension/src/gate.ts:14-16` | Changed `singleFlight`'s `.finally(() => { inFlight = undefined })` to `.then((v) => { inFlight = undefined; return v; })` — clears the in-flight slot only on success, so a rejected call stays memoized forever | ✅ Killed — `gate.test.ts` "clears the in-flight slot on rejection..." fails: `promise rejected "Error: first attempt fails" instead of resolving` |

**Sensor depth**: lightweight (3 targeted behavior-level mutations on the three highest-risk transitions: crash-path edge, reconfigure guard, single-flight reject-doesn't-memoize)
**Result**: 3/3 killed — ✅ PASS
**Tree state**: `git status --short` empty and `git diff --stat` empty before, between, and after all three mutations (each reverted via `git checkout` immediately after its test run, confirmed clean before the next injection).

### Gate Check

- **Gate command (full)**: `cd extension && npm run build && npm test && npm run test:integration`
- **Unit result**: 206/206 passed, 16 files, 0 failed, 0 skipped, no unhandled-rejection warnings in output
- **Integration result**: 25/25 passed, exit code 0, no orphaned process warnings
- **Test count before amendment**: 196 vitest tests / 15 files (per the DF-2 Test Coverage Matrix baseline)
- **Test count after amendment**: 206 vitest tests / 16 files (+10 new: 3 host.test.ts, 3 gate.test.ts [new file], 3 artifacts.test.ts, net +1 not double-counted — see note)

  Note: raw new-test count across the diffs is 3 (T77) + 1 (T78) + 3 (T79, new file) + 3 (T80) = 10; 196 + 10 = 206, reconciles exactly.
- **Skipped tests**: none
- **Failures**: none

### Code Quality

| Principle | Status |
| --------- | ------ |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code (`singleFlight` is a 10-line generic helper, its only consumer is `configureRealHostGated`, no speculative options) | ✅ |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — `host.ts`/`host.test.ts`, `gate.ts`/`gate.test.ts` (new), `activation.ts`, `artifacts.ts`/`artifacts.test.ts`, `CHANGELOG.md`, `.specs/*` bookkeeping only |
| Didn't "improve" unrelated code | ✅ |
| Matches existing patterns/style | ✅ — reuses `handleCrash`, `makeManager`/`waitUntil`/fake-host harness, existing test fixture helpers |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see table above |
| Per-layer Coverage Expectation met | ✅ — `HostManager` 1:1 to AC1-AC3 + edge case 1; `gate.ts` all 3 branches; `ArtifactManager` 1:1 to AC5 |
| Every test in scope maps to a spec AC or edge case — no unclaimed tests | ✅ |
| Documented guidelines followed | AD-018/AD-020 (fake-host harness blindness class) explicitly acknowledged and respected — no attempt made to force this defect class through the integration harness |

### Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| HOST-04     | Verified — AC1-AC5 via automated gates, AC6 via UAT; pending Verifier | ✅ Verified (Verifier pass complete) |

### Summary

**Overall**: ✅ PASS — Ready to ship as patch 1.0.1.
**Spec-anchored check**: 6/6 ACs matched the spec-defined outcome (AC6 is UAT-scoped by the spec's own design); 0 spec-precision gaps.
**Sensor**: 3/3 mutations killed.
**Gate**: unit 206/206, integration 25/25, both exit 0.

**What works**: the `starting -> crashed` failure edge, the widened `reconfigure()` guard, the single-flight configuration gate, and the code-only-AAR installed check are all precisely asserted and mutation-tested; the human-confirmed UAT is internally consistent with the code's actual recovery chain (`activation.ts:162` scheduler gate → `activation.ts:468-471` `reconfigure()` on success).

**Issues found**: none blocking. One pre-existing, explicitly-accepted structural limitation reaffirmed (not new): AC4's activation.ts wiring and the `prepareRealHost`-failure edge case's "no infinite spin / surfaces as host error" half are provable only via code inspection + integration-green + interactive UAT, because `INFLATE_TEST_FAKE_HOST` bypasses `ensureRealHostConfigured` entirely (AD-018/AD-020). This is documented project policy for this defect class, not a gap introduced by this amendment.

**Next steps**: none required. DF-2 closes as COMPLETE & VERIFIED; ship 1.0.1 via the REL-04 pipeline whenever the next release is triggered.

### Lessons

None recorded. Signal walk: 0 failed/uncovered ACs, 0 surviving mutants (3/3 killed), 0 spec-precision gaps, 0 `// SPEC_DEVIATION` markers, gate green. A clean PASS with no qualifying signal writes nothing, per `lessons.md` — this is correct, not a miss. (The harness-blindness observation above is a restatement of the already-confirmed AD-018/AD-020 lesson, not a new one — re-recording it would be a duplicate, not a fresh distillation.)

---

## CI Comment Pipeline Fix Verification (2026-07-27)

**Date**: 2026-07-27
**Spec**: `.specs/features/android-xml-preview/spec.md` — "Defect Amendment (2026-07-27): DF-3" / requirement **REL-06**
**Diff range**: `89e512b..HEAD` (`dbda52a` through `c170dd3`)
**Verifier**: independent sub-agent (author ≠ verifier)

### Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T83: Ack permission fix | ✅ Done | `run-ci-comment.yml:47` carries `pull-requests: write`; `issues: write` removed from the job (only surviving mentions are explanatory prose at lines 22/45); inline comment states the target-resource rule |
| T84: Accept-time pending status | ✅ Done | Job renamed `ack` → `accept` (line 36); single resolve step (line 55, id `resolve`) → job output `head_sha` (line 50); pending POST (lines 65-72) with context `full-gate`, `target_url`; ack comment moved last (line 76); step order resolve→pending→ack confirmed |
| T85: Report job | ✅ Done | New `report` job (line 98), `needs: [accept, gate]`, `if:` combines `always()` + guard triple + `needs.accept.outputs.head_sha != ''` (lines 99-108); explicit `case` mapping success/failure only, default branch writes nothing (lines 122-129); `permissions:` is exactly `statuses: write` (line 111) |
| T86: Runbook + CONTRIBUTING docs | ✅ Done | New subsection in `docs/release-checklist.md` (lines 212-246) with exact ruleset clicks, both bypass entries, strict-OFF, 4 ordered rollout steps, PAT fallback + trigger condition, Workflow-permissions rationale; `CONTRIBUTING.md:63-75` updated with status-based result + required-check merge consequence |
| T87: Stale daily-canary wording | ✅ Done | `canary.yml:20` and `CONTRIBUTING.md:74` now read "weekly"; `canary.yml:8`'s historical "superseding the original daily cadence" note untouched (correct, by design); `schedule:` cron (`0 20 * * 5`) byte-identical per `git diff` (comment-only hunk) |
| T88: AD-021 + Handoff + traceability | ✅ Done | `.specs/STATE.md` AD-021 entry present (decision/reason/trade-off/scope/date/status, lines 143-149); Handoff updated with execution-complete record + pending live-verification steps (lines 153-177); `spec.md`'s REL-06 traceability row changed from "Pending (tasks T83+, phase 20)" to "Implemented (T83–T87, phase 20) — pending live verification (rollout steps 2–4, post-merge)"; AC text above the row untouched |

**Status**: ✅ All 6 tasks done, no partials.

### Spec-Anchored Acceptance Criteria (REL-06)

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| AC1: accepted `/run ci` → ack posts, token carries `pull-requests: write` replacing `issues: write` | Job permission is exactly `pull-requests: write`, no `issues: write` | `.github/workflows/run-ci-comment.yml:47` — `pull-requests: write` present; line 42-48 permissions block has no `issues: write` key | ✅ PASS |
| AC2: accepted run → resolve PR head SHA once at accept time, set `full-gate` to `pending` on that SHA with `target_url` = run URL | One resolve step, one pending POST with context/state/target_url | `.github/workflows/run-ci-comment.yml:55-61` (resolve, single occurrence, output `head_sha`); `:65-72` (POST `state=pending`, `context=full-gate`, `target_url=...actions/runs/${{ github.run_id }}`) | ✅ PASS |
| AC3: gate concludes → reporting job (`needs: gate`, `if: always()`) sets same context/SHA to `success`/`failure`; ack/accept failures never block gate or final status | Reporting job depends on gate, runs via `always()`, writes success/failure on the captured SHA | `.github/workflows/run-ci-comment.yml:98-108` (`needs: [accept, gate]`, `if: always() && ...`); `:122-133` (case-mapped POST to `needs.accept.outputs.head_sha`) | ⚠️ Spec-precision gap — spec text literally says `needs: gate`; the implementation (and `tasks.md` T85's own "Done when") requires `needs: [accept, gate]` so the job can thread `needs.accept.outputs.head_sha`. Functionally necessary and consistent with AC2's single-resolve invariant, but the spec's AC3 sentence itself was not updated to say so — a wording gap in `spec.md`, not a code defect |
| AC4: run cancelled → no final status written; superseding run re-pends, manual cancel self-heals | No write branch for `cancelled`/`skipped` | `.github/workflows/run-ci-comment.yml:122-129` — `case` statement matches only `success`/`failure`; `*)` branch echoes and `exit 0` with no `gh api` call | ✅ PASS |
| AC5: security invariants — guard triple on every job; write-holding jobs have no checkout/no PR code; gate keeps `contents: read` only; `ci.yml` unchanged | All five invariants hold literally | Guard triple: `:40` (accept), `:89` (gate), `:106-107` (report). No `checkout` step anywhere in the file (`grep checkout` matches only a comment at `:16`). Gate job: `:93` `contents: read`, `:94` `uses: ./.github/workflows/ci.yml` unchanged. `ci.yml`: `git diff 89e512b..HEAD -- .github/workflows/ci.yml` empty | ✅ PASS |
| AC6: `full-gate` required status check on `main` via ruleset, bypass = GitHub Actions app + Repository admin, strict up-to-date OFF, manual UI steps documented | Runbook documents the exact clicks + both bypass entries + strict-OFF + 4 ordered rollout steps | `docs/release-checklist.md:212-246` — "New branch ruleset" / "Require status checks to pass" / `full-gate` / both bypass entries / "up to date... OFF" / 4 numbered rollout steps / PAT fallback with trigger condition | ✅ PASS |

**Status**: 5/6 ACs matched precisely; 1 spec-precision gap (AC3's `needs:` wording), which is a documentation-precision issue in `spec.md` itself, not an implementation defect — the implementation is the functionally-correct and necessary form.

### Discrimination Sensor

**Not applicable** — this amendment has zero executable code (GitHub Actions YAML + docs only). Per the Test Coverage Matrix (DF-3) in `tasks.md`, "the discrimination sensor applies only to sensor-testable layers (none here — REL/T69-T70 precedent)." Verification is scoped to static validation: YAML parses, and every REL-06 AC's structural invariant is present via grep-style assertions (performed above and in the Gate Check section below). No sensor mutations were run; this is a scoping decision inherited from the prior release-automation amendment, not a skipped step.

### Edge Cases (spec.md DF-3 section)

- [x] Commit pushed between comment and accept: the single resolve step captures the SHA once at accept time (`:55-61`); no later step re-resolves it, so a newer head commit receives no status — matches spec ("protection keys on the latest head")
- [x] Accept step's API calls fail: steps run in default fail-fast order (resolve → pending → ack); a failure at any step halts the job without executing later steps, so no SHA/no statuses are produced; `report`'s guard (`needs.accept.outputs.head_sha != ''`) then also writes nothing — matches "no infinite spin, gate still runs, failure visible in Actions log"
- [x] `/run ci` commented on the PR carrying this fix: unavoidable and explicitly documented (rollout step 1 in `docs/release-checklist.md:220-224` and `CONTRIBUTING.md`) — `issue_comment` always executes the default-branch workflow definition, so no code change can address this; correctly left as a documented, expected limitation rather than "fixed"

### Gate Check

- **Gate command**: Build level per Gate Check Commands (DF-3) — YAML parse × 4 files, full T83–T87 grep assertion set, `git diff --exit-code` on `ci.yml`, `cd extension && npm test`
- **YAML parse**: `ci.yml`, `canary.yml`, `release.yml`, `run-ci-comment.yml` — all 4 parse via `ruby -ryaml -e 'YAML.load_file(ARGV[0])'`, all OK
- **`ci.yml` diff**: `git diff --exit-code 89e512b..HEAD -- .github/workflows/ci.yml` and `git diff --exit-code HEAD -- .github/workflows/ci.yml` both clean (byte-identical, no uncommitted drift)
- **Grep assertion set (T83-T87)**: all re-derived assertions passed (permission swap, guard triple ×3 jobs, single-resolve invariant, pending POST shape, report job needs/if/mapping, no-checkout, gate job untouched, docs topics present, stale "daily" wording gone except the one correct historical mention)
- **`cd extension && npm test`**: 206/206 passed, 16/16 test files, 0 failed, 0 skipped — matches the pre-existing 1.0.1 baseline (no regression)
- **Result**: **PASS** — 0 failed, 0 skipped

### Code Quality

| Principle | Status |
| --------- | ------ |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — `git diff 89e512b..HEAD --stat` shows exactly 6 files: `run-ci-comment.yml`, `canary.yml`, `STATE.md`, `spec.md`, `CONTRIBUTING.md`, `docs/release-checklist.md` — matches the 6 tasks' stated "Where" fields exactly, no extras |
| Didn't "improve" unrelated code | ✅ — `docs/release-checklist.md` change is purely additive (new subsection); no other runbook sections touched |
| Matches existing patterns/style | ✅ — reuses the existing guard triple, `gh api` invocation style, amendment-section tone in docs, AD-019/AD-020 Decisions entry format |
| Spec-anchored outcome check (asserted values match spec) | ⚠️ — 5/6 exact; AC3's `needs:` wording gap noted above |
| Per-layer Coverage Expectation met | N/A — no domain-logic/route layers in scope; static-validation posture per the Test Coverage Matrix |
| Every check in scope maps to a spec AC, listed edge case, or Done-when criterion — no unclaimed checks | ✅ |
| Documented project quality/testing guidelines followed | Test Coverage Matrix (DF-3) and Gate Check Commands (DF-3) in `tasks.md`, followed as written |

### Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| REL-06 | Pending (tasks T83+, phase 20) | ✅ Implemented (T83–T87) — **pending live verification** (rollout steps 2–4 execute post-merge; correctly NOT marked fully Verified, since the live ACs — ack posts without 403, pending appears in the PR checks area, final status matches the gate — cannot be exercised without a real GitHub PR event) |

### Summary

**Overall**: ✅ Ready — merge and proceed with the documented post-merge rollout.

**Spec-anchored check**: 5/6 ACs matched exactly; 1 spec-precision gap (AC3's spec sentence says `needs: gate`, implementation correctly and necessarily uses `needs: [accept, gate]` to thread the captured SHA — a spec-wording gap, not an implementation defect).
**Sensor**: not applicable (static-validation-only amendment, no sensor-testable runtime layer — matches the Test Coverage Matrix's explicit scoping).
**Gate**: all 4 workflow YAML files parse; full T83–T87 grep assertion set green; `ci.yml` byte-identical; `cd extension && npm test` 206/206 passed, 0 failed, 0 skipped.

**What works**: the permission swap (T83), the accept-time single-resolve + pending status (T84), the report job's explicit success/failure/no-write mapping (T85), the runbook + CONTRIBUTING docs (T86), the daily→weekly wording sweep with cron left byte-identical (T87), and the AD-021/Handoff/traceability bookkeeping (T88) are all precisely implemented and match the task breakdown's "Done when" checklists line for line.

**Issues found**: 1 non-blocking spec-precision gap — `spec.md`'s REL-06 AC3 sentence ("needs: gate") does not literally match the necessary and correct `needs: [accept, gate]` implementation. Recommended fix: a one-line edit to AC3's wording in `spec.md` to say `needs: [accept, gate]` (documentation-only; no code change required).

**Next steps**: merge to `main`; execute the documented post-merge live-verification rollout (comment `/run ci` on the next PR and confirm ack posts without a 403, `full-gate` pending appears, final status matches the gate result; then create the ruleset; then let the next release prove the bypass). Optionally fix the AC3 wording gap in `spec.md` as a trivial follow-up.

### Lessons

One grounded spec-precision gap recorded: AC3's literal `needs: gate` wording in `spec.md` does not match the necessary `needs: [accept, gate]` job dependency (needed to thread the captured head SHA per AC2's single-resolve invariant) — a reusable lesson about writing `needs:` lists in spec ACs to already reflect cross-job output dependencies, not just the "primary" upstream job, is warranted; record via `scripts/lessons.py` if the project's lessons workflow is run as a follow-up to this report.

## Layout Root Params Fix Verification (2026-07-29)

**Diff range**: `a06cbfe..58471a1` (7 commits, T89–T94, phase 21, "Layout Root Params Fix Tasks" — DF-4, requirement LAY-08). Full change surface independently confirmed via `git diff --stat e9859bd..58471a1 -- host/ fixtures/ extension/`: exactly 18 files — `EngineAdapter.kt` (+20/-6), `ToolsAttributes.kt` (+8/-1), two new engineTest classes, 9 new `rootparams_*` fixtures (7 framework + 2 material), 2 regenerated material-gallery goldens, `CHANGELOG.md`. No extension source, wire protocol, or scheduler file touched.
**Verifier**: independent sub-agent (author ≠ verifier; evidence-or-zero, re-derived; did not implement the fix).

### Verdict: ✅ PASS

### Task Completion

All 6 tasks (T89–T94) marked `[x]` in `tasks.md` with commit hashes; every "Done when" item independently spot-checked against the actual diff (code, tests, fixtures) rather than trusted from the task text. No partial/blocked tasks found.

### Spec-Anchored Acceptance Criteria (LAY-08)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: root LayoutParams generated via FrameLayout parent, `attachToRoot=false` | `wrap_content` wraps, fixed dp measures at that size, `match_parent` unchanged | `EngineAdapter.kt:299-306` (the fix) + `RootLayoutParamsTest.kt:100-111` (wrap paints only its band) + `:125-133` (match_parent still full-bleed, all 4 corners) | ✅ PASS |
| AC2: root margins inset within canvas, density-scaled | theme bg in margin band, root bg just past inset | `RootLayoutParamsTest.kt:114-122` — `argbAt(png,8,50)==THEME_BG`, `argbAt(png,20,20)==ROOT_BG` (16dp inset at mdpi 1:1) | ✅ PASS |
| AC3: `layout_gravity` positions fixed-size root; default top\|start | gravity bottom\|end → painted bottom-right, theme bg top-left | `RootLayoutParamsTest.kt:136-146` — `argbAt(png,10,10)==THEME_BG`, `argbAt(png,150,250)==ROOT_BG`; default top\|start anchoring cross-checked by the no-gravity wrap test | ✅ PASS |
| AC4: uncovered canvas shows resolved theme `windowBackground`, canvas stays device-sized (amended) | exact theme color, not alpha 0; `imageWidth`/`imageHeight` unchanged | `RootLayoutParamsTest.kt:44-49` (THEME_BG = `#FF303030`, empirically cross-checked against light theme `#FFFAFAFA` per spec text) + `RootParamsConstraintTest.kt:106-107` (`imageWidth==200`, `imageHeight==300` explicit) | ✅ PASS |
| AC5: missing root dimension → `ok`, 0px axis, no crash | status `ok`, background-bearing root paints nothing | `RootLayoutParamsTest.kt:151-167` — both missing-height/width fixtures assert `RenderStatus.ok` + THEME_BG at multiple probe points | ✅ PASS |
| AC6: scope guard — `<merge>` root stays full-bleed | all 4 corners painted, unaffected | `RootLayoutParamsTest.kt:170-178` | ✅ PASS |
| AC7: reported shapes end-to-end (wrap+margins card; bottom-constrained child not centered) | wrapped height < device height, child B directly below sibling A, not at ~50% device height | `RootParamsConstraintTest.kt:101-124` (shape a) + `:126-145` (shape b — explicit "NOT centered" assertion at y=150) | ✅ PASS |
| Edge case: data-binding `<layout>` root unwrap | inner root's own params honored | `RootLayoutParamsTest.kt:181-188` | ✅ PASS |
| Edge case: `tools:` override governs root height | promoted value governs over real wrap_content measure | `RootLayoutParamsTest.kt:191-205` + `ToolsAttributes.kt:20` (`layout_height` added to `CORE_ATTRS`) | ✅ PASS |
| Edge case: oversize root / RTL margins | framework-native pass-through, no Inflate code path | Correctly marked N/A in the Test Coverage Matrix — no new code touches either path; existing NORMAL-mode/MAX_CANVAS_PX and MarginLayoutParams RTL resolution are untouched by this diff | ✅ N/A (verified no code path added) |

**Status**: 10/10 criteria (7 ACs + 3 edge cases) matched their spec-defined outcome with pixel-level, non-shallow assertions. Zero gaps, zero spec-precision gaps on the criteria themselves (see one documentation-only note below).

### Edge Cases

- [x] Data-binding root unwrap — handled, pixel-verified
- [x] `tools:` override on root height — handled, pixel-verified (required the `CORE_ATTRS` fix, independently re-derived as correct and minimal — one string added, nothing else touched)
- [x] Oversize root / RTL margins — correctly scoped N/A, no new code path
- [x] `<merge>` root scope guard — handled, pixel-verified

### Gate Check (all re-run by this Verifier, not inferred from the handoff)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Quick (build+test) | `cd host && ./gradlew build test` | ✅ BUILD SUCCESSFUL |
| Engine | `cd host && ./gradlew engineTest --rerun-tasks` | ✅ **58 testcases / 23 classes**, 0 failures, 0 errors — counts read directly from `build/test-results/engineTest/TEST-*.xml`, not trusted from the handoff. Matches the claimed baseline delta exactly: 47→58 (+11: 4 T89 + 5 T90 + 2 T91), 22→23 classes (+1 new class, `RootParamsConstraintTest`; `RootLayoutParamsTest` extends the existing-in-this-diff class rather than adding a second one for T90) |
| Corpus | `cd corpus && npm run corpus` | ✅ **42/42 passed**, 0.000% diff on every config, including both `material/gallery` configs (goldens already regenerated to match current engine output) |
| Extension sanity | `cd extension && npm test` | ✅ **206/206 passed**, 0 failed (16 files) — no extension source in the diff, pure no-regression check |

**Test count deltas**: engineTest 47→58 (+11, all new — none renamed; independently confirmed by grepping for `@Test` in the two new files: 4 in `RootLayoutParamsTest`'s original T89 block + 5 in its T90 extension + 2 in `RootParamsConstraintTest` = 11). Corpus 42/42 unchanged (no new corpus cases — independently confirmed: `grep rootparams corpus/manifest.json` → zero matches, the new gallery fixtures are engineTest-only). Extension 206/206 unchanged.

**Golden diff independently re-derived** (not trusted from AD-022's prose): diffed `git show a06cbfe:.../material-gallery__default.png` against the current golden pixel-by-pixel — the only differing region is a tight bounding box (33,1485)-(115,1509), 793 pixels total. Cropping and rendering both images at that exact region shows the pre-fix golden blank there and the post-fix golden showing the literal glyphs "Title" — this is pixel-exact confirmation of AD-022's claim (`MaterialToolbar`'s `android:title="Title"` becoming visible), not a geometry change. Independently re-verified the *precondition* for that claim's logic: wrote a script against `corpus/manifest.json` to check every `kind: layout` fixture's root tag/`layout_width`/`layout_height` directly against its XML (excluding `<merge>` roots) — **all 27 layout fixtures in the corpus are `match_parent`×`match_parent` at the root**, so root-geometry honoring is provably a no-op for every corpus fixture, and `material/gallery`'s root is confirmed `match_parent`×`match_parent` by direct inspection (`material_gallery.xml:12-13`) too. This closes the loop on AD-022's isolation claim without needing to re-run the worktree experiment: the golden diff cannot be explained by root-param geometry (there's no geometry to change), so it must come from some other engine-behavior shift triggered by the same code change — consistent with (though not a full mechanistic proof of) AD-022's "isolated via throwaway worktree, reapply EngineAdapter change only" methodology. Accepting the change as a correctness improvement (a Toolbar's own declared title genuinely should render) is reasonable given this evidence.

### Discrimination Sensor (scratch-only; tree left clean via `git status --short` verification after each restore)

| # | File:line | Mutation | Test run | Killed? |
| - | --------- | -------- | -------- | ------- |
| 1 | `EngineAdapter.kt:299-306` | Reverted `inflateOrNull` to the pre-fix null-parent inflate (`sdk!!.layoutInflater.inflate(layoutId, null)`) | `./gradlew engineTest --tests render.RootLayoutParamsTest --tests render.RootParamsConstraintTest` | ✅ **Killed** — 9/11 tests failed (every test whose fixture root isn't already `match_parent`×`match_parent` went red); the 2 that stayed green (`match_parent` regression guard, `<merge>` guard) correctly did so, since those shapes are full-bleed either way |
| 2 | `EngineAdapter.kt:299` | Swapped the throwaway `FrameLayout` parent for a minimal anonymous `android.view.ViewGroup` subclass (base `ViewGroup.generateLayoutParams(AttributeSet)` reads only width/height, dropping margins and gravity) | same two test classes | ✅ **Killed** — exactly 3/11 tests failed: the margins test, the gravity test, and AC7 shape (a) (which has margins) — every size-only test (wrap, match_parent, merge, missing-height/width, tools_height, shape b) correctly stayed green, showing the tests discriminate at the specific margin/gravity behavior granularity, not just "something changed" |
| 3 | `ToolsAttributes.kt:20` | Removed `"layout_height"` from `CORE_ATTRS` (reverting T90's production fix) | `./gradlew engineTest --tests render.RootLayoutParamsTest` | ✅ **Killed** — exactly 1/9 failed: the `tools_layout_height` override test; all others (including the unrelated missing-dimension/merge/binding tests) stayed green, confirming this test alone covers that fix |

Each mutation was applied via `Edit`, run, then reverted via a matching `Edit` back to the exact original text; `git status --short` and `git diff --stat` confirmed empty after every restore (no scratch state leaked into the real tree — worktree/stash were unnecessary since the tree was clean before and after each single-file round-trip).

**Sensor depth**: lightweight (3 mutations, proportional to a bug-fix-scoped amendment — covers the root-cause line, the margin/gravity-specific parent-type risk called out explicitly in `tasks.md`'s own sensor-candidate list, and the one production fix from T90).
**Result**: **3/3 killed**, 0 survived.

### Code Quality

| Check | Pass? |
| ----- | ----- |
| No features beyond what was asked | ✅ — the fix is exactly the parent-swap in `inflateOrNull` plus the one-line `CORE_ATTRS` addition genuinely required by the already-approved `tools:layout_height` edge case |
| No abstractions for single-use code | ✅ — no new classes/interfaces; the throwaway `FrameLayout` is a local, not a reusable abstraction |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — `git diff --stat e9859bd..58471a1 -- host/ fixtures/ extension/` shows exactly the 18 files enumerated in AD-022's Scope line, no extras |
| Didn't "improve" unrelated code | ✅ — the `ToolsAttributes.kt` KDoc edit is scoped to documenting the new `layout_height` entry, no other rewording |
| Matches existing patterns/style | ✅ — reuses `LayoutRendererTest`'s gallery/routing setup shape, the AC7-style pixel-probe technique, and existing fixture-comment conventions |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-checked `RootParamsConstraintTest` shape (b): asserts an explicit NOT-centered condition at the exact pixel the pre-fix defect would have painted, not just "renders ok" |
| Spec-anchored outcome check | ✅ — see AC table above, all 10 criteria matched precise spec-defined values |
| Per-layer Coverage Expectation met | ✅ — 1:1 engineTest-per-AC as the Test Coverage Matrix (DF-4) requires; no domain layer beyond the engine adapter in scope |
| Every test in scope maps to a spec AC, listed edge case, or Done-when criterion | ✅ — every new `@Test` name cites its LAY-08 AC or edge case in its label |
| Documented project quality/testing guidelines followed | Test Coverage Matrix (DF-4) and Gate Check Commands (DF-4) in `tasks.md`, followed as written |

**One documentation-only note (non-blocking, not counted as a spec gap since it affects a code comment, not a criterion or assertion):** `fixtures/galleries/framework/res/layout/rootparams_wrap.xml:3`'s comment still reads "...the canvas below the wrapped bounds stays transparent" — this restates the ORIGINAL, since-superseded AC4 assumption (transparent), not the corrected one (theme background) that the fixture's own consuming test (`RootLayoutParamsTest.kt:106-110`) correctly asserts against (`THEME_BG`, not alpha 0). The code is right; one comment in one fixture file was not updated when AC4 was corrected in `f1efabf`. Recommended trivial follow-up: update that comment to match the corrected assumption, for future readers who trust fixture comments as the spec restatement.

### Summary

**Overall**: ✅ Ready — DF-4 fix is sound, precisely scoped, and its new tests genuinely discriminate the defect class they were written for.

**Spec-anchored check**: 10/10 (7 ACs + 3 edge cases) matched their spec-defined outcome with pixel-precise assertions; 0 spec-precision gaps on the criteria themselves.
**Sensor**: 3 mutations injected (null-parent revert, ViewGroup-instead-of-FrameLayout parent-type swap, CORE_ATTRS regression), **3/3 killed**, 0 survived.
**Gate**: Quick ✅, Engine 58/23 (0 fail, re-run from clean with `--rerun-tasks`, not cache-trusted) ✅, Corpus 42/42 @ 0.000% ✅, Extension 206/206 ✅.

**What works**: the root cause diagnosis is bytecode-accurate and the fix (throwaway `FrameLayout` parent, `attachToRoot=false`) is the minimal correct change; the new pixel-probe tests are fine-grained enough that a mutation affecting only margins/gravity is caught without also tripping the size-only tests (verified directly, not assumed); the AC4 mid-execution correction is self-consistent between the spec text, the test assertions, and the empirical theme-color values used; the material/gallery golden change was independently re-derived as geometry-impossible (every corpus layout root is already `match_parent`×`match_parent`) and pixel-confirmed as the claimed Toolbar-title text becoming visible, supporting the "correctness improvement" acceptance decision.

**Issues found**: 1 non-blocking documentation gap — a stale pre-correction comment in `rootparams_wrap.xml` (see Code Quality note above). No behavioral defect, no test weakness, no scope creep.

**Next steps**: none blocking. Optional trivial follow-up: fix the stale comment in `rootparams_wrap.xml`. Ships as planned (patch 1.0.2, REL-04 pipeline).

### Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| LAY-08 | Implemented, pending Verifier | ✅ Verified |

### Lessons

No `.specs/scripts/lessons.py` exists in this repository (checked: `.specs/scripts/` is absent). Per validate.md's fallback, lesson candidates are noted here instead of being recorded mechanically:

- **Candidate lesson** (signal: documentation drift, not a test/AC gap — informational only, likely below the grounding bar for `lessons.py`'s signal table since it isn't an AC gap/surviving mutant/spec-precision gap/gate-fail): "When a spec assumption is corrected mid-execution (e.g., an amended AC), grep test fixtures' own comments for restatements of the superseded assumption, not just the spec/test-file prose — fixture XML comments are read as ground truth by future contributors and can silently drift from a corrected spec." Source: `fixtures/galleries/framework/res/layout/rootparams_wrap.xml:3` vs. the corrected LAY-08 AC4 in `spec.md`.
- No `ac_gap`, `surviving_mutant`, `spec_precision_gap`, or `gate_fail` signals were produced by this verification — the run was a clean PASS on all mechanically-gated signal types, so no lesson is mandated by the strict `lessons.md` signal table. The item above is recorded for completeness only, not as a required entry.

---

## BOM Ingestion Fix Verification (2026-07-29)

**Spec**: "Defect Amendment (2026-07-29): DF-5 — UTF-8 BOM'd XML files fail to preview" in `spec.md`, requirement **HOST-05**
**Diff range**: `3142167..HEAD` (4 commits: `dead0a6` T95, `05a81fe` T96, `e4154a9` T97, `a91d319` T98)
**Verifier**: independent sub-agent (author ≠ verifier; evidence-or-zero, re-derived)

### Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T95 | ✅ Done | `preprocess/Bom.kt` (`Bom.strip`) + both ingestion sites wrapped; `BomTest` (4 tests) + `BomIngestionTest` AC1 (layout) present |
| T96 | ✅ Done | `BomIngestionTest` extended: AC2 (error accuracy), AC3 (include), AC5 (warning parity), AC1 drawable leg, BOM-only edge — all present with byte-integrity guards |
| T97 | ✅ Done | `## 1.0.3` section added above `## 1.0.2` in `extension/CHANGELOG.md`, user-facing language, no other sections touched |
| T98 | ✅ Done | AD-023 recorded in `.specs/STATE.md`; HOST-05 traceability row flipped in `spec.md`; task statuses marked `[x]` in `tasks.md` |

### Spec-Anchored Acceptance Criteria (HOST-05)

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| AC1: BOM'd layout/drawable renders `ok` with byte-identical PNG to BOM-less twin | `status == ok`, PNG bytes identical | `host/src/engineTest/kotlin/render/BomIngestionTest.kt:159-172` (layout) — `assertEquals(RenderStatus.ok, bom.status)`; `plainBytes.contentEquals(bomBytes)` — and `:240-252` (drawable leg) same pattern | ✅ PASS |
| AC1 (identity/AC4 helper semantics): `Bom.strip` on no-BOM input | returned unchanged (identity) | `host/src/test/kotlin/preprocess/BomTest.kt:17-20` — `assertEquals(xml, Bom.strip(xml))` | ✅ PASS |
| AC2: BOM'd file with a genuine syntax error surfaces the real error at its true line, never the PI artifact | `status == error`; message excludes `"PI must not start with xml"`; `line == 7` (real offending line) | `BomIngestionTest.kt:179-191` — `assertEquals(RenderStatus.error, r.status)`; `assertFalse(error.message.contains("PI must not start with xml"))`; `assertEquals(7, error.line)` | ✅ PASS |
| AC3: BOM'd `<include>` target renders with content present; cycle-walk unaffected | render `ok`; dependency list contains the included path; no spurious cycle notice | `BomIngestionTest.kt:198-211` — `assertEquals(RenderStatus.ok, r.status)`; `r.dependencies.contains(includedPath)`; `r.warnings.none { ...message.contains("cycle") }` | ✅ PASS |
| AC4: no leading BOM → identity pass-through; corpus stays 42/42 zero-diff | unchanged content; zero changed goldens | `BomTest.kt:17-20` (identity) + `npm run corpus` → 42/42 @ 0.000% (see Gate Check) — independently confirmed `grep -i bom corpus/manifest.json` returns zero matches, so no new fixture entered the manifest | ✅ PASS |
| AC5: unknown res-auto attribute warning identical for BOM'd layout and BOM-less twin (strip point ahead of `MaterialAttrCheck`) | same warning count (1), same `detail`, same `message` for both twins | `BomIngestionTest.kt:218-233` — `assertEquals(1, plainWarnings.size)`; `assertEquals(1, bomWarnings.size)`; `assertEquals(plainWarnings.single().detail, bomWarnings.single().detail)`; `assertEquals(plainWarnings.single().message, bomWarnings.single().message)` | ✅ PASS |
| Edge case: BOM-only (or BOM+whitespace) file errors with the existing empty/invalid-document message, not the PI artifact | `status == error`; message excludes `"PI must not start with xml"` | `BomIngestionTest.kt:259-265` — `assertEquals(RenderStatus.error, r.status)`; `assertFalse(error.message.contains("PI must not start with xml"))` | ✅ PASS |
| Edge case: pathological multiple leading U+FEFF — exactly one stripped, remainder errors accurately | not directly asserted by a dedicated multi-BOM test | — | ⚠️ Spec-precision gap (not a defect: `Bom.strip` uses `removePrefix`, a single-application removal by construction, and `BomTest.kt:23-26` proves an interior/second U+FEFF is left untouched as ordinary content — the code path is provably correct by composition of the two proven properties, but no single test exercises a literal two-BOM-prefixed string end-to-end) |
| Edge case: `.axml` files share the same ingestion path | strip applies identically | — | ⚠️ Spec-precision gap (no `.axml`-specific BOM fixture/test in the diff; correctness follows from the ingestion site being shared code for both extensions per `LayoutRenderer.kt`/`DrawableRenderer.kt`'s single `docFile.readText()` call regardless of extension, but not independently pinned by a dot-axml BOM test) |
| Edge case: UTF-16/UTF-32 out of scope | unchanged, no test required | N/A — explicitly out of scope by spec text | ✅ PASS (scoped out, not applicable) |
| Edge case: nine-patch N/A (PNG, no XML ingestion) | N/A | N/A — explicitly out of scope by spec text | ✅ PASS (scoped out, not applicable) |

**Status**: ✅ All 5 numbered ACs covered with spec-exact assertions (line numbers, message content, byte-identity, warning parity all independently confirmed present and correct in the test file); 2 minor spec-precision gaps flagged on two of the five listed edge cases (multi-BOM literal test, `.axml`-specific fixture) — both are low-risk because the underlying properties they'd exercise are already proven by other passing assertions (composability of `removePrefix` + interior-BOM test; shared ingestion code path), not because of missing evidence of correctness, but no test cites them directly. Not blocking.

### Discrimination Sensor (scratch-only; real tree confirmed clean via `git status --short`/`git diff --stat` before and after every mutation)

| # | File:line | Mutation | Test run | Killed? |
| - | --------- | -------- | -------- | ------- |
| 1 | `LayoutRenderer.kt:59-70`, `DrawableRenderer.kt:79-83` | Removed the `Bom.strip(...)` wrapper at both ingestion sites (reverted to raw `request.inlineContent ?: docFile.readText()`) | `./gradlew engineTest --tests render.BomIngestionTest` | ✅ **Killed** — exactly 4/6 failed: AC1 (layout, `:163`), AC1 drawable leg (`:244`), AC5 (`:222`), AC2 (`:182`) — matching the spec's own prediction ("(a) remove the ingestion strip — the AC1/AC2/AC5 tests must go red with the PI artifact") plus the drawable leg. AC3 (include) and the BOM-only edge case correctly stayed green — AC3 exercises the engine's on-disk byte-sniff path (unaffected by host-string ingestion), and the BOM-only fixture has no `<?xml` after the BOM so it never triggers the PI-specific artifact either way; both are legitimate non-catches, not gaps |
| 2 | `Preprocessor.kt:81-82` + reverted mutation 1's ingestion-site strip removal | Relocated the strip to run *inside* `Preprocessor.preprocess` (`val content = Bom.strip(content)` as the function's first line) instead of at the two ingestion call sites, simulating the spec's named "AC5 alone must kill it" placement risk (`MaterialAttrCheck.unknownAttrs(content)` in `LayoutRenderer.kt:142` runs against the *outer*, now-unstripped `content` variable, ahead of the call into `Preprocessor.preprocess`) | `./gradlew engineTest --tests render.BomIngestionTest` | ✅ **Killed** — exactly 1/6 failed: AC5 (`:231`, `bomWarnings.size` — the malformed-XML catch inside `MaterialAttrCheck` silently swallowed the warning for the still-BOM'd outer `content`). All 5 other tests (AC1 layout+drawable, AC2, AC3, BOM-only edge) passed, since `Preprocessor.preprocess` itself still saw stripped content internally. This is an exact match to the spec's own discrimination-candidate prediction: "(b) relocate the strip inside `Preprocessor.preprocess` — the AC5 warning-parity test alone must kill it" |
| 3 | `fixtures/galleries/framework/res/layout/bom_twin.xml` (bytes) | Defanged the fixture by stripping its leading `EF BB BF` bytes (`tail -c +4`), leaving otherwise byte-identical content | `./gradlew engineTest --tests render.BomIngestionTest` | ✅ **Killed** — 1/6 failed: AC1 (`:147`), the `assertBomFixture` byte-integrity guard's own `assertTrue`, failing loudly with `"bom_twin.xml must start with the UTF-8 BOM (EF BB BF); got [...]"` rather than silently passing a now-neutralized regression test. Confirms the spec's escape-analysis tightening — "(c) defang a BOM fixture ... every BOM fixture carries an in-test byte-integrity guard" — actually works as designed |

Each mutation was applied via `Edit`, run in isolation (`--tests render.BomIngestionTest`), then reverted via `git checkout -- <file>` back to the exact original; `git status --short`/`git diff --stat` and (for mutation 3) a byte-level `cmp` against a pre-mutation copy confirmed the real tree was left byte-identical to its pre-sensor state after every round-trip. No worktree/stash was needed since the tree was clean before and after each single/multi-file round-trip and each mutation was independent.

**Sensor depth**: lightweight (3 mutations — exactly the 3 candidates the spec amendment itself named for the Verifier, covering the ingestion-strip removal, the placement-sensitivity risk that AC5 alone must catch, and the fixture-defanging guard).
**Result**: **3/3 killed**, 0 survived.

### Code Quality

| Check | Pass? |
| ----- | ----- |
| No features beyond what was asked | ✅ — `Bom.strip` is exactly `content.removePrefix("﻿")`, wrapped at the two named ingestion lines; no other behavior added |
| No abstractions for single-use code | ✅ — a single `object Bom { fun strip(...) }`, no interfaces/factories/config knobs |
| No unnecessary "flexibility" added | ✅ |
| Only touched files required for task | ✅ — `git diff 3142167..HEAD --stat` shows exactly: new `Bom.kt`, the 2 ingestion-site edits, new `BomTest.kt`/`BomIngestionTest.kt`, the enumerated new fixtures, `CHANGELOG.md`, and bookkeeping (`STATE.md`, `spec.md` traceability row, `tasks.md` statuses) — no extras |
| Didn't "improve" unrelated code | ✅ — `LayoutRenderer.kt`/`DrawableRenderer.kt` diffs are minimal (add import + wrap one expression each); no unrelated reformatting |
| Matches existing patterns/style | ✅ — reuses `LayoutRendererTest`'s `RenderRouting` + framework-gallery setup shape, `EngineTestSupport` fixture helpers, and the twin-comparison (render both, compare PNG bytes) technique already established by the LAY-08/DF-4 tests |
| Would senior engineer approve? | ✅ |
| Tests map to acceptance criteria and are non-shallow (spot-check one story) | ✅ — spot-checked AC2: asserts both the exact real line (`7`, not `1`) AND the absence of the PI artifact string, not merely "status is error" |
| Spec-anchored outcome check | ✅ — see AC table above; all 5 numbered criteria assert spec-exact values (status, line number, byte-identity, warning count/detail/message) |
| Per-layer Coverage Expectation met | ✅ — 1:1 per the Test Coverage Matrix (DF-5): `Bom` pure logic → host unit; executor ingestion live path → engineTest against the real Bridge; no domain layer left uncovered |
| Every test in scope maps to a spec AC, listed edge case, or Done-when criterion | ✅ — every `BomTest`/`BomIngestionTest` `@Test` name cites its HOST-05 AC or edge case label directly |
| Documented project quality/testing guidelines followed | Test Coverage Matrix (DF-5) and Gate Check Commands (DF-5) in `tasks.md`, followed as written; the byte-integrity-guard convention (first-3-bytes assertion) applied to every new BOM fixture, matching the escape-analysis tightening the amendment itself specifies |

### Edge Cases

- [x] BOM-only (or BOM + whitespace) file: errors with the existing empty/invalid-document message, not the PI artifact — pixel/message-verified (`bom_only.xml`, 3 bytes)
- [x] Pathological multiple leading U+FEFF: exactly one stripped, remainder is content — proven by composition (`removePrefix` single-application + interior-BOM test), not by a dedicated multi-BOM literal test (flagged as spec-precision gap above, non-blocking)
- [x] UTF-16/UTF-32 encoded files: correctly out of scope, unchanged — no test required, none added
- [x] `.axml` files share the ingestion path: correct by shared-code-path construction; no dot-axml-specific fixture added (flagged as spec-precision gap above, non-blocking)
- [x] Nine-patch previews: correctly N/A (PNG bytes, no XML ingestion) — no test required, none added

### Gate Check (all re-run by this Verifier from a clean/rerun state, not inferred from the commit bodies)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Quick (build+test) | `cd host && ./gradlew test --rerun` | ✅ **115 testcases / 21 classes**, 0 failures, 0 errors — counts read directly from `build/test-results/test/TEST-*.xml`. Baseline (per the last recorded host-unit count, AD-016 close, 2026-07-20): **111**. Delta: **111→115 (+4, exactly `BomTest`'s 4 new tests)** — confirmed via `TEST-preprocess.BomTest.xml` (`tests="4" failures="0" errors="0"`) |
| Engine | `cd host && ./gradlew engineTest --rerun` | ✅ **64 testcases / 24 classes**, 0 failures, 0 errors. Baseline (DF-4 close, this file's prior section): **58 testcases / 23 classes**. Delta: **58→64 (+6), 23→24 (+1 class)** — exactly `BomIngestionTest`'s 6 new tests in 1 new class; `TEST-render.BomIngestionTest.xml` shows all 6 passing (AC1 layout, AC1 drawable leg, AC2, AC3, AC5, BOM-only edge) |
| Corpus | `npm run corpus` (repo root) | ✅ **42/42 passed**, 0.000% diff on every fixture x config — unchanged from baseline; `grep -i bom corpus/manifest.json` confirms zero BOM fixtures entered the explicit manifest, so AC4's identity/zero-regen guarantee holds structurally, not just empirically |
| Extension sanity | `cd extension && npm test` | ✅ **206/206 passed**, 0 failed (16 files) — unchanged from baseline; no extension source in the diff, pure no-regression check |

**Test count deltas**: host unit 111→115 (+4, `BomTest`); engineTest 58→64 (+6, `BomIngestionTest`, +1 class); corpus 42/42 unchanged; extension 206/206 unchanged. No test was deleted, skipped, or weakened anywhere in the diff.

### Summary

**Overall**: ✅ Ready — the DF-5 BOM ingestion fix is sound, minimally scoped, and its new tests genuinely discriminate the defect class and the placement risk the spec itself called out.

**Spec-anchored check**: 5/5 numbered HOST-05 ACs matched their spec-defined outcome with exact-value assertions (status, real line number, byte-identity, warning parity); 2/5 listed edge cases flagged as spec-precision gaps (non-blocking — both are proven correct by composition of other passing assertions/shared code paths, just not independently pinned by a dedicated test).
**Sensor**: 3 mutations injected (ingestion-strip removal, strip-relocation-into-Preprocessor placement risk, fixture byte-defanging), **3/3 killed**, 0 survived — all 3 were the exact candidates the spec amendment named for the Verifier, and each killed exactly the test(s) the spec predicted, no more and no fewer.
**Gate**: Quick 115/115 ✅ (+4 vs. 111 baseline), Engine 64/64 ✅ (+6 vs. 58 baseline, +1 class), Corpus 42/42 @ 0.000% ✅ (unchanged), Extension 206/206 ✅ (unchanged).

**What works**: the single choke-point strip (`Bom.strip`, wrapped around `request.inlineContent ?: docFile.readText()` at both `LayoutRenderer.kt:59` and `DrawableRenderer.kt:79`) is verified to run ahead of every downstream consumer including the pre-preprocess `MaterialAttrCheck.unknownAttrs(content)` call (confirmed by reading `LayoutRenderer.kt:142`, which uses the same post-strip `content` variable) — this is exactly the placement the spec's assumption log requires and the discrimination sensor's mutation 2 independently proves matters (relocating it one call-frame inward breaks AC5 alone). Byte-level fixture verification confirms every twin pair differs from its plain counterpart by exactly 3 bytes (`EF BB BF` prepended), and the byte-integrity guards genuinely fail loudly (not silently) when a fixture is defanged. Corpus stayed 42/42 zero-diff both because the strip is identity for BOM-free input (proven at the unit level) and because the manifest structurally excludes every new BOM fixture (proven by direct grep, not assumed).

**Issues found**: none blocking. 2 non-blocking spec-precision gaps on two of the five *listed edge cases* (not the 5 numbered ACs) — a literal two-BOM-prefix end-to-end test and a `.axml`-extension-specific BOM fixture are not directly present, though both properties are provably true by composition of other passing tests / shared code paths.

**Next steps**: none blocking; ships as planned (patch 1.0.3, REL-04 pipeline). Optional, low-priority: add a two-line `BomTest` case feeding a literal `"﻿﻿content"` string (already implied correct by existing tests, would just make it explicit), and/or a `.axml`-extension BOM fixture in the `dotnet` gallery for AD-001-tree parity, if a future contributor wants the edge-case list fully self-evidenced test-by-test rather than by code-path argument.

### Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ---------- |
| HOST-05 | Implemented (T95–T98, pending Verifier) | ✅ Verified |

### Lessons

Clean PASS — no `ac_gap`, `surviving_mutant`, `spec_precision_gap` (on the 5 numbered ACs; the 2 edge-case gaps above are noted but are provably-correct-by-composition, not real coverage gaps), or `gate_fail` signals were produced by this verification: all 3 discrimination-sensor mutations were killed exactly as the spec amendment predicted, all 4 gates passed with deltas matching expectations exactly, and no test was weakened or deleted. Per `lessons.md`, a clean run with no signal writes nothing — recording nothing here. (Note: `scripts/lessons.py` is not present at the repo root in this checkout, consistent with the prior DF-4 verification record's finding; the mechanical path was unavailable regardless, but is moot here since there is no signal to record.)
