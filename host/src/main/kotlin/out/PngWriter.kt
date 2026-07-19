package out

import java.awt.image.BufferedImage
import java.io.File
import javax.imageio.ImageIO

/**
 * Writes render frames to PNG on disk (image transport is by file path, AD-010). Keeps the last
 * [keepPerDoc] renders per document (current + previous, for stale display) and deletes older ones.
 *
 * Files are named `<docToken>__<renderId>.png` so pruning is scoped per document even when several
 * documents share one session output dir.
 */
class PngWriter(
  private val outputDir: File,
  private val keepPerDoc: Int = 2,
) {
  /** Write [image] for [docKey] at [renderId], prune old frames for that doc, return the PNG file. */
  fun write(docKey: String, renderId: Long, image: BufferedImage): File {
    outputDir.mkdirs()
    val token = tokenOf(docKey)
    val file = File(outputDir, "${token}__$renderId.png")
    ImageIO.write(image, "PNG", file)
    prune(token)
    return file
  }

  /** Current PNG files for [docKey], newest (highest renderId) first. */
  fun filesFor(docKey: String): List<File> = existing(tokenOf(docKey))

  private fun prune(token: String) {
    existing(token).drop(keepPerDoc).forEach { it.delete() }
  }

  private fun existing(token: String): List<File> {
    val prefix = "${token}__"
    return (outputDir.listFiles() ?: emptyArray())
      .filter { it.name.startsWith(prefix) && it.name.endsWith(".png") }
      .sortedByDescending { renderIdOf(it.name, prefix) }
  }

  private fun renderIdOf(fileName: String, prefix: String): Long =
    fileName.removePrefix(prefix).removeSuffix(".png").toLongOrNull() ?: -1L

  private fun tokenOf(docKey: String): String = docKey.replace(Regex("[^A-Za-z0-9]"), "_")
}
