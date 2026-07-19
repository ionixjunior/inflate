package render

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import preprocess.Preprocessor.LineMap

/**
 * T35 wiring item 2 (UX-04): a layoutlib `"Binary XML file line #N"` error counts lines in the
 * preprocessed overlay; [LayoutRenderer.mapBinaryXmlLine] must reverse-map N through the
 * [LineMap] to the user's original line. Pure function — no engine needed, so it runs in the fast
 * `test` gate and discriminates the mapping direction directly.
 */
class LayoutRendererErrorMapTest {

  @Test
  fun `reverse-maps a binary xml line through the line map`() {
    // Overlay line 3 originated at original line 7 (e.g. a <data> block removed two lines above it).
    val map = LineMap(listOf(5, 6, 7, 8))
    val line = LayoutRenderer.mapBinaryXmlLine("Error inflating: Binary XML file line #3 in tag", map)
    assertEquals(7, line, "overlay line 3 must map back to original line 7")
  }

  @Test
  fun `identity map passes the line through unchanged`() {
    val map = LineMap.identity("a\nb\nc\nd\ne")
    assertEquals(4, LayoutRenderer.mapBinaryXmlLine("Binary XML file line #4", map))
  }

  @Test
  fun `returns null when the message carries no binary-xml marker`() {
    val map = LineMap.identity("a\nb")
    assertNull(LayoutRenderer.mapBinaryXmlLine("some unrelated failure", map))
    assertNull(LayoutRenderer.mapBinaryXmlLine(null, map))
  }
}
