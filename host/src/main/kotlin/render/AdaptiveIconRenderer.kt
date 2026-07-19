package render

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import java.awt.image.BufferedImage

/**
 * T48 — `<adaptive-icon>` composition (DRW-06, P1-C AC6). The design calls for inflating the
 * background and foreground layers and compositing them under a **circular mask** in host drawing
 * code (v1 targets the common circle; the launcher's system mask is not reproduced by the pinned
 * engine — which also cannot resolve an `<adaptive-icon>` XML directly under the SDK-free dynamic-id
 * scheme). The layers are drawn (background first, foreground on top) onto a square canvas and every
 * pixel outside the inscribed circle is cleared (corners transparent, centre opaque).
 */
class AdaptiveIconRenderer {

  /** Compose [background] + [foreground] into a [size]×[size] image under a circular mask. */
  fun compose(background: Drawable?, foreground: Drawable?, size: Int): BufferedImage {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    background?.apply { setBounds(0, 0, size, size); draw(canvas) }
    foreground?.apply { setBounds(0, 0, size, size); draw(canvas) }

    val pixels = IntArray(size * size)
    bitmap.getPixels(pixels, 0, size, 0, 0, size, size)

    // Circular mask inscribed in the square: clear every pixel whose centre lies outside the circle.
    val c = size / 2.0
    val r = size / 2.0
    val r2 = r * r
    for (y in 0 until size) {
      for (x in 0 until size) {
        val dx = x + 0.5 - c
        val dy = y + 0.5 - c
        if (dx * dx + dy * dy > r2) pixels[y * size + x] = 0
      }
    }

    val image = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
    image.setRGB(0, 0, size, size, pixels, 0, size)
    return image
  }
}
