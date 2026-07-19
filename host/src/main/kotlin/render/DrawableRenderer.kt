package render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import com.android.ide.common.rendering.api.SessionParams.RenderingMode
import engine.ConfigMapper
import engine.EngineAdapter
import log.LogBridge
import out.PngWriter
import preprocess.Preprocessor
import rpc.DocKind
import rpc.RenderError
import rpc.RenderRequest
import rpc.RenderResponse
import rpc.RenderStatus
import rpc.RenderTimings
import rpc.Warning
import rpc.WarningKind
import java.awt.image.BufferedImage
import java.io.File

/**
 * T44 — the drawable render executor (DRW-01/02/06/08, P1-C AC1/AC2/AC5). Mirrors [LayoutRenderer]'s
 * pipeline but loads a *drawable* instead of inflating a layout:
 *
 *   read content -> Preprocessor.preprocess (overlay + refs + warnings) -> session -> resolve the
 *   overlay drawable/color id -> load it themed -> size + snapshot through a host [StateImageView] ->
 *   PNG (alpha preserved) -> RenderResponse.
 *
 * Sizing (P1-C AC2, DRW-08): intrinsic-sized drawables (vector, bitmap — `getIntrinsicWidth > 0`)
 * render at their own (density-scaled) size; drawables with no intrinsic size (shape, color, ripple)
 * render on a default [DEFAULT_CANVAS_DP]×[DEFAULT_CANVAS_DP] dp canvas. A `sizeDp` request override
 * forces an exact canvas either way.
 *
 * The drawable is drawn directly onto a transparent `Bitmap`/`Canvas` rather than snapshotted through
 * a host view — the layout snapshot path paints the theme's (opaque) window background, which would
 * defeat the spec's "PNG keeps alpha; checkerboard/solid backdrop is applied webview-side" contract
 * (design §Rendering table, §15). State injection (T45) sets the drawable state before drawing; the
 * theme is still applied to the loading context so `?attr/`/`@color` refs resolve identically to
 * layouts (single fidelity truth).
 *
 * Resource references inside a drawable (`@color/`, `@dimen/`, `?attr/`, another `@drawable/`)
 * resolve through the same session/theme as layouts (P1-C AC5, single fidelity truth).
 *
 * State injection (T45), animated/level variants (T46), nine-patch (T47) and adaptive-icon (T48)
 * extend this core; T44 renders the static, stateless frame.
 */
open class DrawableRenderer(
  protected val adapter: EngineAdapter,
  private val pngWriter: PngWriter,
  private val overlayBaseDir: File,
) {

  /** Tracks the last previewed overlay so a document switch forces an app-repo re-index (see LayoutRenderer). */
  private var lastOverlayName: String? = null

  /** Result of loading + resolving the previewed drawable, shared by the render subclasses. */
  protected class Loaded(
    val drawable: Drawable,
    val overlayName: String,
    val prepareMs: Int,
  )

  fun render(request: RenderRequest): RenderResponse {
    val totalStart = System.nanoTime()
    val log = LogBridge()
    val docFile = File(request.docPath)
    val roots = request.roots.map(::File)

    val content = request.inlineContent ?: runCatching { docFile.readText() }.getOrElse {
      return error(request, "cannot read ${request.docPath}: ${it.message}", totalStart)
    }

    val pre = Preprocessor.preprocess(
      content = content,
      docKind = request.docKind,
      docPath = docFile,
      roots = roots,
      overlayBaseDir = overlayBaseDir,
      log = log,
    )
    val warnings = mapWarnings(pre.warnings).toMutableList()
    val dependencies = resolveDependencies(pre.referencedResources, roots)

    pre.syntaxError?.let { syntax ->
      return RenderResponse(
        id = request.id,
        status = RenderStatus.error,
        warnings = warnings,
        error = RenderError(syntax.message, file = request.docPath, line = syntax.line, column = syntax.column),
        dependencies = dependencies,
        timings = RenderTimings(0, 0, 0, elapsedMs(totalStart)),
        sessionRebuilt = false,
      )
    }
    val overlayFile = pre.overlayFile
      ?: return error(request, "preprocessing produced no overlay", totalStart, warnings, dependencies)

    adapter.overlayDir = File(overlayBaseDir, "res")
    val overlayName = overlayFile.nameWithoutExtension
    if (overlayName != lastOverlayName) {
      adapter.invalidate()
      lastOverlayName = overlayName
    }

    val prepareStart = System.nanoTime()
    val session = adapter.session(roots, request.packageName)
    val prepareMs = elapsedMs(prepareStart)

    val deviceConfig = ConfigMapper.map(request.config)
    // Apply the request's density + theme to the loading context so intrinsic sizes scale to the
    // selected density and ?attr/@color refs resolve (single fidelity truth). NORMAL mode: the
    // drawable is drawn directly onto a bitmap below, not snapshotted, so the mode is immaterial.
    adapter.configureRender(deviceConfig, request.config.themeName, RenderingMode.NORMAL)

    val drawable: Drawable = when (request.docKind) {
      DocKind.color -> {
        val id = session.resourceId(overlayName, "color")
        val csl = adapter.loadColorStateList(id)
          ?: return error(request, "could not load color '$overlayName'", totalStart, warnings, dependencies, session.rebuilt)
        ColorDrawable(csl.defaultColor)
      }
      else -> {
        val id = session.resourceId(overlayName, "drawable")
        adapter.loadDrawable(id)
          ?: return error(request, "could not load drawable '$overlayName'", totalStart, warnings, dependencies, session.rebuilt)
      }
    }

    return renderLoadedDrawable(request, drawable, warnings, dependencies, prepareMs, session.rebuilt, totalStart)
  }

  /**
   * Size [drawable] per P1-C AC2 / DRW-08, draw it onto a transparent bitmap, write the PNG and
   * assemble the response. Subclasses (T45/T46) pass [applyState] to set the drawable state before it
   * is drawn, plus [staticPreviewBadge] (DRW-04) and [matched] (DRW-07) for the response.
   */
  protected fun renderLoadedDrawable(
    request: RenderRequest,
    drawable: Drawable,
    warnings: List<Warning>,
    dependencies: List<String>,
    prepareMs: Int,
    sessionRebuilt: Boolean,
    totalStart: Long,
    applyState: ((Drawable) -> Unit)? = null,
    staticPreviewBadge: Boolean? = null,
    matched: rpc.MatchedStateItem? = null,
  ): RenderResponse {
    val density = adapter.displayDensity
    val override = request.config.drawable?.sizeDp
    val hasIntrinsic = drawable.intrinsicWidth > 0 && drawable.intrinsicHeight > 0
    val (w, h) = when {
      override != null -> px(override.w, density) to px(override.h, density)
      hasIntrinsic -> drawable.intrinsicWidth to drawable.intrinsicHeight
      else -> px(DEFAULT_CANVAS_DP, density) to px(DEFAULT_CANVAS_DP, density)
    }

    val renderStart = System.nanoTime()
    val image: BufferedImage = try {
      drawToImage(drawable, w, h, applyState)
    } catch (t: Throwable) {
      return error(request, t.message ?: "drawable render failed", totalStart, warnings, dependencies, sessionRebuilt)
    }
    val renderMs = elapsedMs(renderStart)

    val png = pngWriter.write(request.docPath, request.id.toLong(), image)
    return RenderResponse(
      id = request.id,
      status = RenderStatus.ok,
      pngPath = png.absolutePath,
      imageWidth = image.width,
      imageHeight = image.height,
      staticPreviewBadge = staticPreviewBadge,
      matchedStateItem = matched,
      warnings = warnings,
      error = null,
      dependencies = dependencies,
      timings = RenderTimings(prepareMs, 0, renderMs, elapsedMs(totalStart)),
      sessionRebuilt = sessionRebuilt,
    )
  }

  /**
   * Draw [drawable] onto a fresh transparent [w]×[h] `ARGB_8888` bitmap (so unpainted pixels keep
   * alpha 0) and return it as a Java [BufferedImage]. [applyState], when given, sets the drawable
   * state (T45) before bounds/draw so a `StateListDrawable`/`ripple` shows the requested state.
   */
  protected fun drawToImage(
    drawable: Drawable,
    w: Int,
    h: Int,
    applyState: ((Drawable) -> Unit)? = null,
  ): BufferedImage {
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    applyState?.invoke(drawable)
    drawable.setBounds(0, 0, w, h)
    drawable.draw(Canvas(bitmap))
    val pixels = IntArray(w * h)
    bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
    val image = BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
    image.setRGB(0, 0, w, h, pixels, 0, w)
    return image
  }

  private fun error(
    request: RenderRequest,
    message: String,
    totalStart: Long,
    warnings: List<Warning> = emptyList(),
    dependencies: List<String> = emptyList(),
    sessionRebuilt: Boolean = false,
  ): RenderResponse = RenderResponse(
    id = request.id,
    status = RenderStatus.error,
    warnings = warnings,
    error = RenderError(message, file = request.docPath),
    dependencies = dependencies,
    timings = RenderTimings(0, 0, 0, elapsedMs(totalStart)),
    sessionRebuilt = sessionRebuilt,
  )

  private fun resolveDependencies(refs: List<Preprocessor.Ref>, roots: List<File>): List<String> {
    val out = LinkedHashSet<String>()
    for (ref in refs) {
      if (ref.kind !in FILE_BACKED_KINDS) continue
      for (root in roots) {
        val typeDirs = root.listFiles { f -> f.isDirectory && (f.name == ref.kind || f.name.startsWith("${ref.kind}-")) }
          ?: continue
        for (dir in typeDirs) {
          for (ext in RESOURCE_FILE_EXTS) {
            File(dir, "${ref.name}$ext").let { if (it.isFile) { out += it.absolutePath } }
          }
        }
      }
    }
    return out.toList()
  }

  private fun mapWarnings(entries: List<LogBridge.Entry>): List<Warning> = entries.map { entry ->
    Warning(kind = warningKind(entry.kind), message = entry.message, detail = entry.tag)
  }

  companion object {
    /** Default square canvas (dp) for non-intrinsic drawables (P1-C AC2, design §15). */
    const val DEFAULT_CANVAS_DP: Int = 128

    private val FILE_BACKED_KINDS = setOf("layout", "drawable", "mipmap", "color", "font", "anim")
    private val RESOURCE_FILE_EXTS = listOf(".xml", ".axml", ".png", ".webp", ".jpg")

    private fun px(dp: Int, density: Float): Int = Math.round(dp * density).coerceAtLeast(1)
    private fun elapsedMs(startNanos: Long): Int = ((System.nanoTime() - startNanos) / 1_000_000L).toInt()

    private fun warningKind(kind: LogBridge.Kind): WarningKind = when (kind) {
      LogBridge.Kind.unresolvedRef -> WarningKind.unresolvedRef
      LogBridge.Kind.substitutedClass -> WarningKind.substitutedClass
      LogBridge.Kind.bindingReplaced -> WarningKind.bindingReplaced
      LogBridge.Kind.levelDefault -> WarningKind.levelDefault
      LogBridge.Kind.notice -> WarningKind.notice
      LogBridge.Kind.error -> WarningKind.notice
    }
  }
}
