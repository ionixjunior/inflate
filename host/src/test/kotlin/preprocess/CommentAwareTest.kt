package preprocess

import java.io.File
import log.LogBridge
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import rpc.DocKind

/**
 * G1 discriminating coverage (LAY-02/LAY-04, P1-A AC4/AC6) — the regex transform stages must treat
 * tag-like text inside `<!-- … -->` comments as inert: a commented `<merge>`, `<fragment>`,
 * `<include>`, `@{…}` binding, custom tag, or `@kind/name` reference must NOT be transformed and must
 * survive byte-identical, while the SAME constructs OUTSIDE comments are still transformed. These
 * tests fail against the comment-unaware code and pass once the stages skip comment spans.
 */
class CommentAwareTest {

  private val docPath = File("/project/res/layout/a.xml")

  // --- Structural ---------------------------------------------------------------------------------

  @Test
  fun `a commented merge is not wrapped, but a real merge still is`() {
    val commented = "<LinearLayout>\n  <!-- convert to <merge></merge> later -->\n  <TextView />\n</LinearLayout>"
    val out = Structural.process(commented, docPath, roots = emptyList(), LogBridge()).content
    assertEquals(commented, out, "a <merge> inside a comment must be left byte-identical")
    assertTrue(out.contains("<!-- convert to <merge></merge> later -->"), "the comment survives unchanged")

    val real = """<merge xmlns:android="http://schemas.android.com/apk/res/android"><TextView /></merge>"""
    val realOut = Structural.process(real, docPath, roots = emptyList(), LogBridge()).content
    assertTrue(realOut.startsWith("<FrameLayout"), "a real <merge> is still wrapped")
    assertFalse(realOut.contains("<merge"))
  }

  @Test
  fun `a commented fragment is not substituted and logs no notice`() {
    val xml = "<FrameLayout>\n  <!-- <fragment android:name=\"com.example.Foo\" /> -->\n  <TextView />\n</FrameLayout>"
    val log = LogBridge()
    val out = Structural.process(xml, docPath, roots = emptyList(), log).content
    assertEquals(xml, out, "a commented <fragment> must not be swapped")
    assertTrue(log.warnings().isEmpty(), "no fragment notice for commented markup")
  }

  @Test
  fun `a commented cyclic include is not flagged`() {
    val xml = "<FrameLayout>\n  <!-- <include layout=\"@layout/a\" /> -->\n</FrameLayout>"
    val log = LogBridge()
    val out = Structural.process(xml, docPath, roots = emptyList(), log).content
    assertEquals(xml, out, "a commented <include> must not be walked or replaced")
    assertTrue(log.warnings().isEmpty(), "no include-cycle notice for commented markup")
  }

  // --- ToolsAttributes ----------------------------------------------------------------------------

  @Test
  fun `a commented tools attribute is not promoted, but a real one is`() {
    val commented = """<FrameLayout><!-- <TextView tools:text="draft" /> --></FrameLayout>"""
    assertEquals(commented, ToolsAttributes.apply(commented).content, "commented tools: attrs stay byte-identical")

    val real = """<TextView tools:text="draft" />"""
    val realOut = ToolsAttributes.apply(real).content
    assertTrue(realOut.contains("""android:text="draft""""), "a real tools:text is promoted to android:text")
    assertFalse(realOut.contains("tools:"), "the real tools: attribute is stripped")
  }

  // --- DataBinding --------------------------------------------------------------------------------

  @Test
  fun `a commented binding expression is not replaced, but a real one is`() {
    val commented = "<layout xmlns:android=\"http://schemas.android.com/apk/res/android\">\n" +
      "  <!-- android:text=\"@{user.name}\" -->\n" +
      "  <TextView android:text=\"static\" />\n" +
      "</layout>"
    val log = LogBridge()
    val result = DataBinding.unwrap(commented, Preprocessor.LineMap.identity(commented), log)
    assertTrue(result.content.contains("<!-- android:text=\"@{user.name}\" -->"), "commented @{} survives byte-identical")
    assertFalse(result.bindingReplaced, "a commented binding must not count as a replacement")
    assertFalse(log.warnings().any { it.kind == LogBridge.Kind.bindingReplaced }, "no bindingReplaced notice")
    // The xmlns must still land on the real promoted root (TextView), not on the comment line.
    assertTrue(
      result.content.contains("<TextView xmlns:android=\"http://schemas.android.com/apk/res/android\""),
      "the xmlns must reach the real view root; content=${result.content}",
    )

    val real = "<layout xmlns:android=\"http://schemas.android.com/apk/res/android\">\n" +
      "  <TextView android:text=\"@{user.name}\" />\n" +
      "</layout>"
    val realResult = DataBinding.unwrap(real, Preprocessor.LineMap.identity(real), LogBridge())
    assertTrue(realResult.bindingReplaced, "a real @{} is still replaced")
    assertFalse(realResult.content.contains("@{"), "the real binding expression is gone")
  }

  // --- Scan ---------------------------------------------------------------------------------------

  @Test
  fun `a commented custom tag is not substituted and its refs are not tracked`() {
    val xml = "<FrameLayout>\n  <!-- <com.example.Custom android:src=\"@drawable/ghost\" /> -->\n" +
      "  <TextView />\n</FrameLayout>"
    val log = LogBridge()
    val result = Scan.scan(xml, isLoadable = { false }, log)
    assertEquals(xml, result.content, "a commented custom tag must not be substituted (even when unloadable)")
    assertTrue(result.customClasses.isEmpty(), "no custom class recorded from a comment")
    assertTrue(log.warnings().isEmpty(), "no substitutedClass warning from a comment")
    assertFalse(
      result.referencedResources.any { it.name == "ghost" },
      "a @drawable/ghost inside a comment is not a real dependency",
    )
  }

  @Test
  fun `a commented view class form is not substituted, but a real one is`() {
    val commented = """<FrameLayout><!-- <view class="com.example.C" /> --></FrameLayout>"""
    val result = Scan.scan(commented, isLoadable = { false }, LogBridge())
    assertEquals(commented, result.content, "a commented <view class> must survive unchanged")

    val real = """<view class="com.example.C" android:id="@+id/a" />"""
    val realResult = Scan.scan(real, isLoadable = { false }, LogBridge())
    assertTrue(realResult.content.contains("<TextView"), "a real <view class> is still substituted")
    assertEquals(listOf("com.example.C"), realResult.customClasses)
  }

  // --- Full pipeline ------------------------------------------------------------------------------

  @Test
  fun `commented markup is fully inert through the whole preprocessor`(@TempDir tmp: File) {
    val comment = "<!-- <merge> @{user.name} <com.example.Custom/> android:src=\"@drawable/ghost\" -->"
    val content = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" +
      "<FrameLayout xmlns:android=\"http://schemas.android.com/apk/res/android\">\n" +
      "  $comment\n" +
      "  <TextView android:layout_width=\"wrap_content\" android:layout_height=\"wrap_content\" />\n" +
      "</FrameLayout>\n"

    val log = LogBridge()
    val result = Preprocessor.preprocess(
      content = content,
      docKind = DocKind.layout,
      docPath = File("/project/res/layout/x.xml"),
      roots = emptyList(),
      overlayBaseDir = tmp,
      log = log,
      isLoadable = { false }, // even the harshest predicate must not touch the commented custom tag
    )

    val overlay = result.overlayFile!!.readText()
    assertTrue(overlay.contains(comment), "the comment must reach the overlay byte-identical; overlay=$overlay")
    assertTrue(overlay.contains("<FrameLayout xmlns:android"), "the real root is preserved")
    assertTrue(
      log.warnings().none {
        it.kind == LogBridge.Kind.substitutedClass ||
          it.kind == LogBridge.Kind.bindingReplaced ||
          it.kind == LogBridge.Kind.notice
      },
      "commented markup must produce no substitution/binding/notice warnings; warnings=${log.warnings()}",
    )
    assertTrue(result.customClasses.isEmpty(), "no custom classes from a comment")
    assertFalse(result.referencedResources.any { it.name == "ghost" }, "commented refs are not dependencies")
  }
}
