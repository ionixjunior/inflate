package preprocess

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * DF-5 (HOST-05) unit coverage — [Bom.strip] semantics in isolation from the render pipeline.
 */
class BomTest {

  @Test
  fun `a single leading BOM is stripped`() {
    assertEquals("<LinearLayout />", Bom.strip("﻿<LinearLayout />"))
  }

  @Test
  fun `content with no leading BOM is returned unchanged`() {
    val xml = "<LinearLayout><TextView /></LinearLayout>"
    assertEquals(xml, Bom.strip(xml))
  }

  @Test
  fun `an interior BOM is left untouched (not document content at offset 0)`() {
    val xml = "<LinearLayout android:text=\"a﻿b\" />"
    assertEquals(xml, Bom.strip(xml))
  }

  @Test
  fun `a string of only a BOM strips to an empty string`() {
    assertEquals("", Bom.strip("﻿"))
  }
}
