package out

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.awt.image.BufferedImage
import java.io.File

/** Unit coverage for PngWriter file emission and per-document pruning (design §18). */
class PngWriterTest {

  private fun img() = BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB)

  @Test
  fun `writes a png per render`(@TempDir dir: File) {
    val writer = PngWriter(dir)
    val f = writer.write("docA", 1, img())
    assertTrue(f.exists() && f.length() > 0, "png should be written")
    assertTrue(f.name.endsWith("__1.png"))
  }

  @Test
  fun `keeps only the last two renders per document`(@TempDir dir: File) {
    val writer = PngWriter(dir, keepPerDoc = 2)
    writer.write("docA", 1, img())
    writer.write("docA", 2, img())
    writer.write("docA", 3, img())

    val remaining = writer.filesFor("docA")
    assertEquals(2, remaining.size)
    // newest first: renderIds 3 then 2; renderId 1 pruned
    assertTrue(remaining[0].name.endsWith("__3.png"))
    assertTrue(remaining[1].name.endsWith("__2.png"))
  }

  @Test
  fun `pruning is scoped per document`(@TempDir dir: File) {
    val writer = PngWriter(dir, keepPerDoc = 2)
    writer.write("docA", 1, img())
    writer.write("docA", 2, img())
    writer.write("docA", 3, img()) // prunes docA #1
    writer.write("docB", 1, img()) // must not be affected by docA pruning

    assertEquals(2, writer.filesFor("docA").size)
    assertEquals(1, writer.filesFor("docB").size)
    assertTrue(writer.filesFor("docB").single().name.endsWith("__1.png"))
  }
}
