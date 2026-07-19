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
| 2 | Bridge init once + AppResourceRepository rebuild (hot-reload gate) | PASS (primary) — T4; rebuild ~9 ms on the M0 machine |
| 3 | Hello-render LinearLayout → PNG (end-to-end gate) | PASS (primary) — T5 (host PNG 200x200, alpha) + T6 (VS Code webview shows the PNG, lazy activation) |
| 4 | MockView placeholder for unknown views (AD-007 gate) | **FALLBACK-APPLIED** (plan B: preprocessor tag substitution) — see note below |
| 5 | Drawable state injection ≥3 states (Q2 gate) | PASS (primary) — T8; 4 states render distinctly, findStateDrawableIndex correct. Fallback (re-inflate per state) not needed |
| 6 | Cold-start + warm-render timings vs NFR-01 | PASS — T9; cold start 1956 ms (target 5 s), warm render median 30 ms (budget 700 ms). See docs/m0-findings.md |

## M0 item 4 — fallback trigger + decision (T7)

**Trigger (empirical, verified T7):** Paparazzi's `PaparazziCallback.loadView` throws
`ClassNotFoundException` for a missing view class, and layoutlib's `BridgeInflater.createViewFromTag`
only substitutes a MockView when its callback *returns* one — for a genuinely-missing class it calls
`loadCustomView` (which returns null) and **rethrows**, so `LayoutInflater.inflate` returns null and
the whole file fails to inflate (observed: `InflateException` → `ClassNotFoundException: com.example.FakeView`).
Android Studio's own callback returns a MockView; Paparazzi's does not.

**Decision:** Applied the design's pre-agreed plan B (§D2, AD-007) — **preprocessor tag substitution**.
`preprocess.UnknownViewSubstitutor` replaces unknown fully-qualified view tags with a labeled
`TextView` box (text = class name), and the LogBridge records a `substitutedClass` warning. The
custom-view fixture then renders with no exception escaping. The adapter/LogBridge public interfaces
are unchanged, so downstream phases are unaffected; the full preprocessor (Phase 5) generalises this.

## Framework-class delegation for library views (T38b, AD-014)

**The gap (empirically verified T39/T38b).** layoutlib's `layoutlib_create` transform renames six
framework classes to `_Original_*` and expects the *canonical* names to be resolvable **separately**:

| Renamed original (present in `layoutlib-14.0.11.jar`) | Canonical name layoutlib expects (ABSENT from every published jar) |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `android/os/_Original_Build` (+ `$VERSION`, `$VERSION_CODES`, `$Partition`) | `android/os/Build` (+ inner) |
| `android/os/_Original_ServiceManager` (+ inner) | `android/os/ServiceManager` |
| `android/view/_Original_SurfaceView` (+ inner) | `android/view/SurfaceView` |
| `android/view/_Original_WindowManagerImpl` (+ inner) | `android/view/WindowManagerImpl` |
| `android/view/textservice/_Original_TextServicesManager` | `android/view/textservice/TextServicesManager` |
| `android/webkit/_Original_WebView` (+ inner) | `android/webkit/WebView` |

Confirmed via `unzip -l`: the canonical `android/os/Build.class` is in **no** cached jar (layoutlib jar,
runtime jar, resources jar, tools jars); only `_Original_Build` exists. The `create` package present in
the layoutlib jar is metadata + runtime support only (`CreateInfo`, `NativeConfig`, `OverrideMethod`,
`MethodAdapter`, `InjectMethodRunnables`) — the generating tool (`create.Main`/`AsmGenerator`) is **not
published**.

**How Paparazzi's own suite resolves it (the reference mechanism).** Paparazzi 1.3.5 pins the exact same
`com.android.tools.layoutlib:layoutlib:14.0.11`. Its Gradle plugin adds **no** ASM transform (only an
`UnzipTransform` for the native runtime). The canonical `android.os.Build` comes from the **mockable
`android.jar`** the Android Gradle Plugin puts on every Android module's unit-test runtime classpath.
`Renderer.configureBuildProperties()` then copies `_Original_Build`'s field values into it, and
`PaparazziSdk.forcePlatformSdkVersion()` sets `Build.VERSION.SDK_INT`. Both **silently `return`** when
`android.os.Build` is not loadable (`catch (ClassNotFoundException)`), which is why framework-only
rendering (`LinearLayout`/`TextView`, which never force-resolve `Build`) worked through M0–M6 and the gap
only surfaced when a real `MaterialButton` (`MaterialButton.<init>` reads `Build.VERSION.SDK_INT`) was
first inflated in Phase 7 → `NoClassDefFoundError: android/os/Build$VERSION` → MockView substitution.

**Our mechanism (SDK-free equivalent).** Inflate ships no Android SDK (AD-006), so we reconstruct the six
canonical classes from layoutlib's own `_Original_*` copies — which ARE the real framework
implementations — by a **byte-faithful ASM class rename** (`/_Original_` → `/`):
`engine.FrameworkDelegateGenerator` (`org.ow2.asm:asm` + `asm-commons`, `ClassRemapper` +
`ClassWriter.COMPUTE_MAXS`). This is strictly more faithful than hand-written stubs (every field, nested
class and method is preserved) and cannot collide (layoutlib ships only `_Original_*`, never the
canonical names, so the produced jar *adds* classes). A byte-identical `Build.<clinit>` is proven safe
under the Bridge because Paparazzi's `configureBuildProperties()` already forces `_Original_Build.<clinit>`
to run to copy values. The Gradle task `generateFrameworkDelegates` runs it against the resolved
`layoutlib` jar and puts `framework-delegates.jar` on the `engineTest` classpath; the same
`FrameworkDelegateGenerator.generate(layoutlibJar, outJar)` is reusable by the real host at engine setup.

Verified (T38b): `engine.LibraryResourcesTest` inflates a real
`com.google.android.material.button.MaterialButton` inside `androidx.constraintlayout.widget.ConstraintLayout`
(no `NoClassDefFoundError`, no MockView) under `Theme.Material3.DayNight`.

**New internal/library symbols touched.** `org.objectweb.asm.{ClassReader,ClassWriter}` and
`org.objectweb.asm.commons.{ClassRemapper,Remapper}` (ASM 9.7). No new Paparazzi/layoutlib *internal*
symbols beyond those already inventoried above; the delegation operates purely on layoutlib's published
`_Original_*` bytecode.

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
