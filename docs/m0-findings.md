# M0 Engine Spike — Findings & Timings

**Milestone**: M0 (Engine Spike) · **Date**: 2026-07-19 · **Machine**: macOS arm64 (Apple Silicon), Microsoft OpenJDK 17.0.19.
**Engine pin**: Paparazzi 1.3.5 · layoutlib 14.0.11 (API 34) · tools 31.4.2 · Kotlin 2.0.21 · JDK 17 (AD-008/D6).

M0 empirically validates architecture decision **AD-009** (friend-paths access to Paparazzi internals)
and resolves the design's remaining empirical unknowns before any downstream phase builds on them.

## M0 checklist outcomes (design §M0)

| # | Item | Outcome |
| - | ---- | ------- |
| 1 | Host compiles with `-Xfriend-paths` against Paparazzi 1.3.5 internals (AD-009 gate) | **PASS (primary)** — T2. All 8 required internal symbols resolve; a probe + unit test guard silent flag loss. |
| 2 | Bridge init once + `AppResourceRepository` rebuild while process stays up (hot-reload gate) | **PASS (primary)** — T4. Editing `values/colors.xml` + rebuild reflects the new color on the next render; **rebuild ≈ 9 ms**. |
| 3 | Hello-render (LinearLayout → PNG → webview) end-to-end | **PASS (primary)** — T5 (host: PNG at device pixels, alpha preserved) + T6 (VS Code webview displays the PNG; lazy activation ≤ 200 ms). |
| 4 | Custom/unknown view renders as a placeholder (AD-007 gate) | **FALLBACK-APPLIED (plan B)** — T7. See below. |
| 5 | Drawable state injection ≥ 3 states, correct matched item (Q2 gate) | **PASS (primary)** — T8. 4 states (default/pressed/checked/disabled) render distinctly; `findStateDrawableIndex` correct for each. |
| 6 | Measured cold-start + warm-render vs NFR-01 | **PASS** — see timings below. |

## Timings (M0 machine)

| Metric | Measured | NFR-01 budget | Verdict |
| ------ | -------- | ------------- | ------- |
| Cold start (JVM spawn → first PNG) | **1956 ms** | ≤ 5 s target / 10 s max | well within target |
| Warm render (median, `hello.xml`, 411×891 xxhdpi) | **30 ms** (min 28 / max 34) | ≤ 700 ms p90 (layout) | far under budget |
| App-repository rebuild on invalidation (T4) | **≈ 9 ms** | (hot-reload input) | ms-scale, as designed |

> The warm figure uses a minimal layout, so it is a floor rather than the ≤300-view p90 case — that
> full budget is validated by the golden corpus in M7. Cold start is representative (engine bootstrap
> dominates). Both confirm the architecture is comfortably inside NFR-01.

## Item 4 — fallback trigger & decision (AD-007 / design §D2 plan B)

**Trigger (empirical):** Paparazzi's `PaparazziCallback.loadView` throws `ClassNotFoundException`
for a genuinely-missing view class, and layoutlib's `BridgeInflater.createViewFromTag` only
substitutes a MockView when its callback *returns* one — for a missing class it calls
`loadCustomView` (returns null) and **rethrows**, so `LayoutInflater.inflate` returns null and the
whole file fails (observed: nested `InflateException` → `ClassNotFoundException: com.example.FakeView`).
Android Studio's own callback returns a MockView; Paparazzi's does not.

**Decision:** Applied the design's pre-agreed **plan B — preprocessor tag substitution**.
`preprocess.UnknownViewSubstitutor` replaces unknown fully-qualified view tags with a labeled
`TextView` box (text = class name), and `LogBridge` records a `substitutedClass` warning. The
custom-view fixture then renders with no exception escaping. Public interfaces (EngineAdapter,
LogBridge) are unchanged, so downstream phases are unaffected; the full preprocessor (Phase 5)
generalises this substitution.

## Measured artifact download (T3, one arch)

Total **159.9 MB** for macOS arm64 (top-level pins only) — inside the Q4 150–250 MB estimate.
Breakdown and SHA-256s: see `host/ENGINE_SURFACE.md` appendix. The full transitive androidx closure
(T15 `generateEngineManifest`) adds the remaining ~5–10 MB toward the Q4 "~165–175 MB" figure.

## Engine surface

Every Paparazzi internal symbol reached via friend-paths is inventoried in `host/ENGINE_SURFACE.md`,
along with the vendoring fallback should the flag ever break.

## Verdict

**M0 complete.** The architecture is validated: friend-paths engine access, one-time Bridge init with
rebuildable repositories (hot reload), end-to-end PNG rendering into a VS Code webview, drawable state
injection, and unknown-view handling (via the pre-agreed fallback). No item invalidated the
architecture; one item (unknown views) swapped to its bounded, pre-agreed strategy.
