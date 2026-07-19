package preprocess

import java.io.File
import log.LogBridge
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

/**
 * T31 unit coverage — merge wrap, fragment include/placeholder swap, ViewStub pass-through, and
 * include-graph cycle detection (self-include and 2-file), per LAY-02 / P1-A AC4 and the spec's
 * include-cycle edge case.
 */
class StructuralTest {

  private val docPath = File("/project/res/layout/a.xml")

  @Test
  fun `merge root is wrapped in a match_parent FrameLayout, preserving xmlns declarations`() {
    val xml = """<merge xmlns:android="http://schemas.android.com/apk/res/android">""" +
      """<TextView android:id="@+id/x" /></merge>"""

    val out = Structural.process(xml, docPath, roots = emptyList(), LogBridge()).content

    assertFalse(out.contains("<merge"))
    assertFalse(out.contains("</merge>"))
    assertTrue(out.startsWith("<FrameLayout"))
    assertTrue(out.contains("""android:layout_width="match_parent""""))
    assertTrue(out.contains("""android:layout_height="match_parent""""))
    assertTrue(out.contains("xmlns:android"), "xmlns declarations must carry over")
    assertTrue(out.contains("""<TextView android:id="@+id/x" />"""), "merge children are preserved")
    assertTrue(out.trimEnd().endsWith("</FrameLayout>"))
  }

  @Test
  fun `fragment with android_layout is swapped for an include of that layout`() {
    val xml = """<fragment android:id="@+id/f" android:layout="@layout/detail" """ +
      """android:layout_width="match_parent" android:layout_height="wrap_content" />"""

    val out = Structural.process(xml, docPath, roots = emptyList(), LogBridge()).content

    assertFalse(out.contains("<fragment"))
    assertTrue(out.contains("""<include layout="@layout/detail""""))
    assertTrue(out.contains("""android:id="@+id/f""""), "carried attrs survive onto the include")
    assertTrue(out.contains("""android:layout_width="match_parent""""))
  }

  @Test
  fun `fragment without android_layout becomes a labeled placeholder and logs a notice`() {
    val xml = """<fragment android:name="com.example.HomeFragment" android:layout_width="match_parent" """ +
      """android:layout_height="match_parent" />"""
    val log = LogBridge()

    val out = Structural.process(xml, docPath, roots = emptyList(), log).content

    assertFalse(out.contains("<fragment"))
    assertTrue(out.contains("<TextView"))
    assertTrue(out.contains("""android:text="com.example.HomeFragment""""))
    assertEquals(1, log.warnings().size)
    assertTrue(log.warnings().single().message.contains("com.example.HomeFragment"))
  }

  @Test
  fun `ViewStub is left completely untouched`() {
    val xml = """<FrameLayout><ViewStub android:id="@+id/stub" android:layout="@layout/x" /></FrameLayout>"""

    val out = Structural.process(xml, docPath, roots = emptyList(), LogBridge()).content

    assertEquals(xml, out)
  }

  @Test
  fun `self-include is detected as a cycle and aborted with the exact path`(@TempDir tempDir: File) {
    val xml = """<FrameLayout><include layout="@layout/a" /></FrameLayout>"""
    val log = LogBridge()

    val out = Structural.process(xml, docPath, roots = emptyList(), log).content

    assertFalse(out.contains("<include"), "the cyclic include must be replaced")
    assertTrue(out.contains("a -> a"), "the warning/placeholder names the exact self-include path")
    assertEquals(1, log.warnings().size)
    assertTrue(log.warnings().single().message.contains("a -> a"))
  }

  @Test
  fun `a 2-file include cycle is detected and aborted naming the exact path`(@TempDir tempDir: File) {
    val resDir = File(tempDir, "res")
    val layoutDir = File(resDir, "layout").apply { mkdirs() }
    File(layoutDir, "b.xml").writeText("""<FrameLayout><include layout="@layout/a" /></FrameLayout>""")
    val aPath = File(layoutDir, "a.xml")
    val aXml = """<FrameLayout><include layout="@layout/b" /></FrameLayout>"""
    val log = LogBridge()

    val out = Structural.process(aXml, aPath, roots = listOf(resDir), log).content

    assertFalse(out.contains("<include"), "the include that leads into the cycle must be replaced")
    assertTrue(out.contains("a -> b -> a"), "the warning/placeholder names the full cycle chain")
    assertEquals(1, log.warnings().size)
    assertTrue(log.warnings().single().message.contains("a -> b -> a"))
  }

  @Test
  fun `a non-cyclic include is left untouched and logs no warning`(@TempDir tempDir: File) {
    val resDir = File(tempDir, "res")
    val layoutDir = File(resDir, "layout").apply { mkdirs() }
    File(layoutDir, "b.xml").writeText("<FrameLayout />") // b has no includes of its own
    val aPath = File(layoutDir, "a.xml")
    val aXml = """<FrameLayout><include layout="@layout/b" /></FrameLayout>"""
    val log = LogBridge()

    val out = Structural.process(aXml, aPath, roots = listOf(resDir), log).content

    assertEquals(aXml, out)
    assertTrue(log.warnings().isEmpty())
  }
}
