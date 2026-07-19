package rpc

import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory

/**
 * Protocol DTOs (host side). Single source of truth: `docs/protocol.md` + the shared fixtures
 * under `docs/protocol/fixtures` (JSON files) — this file and its TypeScript counterpart
 * (`extension/src/protocol.ts`) are both validated against those same fixtures (T10/T11/T12,
 * AD-010). Adapters are moshi's reflection-based Kotlin factory (no kapt/KSP codegen step):
 * a non-null constructor parameter with no default is required in JSON (Moshi throws
 * `JsonDataException` naming the missing property), a nullable/defaulted parameter is optional.
 */

enum class DocKind { layout, drawableXml, ninePatch, color }
enum class Orientation { portrait, landscape }
enum class Density { mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi }
enum class DrawableState { default, pressed, checked, disabled, focused, selected, activated }

enum class WarningKind {
  unresolvedRef,
  substitutedClass,
  bindingReplaced,
  levelDefault,
  notice,
  materialAttrMissing,
}

enum class ThemeSource { project, material, appcompat, platform }
enum class SizeBucket { normal, large, xlarge }
enum class RenderStatus { ok, error }
enum class LogLevel { info, debug }

@JsonClass(generateAdapter = false)
data class DevicePreset(
  val id: String,
  val label: String,
  val widthDp: Int,
  val heightDp: Int,
  val defaultDensity: String,
  val sizeBucket: SizeBucket,
)

@JsonClass(generateAdapter = false)
data class DrawableSize(val w: Int, val h: Int)

@JsonClass(generateAdapter = false)
data class DrawableConfig(
  val states: List<DrawableState> = emptyList(),
  val sizeDp: DrawableSize? = null,
)

@JsonClass(generateAdapter = false)
data class PreviewConfig(
  val themeName: String,
  val isProjectTheme: Boolean,
  val night: Boolean,
  val device: DevicePreset,
  val orientation: Orientation,
  val density: Density,
  val pixelScale: Int,
  val drawable: DrawableConfig? = null,
)

@JsonClass(generateAdapter = false)
data class RenderRequest(
  val id: Int,
  val docPath: String,
  val docKind: DocKind,
  val inlineContent: String? = null,
  val roots: List<String>,
  val packageName: String,
  val config: PreviewConfig,
  val timeoutMs: Int,
)

@JsonClass(generateAdapter = false)
data class Warning(
  val kind: WarningKind,
  val message: String,
  val detail: String? = null,
)

@JsonClass(generateAdapter = false)
data class MatchedStateItem(
  val index: Int,
  val stateAttrs: List<String>,
)

@JsonClass(generateAdapter = false)
data class RenderError(
  val message: String,
  val file: String? = null,
  val line: Int? = null,
  val column: Int? = null,
)

@JsonClass(generateAdapter = false)
data class RenderTimings(
  val prepareMs: Int,
  val inflateMs: Int,
  val renderMs: Int,
  val totalMs: Int,
)

@JsonClass(generateAdapter = false)
data class RenderResponse(
  val id: Int,
  val status: RenderStatus,
  val pngPath: String? = null,
  val imageWidth: Int? = null,
  val imageHeight: Int? = null,
  val staticPreviewBadge: Boolean? = null,
  val matchedStateItem: MatchedStateItem? = null,
  val canvasCapped: Boolean? = null,
  val warnings: List<Warning>,
  val error: RenderError? = null,
  val dependencies: List<String>,
  val timings: RenderTimings,
  val sessionRebuilt: Boolean,
)

@JsonClass(generateAdapter = false)
data class InitializeParams(
  val layoutlibRuntimeRoot: String,
  val layoutlibResourcesRoot: String,
  // Always the literal "assembled-by-launcher" (design §D5) — kept as String rather than an enum
  // because that value contains hyphens and is not a legal Kotlin enum-constant identifier.
  val classpathNote: String,
  val libraryResDirs: List<String>,
  val libraryPackages: List<String>,
  val outputDir: String,
  val overlayDir: String,
  // Always 34 (design §D6 pin); plain Int rather than a literal type — Kotlin has no int-literal types.
  val compileSdkVersion: Int,
  val logLevel: LogLevel,
)

@JsonClass(generateAdapter = false)
data class ThemeInfo(
  val name: String,
  val isProjectTheme: Boolean,
  val source: ThemeSource,
)

/** Params for the `listThemes` RPC (design §D5): the resolved roots + package to enumerate over. */
@JsonClass(generateAdapter = false)
data class ListThemesParams(
  val roots: List<String>,
  val packageName: String,
)

/** Params for the `invalidate` RPC (design §D5): the changed dependency paths under a session root. */
@JsonClass(generateAdapter = false)
data class InvalidateParams(
  val paths: List<String> = emptyList(),
)

/** Shared moshi instance for the protocol DTOs (host side). */
object ProtocolMoshi {
  val moshi: Moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()
}
