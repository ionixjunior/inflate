package render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.StateListDrawable
import com.android.ide.common.rendering.api.SessionParams.RenderingMode
import engine.ConfigMapper
import engine.EngineAdapter
import log.LogBridge
import out.PngWriter
import preprocess.Preprocessor
import rpc.DocKind
import rpc.DrawableState
import rpc.MatchedStateItem
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

    // State picker (P1-D): the requested state set, merged through a host view so enabled=false is
    // handled correctly. `stateSensitive` (root selector/ripple/animated-selector) tells the toolbar
    // whether to show the picker (P1-D AC3, DRW-07).
    val stateSensitive = rootTag(content) in STATE_SENSITIVE_ROOTS
    val requested = request.config.drawable?.states ?: emptyList()
    val stateArray = mergedStateArray(requested)

    val drawable: Drawable = when (request.docKind) {
      DocKind.color -> {
        val id = session.resourceId(overlayName, "color")
        val csl = adapter.loadColorStateList(id)
          ?: return error(request, "could not load color '$overlayName'", totalStart, warnings, dependencies, session.rebuilt)
        // A color-state-list swatch honours the picked state; a plain color uses its default.
        ColorDrawable(csl.getColorForState(stateArray, csl.defaultColor))
      }
      else -> {
        val id = session.resourceId(overlayName, "drawable")
        adapter.loadDrawable(id)
          ?: return error(request, "could not load drawable '$overlayName'", totalStart, warnings, dependencies, session.rebuilt)
      }
    }

    // DRW-07: for a StateListDrawable, report which <item> the applied state set matched.
    val matched = (drawable as? StateListDrawable)?.let { sld ->
      val index = sld.findStateDrawableIndex(stateArray)
      if (index < 0) null else MatchedStateItem(index = index, stateAttrs = stateAttrNames(sld, index))
    }

    // Apply the picked state before drawing (StateListDrawable selects its item; a ripple settles).
    val applyState: (Drawable) -> Unit = { d -> d.state = stateArray }

    // P1-D AC4 settled ripple overlay. layoutlib's software Canvas does not render RippleDrawable's
    // pressed RippleForeground (verified: the overlay is fully transparent even after setHotspot +
    // jumpToCurrentState), so — mirroring the design's host-side adaptive-icon compositing — we
    // composite the settled overlay ourselves using the ripple's resolved colour when a
    // ripple-triggering state is picked.
    val rippleOverlay: Int? =
      if (rootTag(content) == "ripple" && requested.any { it in RIPPLE_TRIGGER }) {
        rippleColorArgb(content, session, stateArray)
      } else {
        null
      }

    return renderLoadedDrawable(
      request, drawable, warnings, dependencies, prepareMs, session.rebuilt, totalStart,
      applyState = applyState,
      matched = matched,
      stateSensitive = stateSensitive,
      rippleOverlayArgb = rippleOverlay,
    )
  }

  /** Resolve a `<ripple android:color="...">` value (`#hex` or `@color/name`) to ARGB, or null. */
  private fun rippleColorArgb(content: String, session: EngineAdapter.ProjectSession, state: IntArray): Int? {
    val value = RIPPLE_COLOR.find(content)?.groupValues?.get(1)?.trim() ?: return DEFAULT_RIPPLE_ARGB
    return when {
      value.startsWith("#") -> runCatching { parseHexColor(value) }.getOrNull()
      value.startsWith("@") -> {
        val name = value.substringAfterLast('/')
        val id = session.resourceId(name, "color")
        adapter.loadColorStateList(id)?.getColorForState(state, DEFAULT_RIPPLE_ARGB)
      }
      else -> DEFAULT_RIPPLE_ARGB // e.g. ?attr/colorControlHighlight — theme-attr resolution deferred
    }
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
    stateSensitive: Boolean? = null,
    rippleOverlayArgb: Int? = null,
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
    var image: BufferedImage = try {
      drawToImage(drawable, w, h, applyState)
    } catch (t: Throwable) {
      return error(request, t.message ?: "drawable render failed", totalStart, warnings, dependencies, sessionRebuilt)
    }
    if (rippleOverlayArgb != null) image = compositeRippleOverlay(image, rippleOverlayArgb)
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
      stateSensitive = stateSensitive,
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
   * state (T45) before draw so a `StateListDrawable`/`ripple` shows the requested state. A ripple in
   * the pressed state is hotspot-centred and jumped to its settled (fully-shown) overlay (P1-D AC4),
   * and any transition/animated drawable is jumped to its current frame for a stable static preview.
   */
  protected fun drawToImage(
    drawable: Drawable,
    w: Int,
    h: Int,
    applyState: ((Drawable) -> Unit)? = null,
  ): BufferedImage {
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    drawable.setBounds(0, 0, w, h)
    applyState?.invoke(drawable)
    if (drawable is RippleDrawable) {
      drawable.setHotspotBounds(0, 0, w, h)
      drawable.setHotspot(w / 2f, h / 2f)
    }
    drawable.jumpToCurrentState()
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

  /**
   * The drawable state set for the requested picker [states] (P1-D AC1/AC2), merged through a host
   * [StateImageView] so `disabled` correctly *removes* `state_enabled` from the base rather than
   * adding a positive attr (productionizes the T8 spike's `onCreateDrawableState` merge).
   */
  private fun mergedStateArray(states: List<DrawableState>): IntArray {
    val view = StateImageView(adapter.context)
    view.isEnabled = DrawableState.disabled !in states
    view.setInjectedState(states.mapNotNull { STATE_ATTR[it] }.toIntArray())
    return view.drawableState
  }

  /**
   * Composite the settled ripple overlay [argb] over [base] (P1-D AC4). A *bounded* ripple (its base
   * paints opaque pixels — a content/mask layer) is masked to that painted region; an *unbounded*
   * ripple (transparent base) fills the whole canvas.
   */
  private fun compositeRippleOverlay(base: BufferedImage, argb: Int): BufferedImage {
    var anyOpaque = false
    outer@ for (y in 0 until base.height) {
      for (x in 0 until base.width) {
        if ((base.getRGB(x, y) ushr 24) != 0) { anyOpaque = true; break@outer }
      }
    }
    val out = BufferedImage(base.width, base.height, BufferedImage.TYPE_INT_ARGB)
    for (y in 0 until base.height) {
      for (x in 0 until base.width) {
        val bg = base.getRGB(x, y)
        val paint = !anyOpaque || (bg ushr 24) != 0 // unbounded → everywhere; bounded → within content
        out.setRGB(x, y, if (paint) srcOver(argb, bg) else bg)
      }
    }
    return out
  }

  /** Human-readable declared states of [index]'s `<item>` (e.g. `["state_pressed"]`, `["!state_enabled"]`). */
  private fun stateAttrNames(sld: StateListDrawable, index: Int): List<String> {
    val set = runCatching { sld.getStateSet(index) }.getOrNull() ?: return emptyList()
    return set.filter { it != 0 }.map { s ->
      val name = STATE_NAME[kotlin.math.abs(s)] ?: "0x${Integer.toHexString(kotlin.math.abs(s))}"
      if (s < 0) "!$name" else name
    }
  }

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

    /** Roots whose drawables are state-sensitive → the toolbar shows the state picker (P1-D AC1/AC3). */
    private val STATE_SENSITIVE_ROOTS = setOf("selector", "ripple", "animated-selector")

    /** Picker states that activate a ripple's settled overlay (P1-D AC4). */
    private val RIPPLE_TRIGGER = setOf(
      DrawableState.pressed, DrawableState.focused, DrawableState.selected, DrawableState.activated,
    )

    /** Fallback ripple colour when the `android:color` is a theme attr we don't resolve (translucent grey). */
    private const val DEFAULT_RIPPLE_ARGB: Int = 0x40808080

    private val RIPPLE_COLOR = Regex("""<\s*ripple\b[^>]*?\bandroid:color\s*=\s*"([^"]+)"""", RegexOption.DOT_MATCHES_ALL)

    private fun parseHexColor(value: String): Int {
      val hex = value.removePrefix("#")
      val v = hex.toLong(16)
      return when (hex.length) {
        6 -> (0xFF000000L or v).toInt()
        8 -> v.toInt()
        3 -> {
          val r = (v shr 8 and 0xF); val g = (v shr 4 and 0xF); val b = (v and 0xF)
          (0xFF000000L or (r * 0x11 shl 16) or (g * 0x11 shl 8) or (b * 0x11)).toInt()
        }
        else -> 0xFF000000.toInt()
      }
    }

    /** Source-over alpha composite of [fg] onto [bg] (both non-premultiplied ARGB). */
    private fun srcOver(fg: Int, bg: Int): Int {
      val fa = (fg ushr 24) and 0xFF
      if (fa == 0) return bg
      if (fa == 255) return fg
      val ba = (bg ushr 24) and 0xFF
      val outA = fa + ba * (255 - fa) / 255
      if (outA == 0) return 0
      fun ch(shift: Int): Int {
        val f = (fg ushr shift) and 0xFF
        val b = (bg ushr shift) and 0xFF
        return (f * fa + b * ba * (255 - fa) / 255) / outA
      }
      return (outA shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
    }

    /** Picker state → the framework state attr to add (disabled is handled via isEnabled=false). */
    private val STATE_ATTR = mapOf(
      DrawableState.pressed to android.R.attr.state_pressed,
      DrawableState.checked to android.R.attr.state_checked,
      DrawableState.focused to android.R.attr.state_focused,
      DrawableState.selected to android.R.attr.state_selected,
      DrawableState.activated to android.R.attr.state_activated,
    )

    /** Reverse map (framework state attr id → name) for the matched-item indicator (DRW-07). */
    private val STATE_NAME = mapOf(
      android.R.attr.state_pressed to "state_pressed",
      android.R.attr.state_checked to "state_checked",
      android.R.attr.state_enabled to "state_enabled",
      android.R.attr.state_focused to "state_focused",
      android.R.attr.state_selected to "state_selected",
      android.R.attr.state_activated to "state_activated",
      android.R.attr.state_window_focused to "state_window_focused",
      android.R.attr.state_hovered to "state_hovered",
    )

    private val ROOT_TAG = Regex("""<\s*([A-Za-z][\w.-]*)""")

    /** The previewed document's root element name (comments/prolog skipped). */
    private fun rootTag(content: String): String {
      val noComments = content.replace(Regex("<!--.*?-->", RegexOption.DOT_MATCHES_ALL), "")
      return ROOT_TAG.find(noComments)?.groupValues?.get(1) ?: ""
    }

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
