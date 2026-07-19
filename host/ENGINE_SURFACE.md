# Engine Surface Inventory (AD-009)

This is the fork-inventory demanded by spec R1/R2 and design §D2. It enumerates every
Paparazzi 1.3.5 **`internal`** symbol the host reaches via `-Xfriend-paths`, plus the public
API it uses. Kept current as the EngineAdapter grows (M0 → M7).

**Engine pin**: Paparazzi 1.3.5 · layoutlib 14.0.11 (API 34) · tools 31.4.2 · Kotlin 2.0.21 · JDK 17.

**Friend-paths mechanism**: `host/build.gradle.kts` adds `-Xfriend-paths=<paparazzi-1.3.5.jar>`
to every Kotlin compile task. The jar path is resolved from the compile classpath at
configuration time. If the flag is dropped, `EngineSurfaceProbe.kt` stops compiling — the
build is the primary guard; `EngineSurfaceProbeTest` is the secondary runtime guard.

## Internal symbols touched via friend-paths

| Symbol | Package | Why the host needs it |
| ------ | ------- | --------------------- |
| `Renderer` | `app.cash.paparazzi.internal` | `prepare()` bootstrap sequence; the adapter re-implements it split into one-time Bridge init + rebuildable repositories. |
| `SessionParamsBuilder` | `app.cash.paparazzi.internal` | `internal data class`; builds per-session `SessionParams` (theme, deviceConfig, renderingMode, flags). Reused for config-only re-renders. |
| `PaparazziCallback` | `app.cash.paparazzi.internal` | `: LayoutlibCallback`; `getParser()` → `LayoutPullParser.createFromFile(...)` (file-backed inflation, Q3), view/resource loading, MockView fallback (T7). |
| `PaparazziLogger` | `app.cash.paparazzi.internal` | `: ILayoutLog, ILogger`; per-render log sink — the LogBridge (T7) mirrors this role. |
| `LayoutPullParser` | `app.cash.paparazzi.internal.parsers` | File-backed layout parsing of the overlay copy. |
| `FrameworkResourceRepository` | `app.cash.paparazzi.internal.resources` | Framework resources; built once per process. `create(resourceDirectoryOrFile, languagesToLoad, useCompiled9Patches)`. |
| `AppResourceRepository` | `app.cash.paparazzi.internal.resources` | App-level resources; **rebuilt on invalidation** for hot reload. `create(localResourceDirectories, moduleResourceDirectories, libraryRepositories)`. |
| `AarSourceResourceRepository` | `app.cash.paparazzi.internal.resources` | androidx/Material AAR resources. `create(resourceDirectoryOrFile, libraryName)`. |

## Public API used (no friend-paths needed)

| Symbol | Package | Use |
| ------ | ------- | --- |
| `PaparazziSdk` | `app.cash.paparazzi` | `snapshot(view, offsetMillis)`, `inflate()`, `unsafeUpdateConfig()`, `layoutInflater`, `resources`, `context`. Its `internal companion` holds `renderer`/`sessionParamsBuilder` (also friend-reachable). |
| `Environment` | `app.cash.paparazzi` | `@Poko` public class, 9 params; constructed directly to bypass `detectEnvironment()` (Q3). |
| `DeviceConfig` | `app.cash.paparazzi` | Public; night/density/orientation/size → `folderConfiguration` qualifier matching. |

## Fallback (pre-agreed, no re-design — design §D2)

If `-Xfriend-paths` proves brittle under a toolchain bump, **vendor** the ~6 core source files
(Apache-2.0) into the host under our own package and drop the flag. The EngineAdapter's public
interface is identical either way, so downstream phases are unaffected.

## M0 checklist outcomes

| # | Item | Status |
| - | ---- | ------ |
| 1 | friend-paths compiles against Paparazzi 1.3.5 internals (AD-009 gate) | PASS (primary) — verified in T2 |
| 2 | Bridge init once + AppResourceRepository rebuild (hot-reload gate) | pending T4 |
| 3 | Hello-render LinearLayout → PNG (end-to-end gate) | pending T5/T6 |
| 4 | MockView placeholder for unknown views (AD-007 gate) | pending T7 |
| 5 | Drawable state injection ≥3 states (Q2 gate) | pending T8 |
| 6 | Cold-start + warm-render timings vs NFR-01 | pending T9 |

## Appendix — measured artifact sizes (T3)

Measured by `./gradlew fetchEngine` on macOS arm64 (2026-07-19). Cache layout:
`host/.engine-cache/download/` (files + `.sha256` sidecars), `.../layoutlib/runtime/`
(unzipped: `build.prop`, `data/{fonts,icu,keyboards,mac-arm}`), `.../layoutlib/resources/`
(unzipped: `res/`, `resources*.bin`). Re-run is a checksum-verified no-op.

| Artifact | Size | SHA-256 |
| -------- | ---- | ------- |
| layoutlib-14.0.11.jar | 48.2 MB | `9a8ab05c…4fe4dd59` |
| layoutlib-runtime-14.0.11-mac-arm.jar | 72.0 MB | `df612670…35c5e29` |
| layoutlib-resources-14.0.11.jar | 31.6 MB | `e9aa0422…785bd9259` |
| layoutlib-api / common / sdk-common / ninepatch 31.4.2 | 2.1 MB | (4 jars) |
| androidx/Material top-level AARs (9) | 6.5 MB | material 1.12.0, appcompat 1.7.0, constraintlayout 2.2.1, core 1.13.1, recyclerview 1.3.2, cardview 1.0.0, coordinatorlayout 1.2.0, fragment 1.8.5, viewpager2 1.1.0 |

**Total (one arch, top-level only): 159.9 MB** — inside the Q4 estimate (150–250 MB). The full
transitive androidx closure (T15 `generateEngineManifest`) adds the remaining ~5–10 MB toward the
Q4 "~165–175 MB" refined figure.
