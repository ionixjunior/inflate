package render

import app.cash.paparazzi.DeviceConfig
import engine.ConfigMapper
import engine.EngineAdapter
import log.LogBridge
import out.PngWriter
import preprocess.Preprocessor
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
 * T35 — the layout render executor (LAY-01/02/03/07, UX-04, HOST-02). Ties the Preprocessor
 * (Phase 5) to the EngineAdapter session (Phase 4) and PngWriter (M0):
 *
 *   read content -> Preprocessor.preprocess (overlay + lineMap + warnings) -> session -> inflate the
 *   overlay by id -> snapshot -> PNG -> RenderResponse (warnings, dependencies, timings).
 *
 * Failures are mapped, never thrown at the caller:
 *  - a Preprocessor syntax error becomes a [RenderError] with the file + 1-based line/col (already
 *    1-based from kxml2);
 *  - a layoutlib inflation/log error's `"Binary XML file line #N"` is reverse-mapped through the
 *    [Preprocessor.LineMap] back to the user's original line ([mapBinaryXmlLine]).
 *
 * Preprocessor warnings (custom-view substitutions, data-binding notices, structural/cycle notices)
 * are mapped 1:1 onto [RenderResponse.warnings]. A canvas larger than [MAX_CANVAS_PX] on either axis
 * is clipped to that cap and a `canvasCapped` notice is emitted.
 */
class LayoutRenderer(
  private val adapter: EngineAdapter,
  private val pngWriter: PngWriter,
  private val overlayBaseDir: File,
) {

  /**
   * The overlay resource name (per-document, Preprocessor-assigned) indexed by the last-built app
   * repository. The Preprocessor writes a fresh overlay every render; when the *name* changes (a
   * different previewed document), the app repository must be rebuilt so the new overlay file is
   * indexed. A re-render of the SAME document keeps the name, so the cheap file-backed re-read path
   * (no rebuild) drives hot reload.
   */
  private var lastOverlayName: String? = null

  fun render(request: RenderRequest): RenderResponse {
    val totalStart = System.nanoTime()
    val log = LogBridge()
    val docFile = File(request.docPath)
    val roots = request.roots.map(::File)

    val content = request.inlineContent ?: runCatching { docFile.readText() }.getOrElse {
      return errorResponse(
        request,
        RenderError(message = "cannot read ${request.docPath}: ${it.message}", file = request.docPath),
        warnings = emptyList(),
        dependencies = emptyList(),
        timings = RenderTimings(0, 0, 0, elapsedMs(totalStart)),
        sessionRebuilt = false,
      )
    }

    val pre = Preprocessor.preprocess(
      content = content,
      docKind = request.docKind,
      docPath = docFile,
      roots = roots,
      overlayBaseDir = overlayBaseDir,
      log = log,
    )
    val warnings = mapWarnings(pre.warnings)
    val dependencies = resolveDependencies(pre.referencedResources, roots)

    pre.syntaxError?.let { syntax ->
      return errorResponse(
        request,
        RenderError(message = syntax.message, file = request.docPath, line = syntax.line, column = syntax.column),
        warnings = warnings,
        dependencies = dependencies,
        timings = RenderTimings(0, 0, 0, elapsedMs(totalStart)),
        sessionRebuilt = false,
      )
    }

    val overlayFile = pre.overlayFile ?: return errorResponse(
      request,
      RenderError(message = "preprocessing produced no overlay", file = request.docPath),
      warnings = warnings,
      dependencies = dependencies,
      timings = RenderTimings(0, 0, 0, elapsedMs(totalStart)),
      sessionRebuilt = false,
    )

    // The overlay layout lives on the session's resource path at <overlayBaseDir>/res/... .
    adapter.overlayDir = File(overlayBaseDir, "res")
    val overlayName = overlayFile.nameWithoutExtension
    if (overlayName != lastOverlayName) {
      // A different previewed document: force the app repository to re-index so the new overlay is
      // resolvable. Same-document re-renders skip this and rely on per-inflate file re-reads.
      adapter.invalidate()
      lastOverlayName = overlayName
    }

    val prepareStart = System.nanoTime()
    val session = adapter.session(roots, request.packageName)
    val prepareMs = elapsedMs(prepareStart)

    var deviceConfig = ConfigMapper.map(request.config)
    val capped = deviceConfig.screenWidth > MAX_CANVAS_PX || deviceConfig.screenHeight > MAX_CANVAS_PX
    if (capped) {
      deviceConfig = deviceConfig.copy(
        screenWidth = deviceConfig.screenWidth.coerceAtMost(MAX_CANVAS_PX),
        screenHeight = deviceConfig.screenHeight.coerceAtMost(MAX_CANVAS_PX),
      )
    }

    val layoutId = session.resourceId(overlayName, "layout")
    val renderStart = System.nanoTime()
    val image: BufferedImage = try {
      session.render(layoutId, deviceConfig, request.config.themeName)
    } catch (t: Throwable) {
      val mappedLine = mapBinaryXmlLine(t.message, pre.lineMap)
      return errorResponse(
        request,
        RenderError(message = t.message ?: "layout inflation failed", file = request.docPath, line = mappedLine),
        warnings = warnings,
        dependencies = dependencies,
        timings = RenderTimings(prepareMs, 0, elapsedMs(renderStart), elapsedMs(totalStart)),
        sessionRebuilt = session.rebuilt,
      )
    }
    val renderMs = elapsedMs(renderStart)

    val finalImage = clip(image)
    val png = pngWriter.write(request.docPath, request.id.toLong(), finalImage)

    val allWarnings = if (capped) {
      warnings + Warning(
        kind = WarningKind.notice,
        message = "Canvas exceeds ${MAX_CANVAS_PX}px; clipped to ${MAX_CANVAS_PX}x$MAX_CANVAS_PX",
        detail = "canvasCapped",
      )
    } else {
      warnings
    }

    return RenderResponse(
      id = request.id,
      status = RenderStatus.ok,
      pngPath = png.absolutePath,
      imageWidth = finalImage.width,
      imageHeight = finalImage.height,
      canvasCapped = if (capped) true else null,
      warnings = allWarnings,
      error = null,
      dependencies = dependencies,
      timings = RenderTimings(prepareMs, 0, renderMs, elapsedMs(totalStart)),
      sessionRebuilt = session.rebuilt,
    )
  }

  /** Crop [image] to the [MAX_CANVAS_PX] cap on either axis (clip; the device was already clamped). */
  private fun clip(image: BufferedImage): BufferedImage {
    if (image.width <= MAX_CANVAS_PX && image.height <= MAX_CANVAS_PX) return image
    return image.getSubimage(0, 0, image.width.coerceAtMost(MAX_CANVAS_PX), image.height.coerceAtMost(MAX_CANVAS_PX))
  }

  private fun errorResponse(
    request: RenderRequest,
    error: RenderError,
    warnings: List<Warning>,
    dependencies: List<String>,
    timings: RenderTimings,
    sessionRebuilt: Boolean,
  ): RenderResponse = RenderResponse(
    id = request.id,
    status = RenderStatus.error,
    warnings = warnings,
    error = error,
    dependencies = dependencies,
    timings = timings,
    sessionRebuilt = sessionRebuilt,
  )

  /**
   * Best-effort dependency resolution for hot-reload watching (UX-02): map referenced `@layout`,
   * `@drawable`, `@mipmap`, `@color`, and `@font` names to their on-disk files under [roots]. Values
   * kinds (`@string`/`@dimen`/…) live in the `values` directories the scheduler already watches
   * wholesale, so they are not resolved here.
   */
  private fun resolveDependencies(refs: List<Preprocessor.Ref>, roots: List<File>): List<String> {
    val out = LinkedHashSet<String>()
    for (ref in refs) {
      if (ref.kind !in FILE_BACKED_KINDS) continue
      resolveResourceFile(ref.kind, ref.name, roots)?.let { out += it.absolutePath }
    }
    return out.toList()
  }

  private fun resolveResourceFile(kind: String, name: String, roots: List<File>): File? {
    for (root in roots) {
      val typeDirs = root.listFiles { f -> f.isDirectory && (f.name == kind || f.name.startsWith("$kind-")) }
        ?: continue
      for (dir in typeDirs) {
        for (ext in RESOURCE_FILE_EXTS) {
          File(dir, "$name$ext").let { if (it.isFile) return it }
        }
      }
    }
    return null
  }

  private fun mapWarnings(entries: List<LogBridge.Entry>): List<Warning> = entries.map { entry ->
    Warning(kind = warningKind(entry.kind), message = entry.message, detail = entry.tag)
  }

  companion object {
    /** The 4096x4096 px render canvas cap (spec §Implicit-dimension sweep; larger → clipped). */
    const val MAX_CANVAS_PX: Int = 4096

    private val BINARY_XML_LINE = Regex("""Binary XML file line #(\d+)""")
    private val FILE_BACKED_KINDS = setOf("layout", "drawable", "mipmap", "color", "font")
    private val RESOURCE_FILE_EXTS = listOf(".xml", ".axml")

    /**
     * Reverse-map a layoutlib `"Binary XML file line #N"` error (which counts lines in the
     * preprocessed overlay) back to the user's original 1-based line via [lineMap]. Returns null when
     * the message carries no such marker.
     */
    fun mapBinaryXmlLine(message: String?, lineMap: Preprocessor.LineMap): Int? {
      if (message == null) return null
      val overlayLine = BINARY_XML_LINE.find(message)?.groupValues?.get(1)?.toIntOrNull() ?: return null
      return lineMap.originalLine(overlayLine)
    }

    private fun warningKind(kind: LogBridge.Kind): WarningKind = when (kind) {
      LogBridge.Kind.unresolvedRef -> WarningKind.unresolvedRef
      LogBridge.Kind.substitutedClass -> WarningKind.substitutedClass
      LogBridge.Kind.bindingReplaced -> WarningKind.bindingReplaced
      LogBridge.Kind.levelDefault -> WarningKind.levelDefault
      LogBridge.Kind.notice -> WarningKind.notice
      LogBridge.Kind.error -> WarningKind.notice
    }

    private fun elapsedMs(startNanos: Long): Int = ((System.nanoTime() - startNanos) / 1_000_000L).toInt()
  }
}
