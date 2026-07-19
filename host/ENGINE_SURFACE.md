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

_Populated by the `fetchEngine` task in T3._
