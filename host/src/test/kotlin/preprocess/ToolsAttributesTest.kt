package preprocess

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T29 unit coverage — the core design-time `tools:` attribute set is copied into `android:`
 * (override-or-add) and every `tools:` attribute (core and non-core) plus the namespace
 * declaration is stripped, with no line added or removed (LAY-04 tools: half).
 */
class ToolsAttributesTest {

  @Test
  fun `tools_text is added as android_text when no android_text exists`() {
    val xml = """<TextView tools:text="Hello" />"""
    val out = ToolsAttributes.apply(xml).content
    assertTrue(out.contains("""android:text="Hello""""), "core attr must be copied to android:")
    assertFalse(out.contains("tools:"), "no tools: remnants")
  }

  @Test
  fun `tools_text overrides an existing android_text value`() {
    val xml = """<TextView android:text="Old" tools:text="New" />"""
    val out = ToolsAttributes.apply(xml).content
    assertTrue(out.contains("""android:text="New""""), "tools: value must win")
    assertFalse(out.contains("Old"), "the overridden value must be gone")
    assertFalse(out.contains("tools:"))
  }

  @Test
  fun `every core attribute is honored — src, visibility, background, layout`() {
    val xml = """<fragment tools:src="@drawable/x" tools:visibility="gone" """ +
      """tools:background="#FFFFFF" tools:layout="@layout/preview" />"""
    val out = ToolsAttributes.apply(xml).content
    assertTrue(out.contains("""android:src="@drawable/x""""))
    assertTrue(out.contains("""android:visibility="gone""""))
    assertTrue(out.contains("""android:background="#FFFFFF""""))
    assertTrue(out.contains("""android:layout="@layout/preview""""))
    assertFalse(out.contains("tools:"))
  }

  @Test
  fun `non-core tools attribute is stripped silently without a copy`() {
    val xml = """<LinearLayout tools:context=".MainActivity" tools:ignore="HardcodedText" />"""
    val out = ToolsAttributes.apply(xml).content
    assertFalse(out.contains("tools:"), "non-core tools: attrs must not remain")
    assertFalse(out.contains("android:context"), "non-core attrs are dropped, not copied")
    assertFalse(out.contains("android:ignore"))
  }

  @Test
  fun `xmlns_tools namespace declaration is stripped`() {
    val xml = """<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" """ +
      """xmlns:tools="http://schemas.android.com/tools" tools:text="x" />"""
    val out = ToolsAttributes.apply(xml).content
    assertFalse(out.contains("xmlns:tools"))
    assertTrue(out.contains("xmlns:android"), "unrelated namespace declarations are untouched")
  }

  @Test
  fun `no tools remnants anywhere in a mixed document`() {
    val xml = """
      <LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
          xmlns:tools="http://schemas.android.com/tools"
          tools:context=".MainActivity">
          <TextView android:id="@+id/label" tools:text="Preview label" tools:visibility="visible" />
          <include android:layout_width="match_parent" tools:layout="@layout/header" />
      </LinearLayout>
    """.trimIndent()
    val out = ToolsAttributes.apply(xml).content
    assertFalse(out.contains("tools:"))
    assertTrue(out.contains("""android:text="Preview label""""))
    assertTrue(out.contains("""android:visibility="visible""""))
    assertTrue(out.contains("""android:layout="@layout/header""""))
  }

  @Test
  fun `attribute-level edits never add or remove a line`() {
    val xml = "<LinearLayout\n    tools:text=\"a\"\n    android:id=\"@+id/x\" />\n"
    val out = ToolsAttributes.apply(xml).content
    assertEquals(xml.lines().size, out.lines().size, "line count must be preserved (lineMap stays valid)")
  }

  @Test
  fun `a tag with no tools attributes is left untouched`() {
    val xml = """<LinearLayout android:id="@+id/x" />"""
    val out = ToolsAttributes.apply(xml).content
    assertEquals(xml, out)
  }
}
