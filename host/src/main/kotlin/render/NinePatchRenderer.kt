package render

import com.android.ninepatch.NinePatch
import engine.ConfigMapper
import out.PngWriter
import rpc.RenderError
import rpc.RenderRequest
import rpc.RenderResponse
import rpc.RenderStatus
import rpc.RenderTimings
import rpc.Warning
import rpc.WarningKind
import java.awt.AlphaComposite
import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * T47 — source-format nine-patch (`.9.png`) rendering (DRW-05, P1-C AC4). A `.9.png` carries its
 * stretch-region and content-padding markers in a 1px border; `com.android.tools:ninepatch` decodes
 * that border and stretches the content honoring the markers. The preview stretches the patch to two
 * request sizes side by side in one composite image so the corner-unscaled behavior is visible.
 *
 * If the marker border is malformed (a tick pixel that is neither fully-opaque black nor transparent
 * — the aapt rule), the patch cannot be decoded, so the preview falls back to a plain image (the raw
 * bitmap with its 1px marker border stripped) plus a marker-error warning (spec edge case).
 *
 * This path needs no layoutlib session — the `.9.png` is read straight from disk and drawn with AWT.
 */
class NinePatchRenderer(private val pngWriter: PngWriter) {

  /** Decoded result exposed for testing: the composite (or fallback) image, padding, and marker error. */
  class Decoded(
    val image: BufferedImage,
    val padding: IntArray?,
    val markerError: String?,
    val sizes: List<Pair<Int, Int>>,
  )

  fun render(request: RenderRequest): RenderResponse {
    val totalStart = System.nanoTime()
    val file = File(request.docPath)
    val raw = runCatching { ImageIO.read(file) }.getOrNull()
      ?: return RenderResponse(
        id = request.id,
        status = RenderStatus.error,
        warnings = emptyList(),
        error = RenderError("cannot read nine-patch image ${request.docPath}", file = request.docPath),
        dependencies = emptyList(),
        timings = RenderTimings(0, 0, 0, elapsedMs(totalStart)),
        sessionRebuilt = false,
      )

    val density = ConfigMapper.densityDpi(request.config.density) / 160f
    val override = request.config.drawable?.sizeDp
    val baseW = px(override?.w ?: SIZE_A_DP, density)
    val baseH = px(override?.h ?: SIZE_A_DP, density)
    val sizes = listOf(baseW to baseH, baseW * 2 to baseH * 2)

    val renderStart = System.nanoTime()
    val decoded = decode(raw, sizes)
    val renderMs = elapsedMs(renderStart)

    val warnings = buildList {
      if (decoded.markerError != null) {
        add(Warning(WarningKind.notice, "Malformed nine-patch markers (${decoded.markerError}); showing plain image.", "ninePatchMarkers"))
      } else {
        val p = decoded.padding
        val padStr = if (p != null) "[l=${p[0]},t=${p[1]},r=${p[2]},b=${p[3]}]" else "[none]"
        add(Warning(WarningKind.notice, "Nine-patch stretched at ${sizes.joinToString(", ") { "${it.first}x${it.second}" }}; content padding $padStr.", "ninePatch"))
      }
    }

    val png = pngWriter.write(request.docPath, request.id.toLong(), decoded.image)
    return RenderResponse(
      id = request.id,
      status = RenderStatus.ok,
      pngPath = png.absolutePath,
      imageWidth = decoded.image.width,
      imageHeight = decoded.image.height,
      warnings = warnings,
      error = null,
      dependencies = emptyList(),
      timings = RenderTimings(0, 0, renderMs, elapsedMs(totalStart)),
      sessionRebuilt = false,
    )
  }

  /**
   * Decode [raw] and stretch it to each of [sizes], laid out side by side in one composite. On a
   * marker error, returns the plain-image fallback (marker border stripped) at the first size.
   */
  fun decode(raw: BufferedImage, sizes: List<Pair<Int, Int>>): Decoded {
    val markerError = markerError(raw)
    if (markerError != null) {
      return Decoded(plainFallback(raw), padding = null, markerError = markerError, sizes = sizes)
    }
    // convert=true keeps the existing marker border for the chunk parser (convert=false would ADD a
    // fresh empty border, discarding the real markers). Guard against a decode throw → fallback.
    val np = runCatching { NinePatch.load(raw, true, true) }.getOrNull()
      ?: return Decoded(plainFallback(raw), padding = null, markerError = "could not decode nine-patch", sizes = sizes)
    val padding = IntArray(4).also { np.getPadding(it) }

    val gap = GAP_PX
    val totalW = sizes.sumOf { it.first } + gap * (sizes.size - 1)
    val totalH = sizes.maxOf { it.second }
    val composite = BufferedImage(totalW, totalH, BufferedImage.TYPE_INT_ARGB)
    val g = composite.createGraphics()
    var x = 0
    for ((w, h) in sizes) {
      np.draw(g, x, 0, w, h)
      x += w + gap
    }
    g.dispose()
    return Decoded(composite, padding, markerError = null, sizes = sizes)
  }

  /** Plain-image fallback: the raw bitmap with its 1px marker border stripped (if large enough). */
  private fun plainFallback(raw: BufferedImage): BufferedImage {
    val src = if (raw.width > 2 && raw.height > 2) raw.getSubimage(1, 1, raw.width - 2, raw.height - 2) else raw
    val out = BufferedImage(src.width, src.height, BufferedImage.TYPE_INT_ARGB)
    val g = out.createGraphics()
    g.composite = AlphaComposite.Src
    g.drawImage(src, 0, 0, null)
    g.dispose()
    return out
  }

  companion object {
    /** First preview edge (dp); the second render is twice this (P1-C AC4 "at least two sizes"). */
    private const val SIZE_A_DP = 40
    private const val GAP_PX = 8

    private fun px(dp: Int, density: Float): Int = Math.round(dp * density).coerceAtLeast(1)
    private fun elapsedMs(startNanos: Long): Int = ((System.nanoTime() - startNanos) / 1_000_000L).toInt()

    /**
     * Validate the 1px marker border: every non-corner border pixel must be fully transparent or
     * fully-opaque black (the aapt tick rule). Returns the first offending location, or null if valid.
     */
    fun markerError(img: BufferedImage): String? {
      if (img.width < 3 || img.height < 3) return "image ${img.width}x${img.height} is too small for markers"
      fun bad(x: Int, y: Int): Boolean {
        val argb = img.getRGB(x, y)
        val a = (argb ushr 24) and 0xFF
        return a != 0 && argb != 0xFF000000.toInt()
      }
      for (x in 1 until img.width - 1) {
        if (bad(x, 0)) return "top tick at x=$x"
        if (bad(x, img.height - 1)) return "bottom tick at x=$x"
      }
      for (y in 1 until img.height - 1) {
        if (bad(0, y)) return "left tick at y=$y"
        if (bad(img.width - 1, y)) return "right tick at y=$y"
      }
      return null
    }
  }
}
