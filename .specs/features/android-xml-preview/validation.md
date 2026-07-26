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
