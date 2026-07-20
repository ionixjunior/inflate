# android-xml-preview Validation

**Date**: 2026-07-19
**Spec**: `.specs/features/android-xml-preview/spec.md`
**Diff range**: `58079fd..HEAD` (72 commits; T1–T60 + T38b + state/close commits)
**Verifier**: independent sub-agent (author ≠ verifier; evidence-or-zero, re-derived)

---

## Overall: ⚠️ CONDITIONAL FAIL — ship-blocked on 3 confirmed spec-AC gaps

All automated gates are green and the discrimination sensor is 5/5, but three
independently-confirmed functional gaps map to hard P1 `SHALL` requirements
(RES-04/P1-G AC4, P1-G AC1/RES-01/AD-001, LAY-02/LAY-04 correctness). These are
the handoff's known-open gaps G1/G2/G3 — **confirmed, not inherited** — and must
become fix tasks. A fourth item (Chip/Q5 vs AD-002) is a user release-gate
decision, not a test gap.

- **Spec-anchored check**: core P1 ACs traced to discriminating tests; **3 gaps** at the end-to-end layer.
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
| LAY-02, LAY-04 | ⚠️ Verified for clean files; **G1** correctness gap |
| LAY-03 | ✅ Verified (custom-view placeholder + warning) |
| DRW-01..08 | ✅ Verified (host-side worked around ripple/adaptive-icon per design) |
| RES-01 | ⚠️ **G3** (legacy capital casing) |
| RES-02, RES-03, RES-05 | ✅ Verified |
| RES-04 | ❌ **G2** (not wired into live path) |
| CFG-01/02/03/05 | ✅ Verified |
| CFG-04 | ⚠️ theme-apply render at plumbing layer |
| UX-01/02/03 | ✅ Verified |
| UX-04 | ✅ Verified (line mapping + stale retention) |
| UX-05 | ❌ **G2** (warnings-strip degradation not on live path) |
| HOST-01/02/03 | ✅ Verified (state machine, FIFO queue, timeout/crash) |
| SETUP-01/02/03 | ✅ Verified (unit + author smoke) |
| NFR-01..07 | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Not Ready — 3 confirmed spec-AC gaps → fix tasks (bounded 3-iter).
**What works**: the entire happy-path surface — framework + androidx/Material render, all drawable types + state picker, config toolbar (day/night/device/density/theme/persistence), hot reload with coalescing + stale-discard, host lifecycle/crash-recovery/FIFO concurrency, setup/download/doctor, NFR-01 latency (wide margin), NFR-07 corpus (33 fixtures/42 combos, 0% diff). Sensor 5/5.
**Issues**: G1 (comment-unaware preprocessor, correctness), G2 (degradation dead on live path — hard SHALL uncovered), G3 (legacy Xamarin casing unrendered). Plus the Chip/AD-002 user decision.
**Next steps**: route gaps 1–3 to fix tasks with the discriminating tests above; escalate the Chip/Q5 vs AD-002 decision to the user.
