package preprocess

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import rpc.DocKind

/**
 * T28 unit coverage — Preprocessor core: kxml2 well-formedness parse (1-based line/col, UX-04),
 * overlay emission under a unique per-document name, and identity [Preprocessor.LineMap] for a file
 * that needed no rewriting (P1-A AC3 data half).
 */
class PreprocessorCoreTest {

  @Test
  fun `valid XML is written to a uniquely-named overlay file`(@TempDir tempDir: File) {
    val docPath = File("/project/res/layout/foo.xml")
    val xml = "<LinearLayout><TextView /></LinearLayout>"

    val result = Preprocessor.preprocess(xml, DocKind.layout, docPath, roots = emptyList(), overlayBaseDir = tempDir)

    assertNull(result.syntaxError)
    assertNotNull(result.overlayFile)
    val overlay = result.overlayFile!!
    assertTrue(overlay.exists())
    assertEquals(xml, overlay.readText())
    assertTrue(overlay.name.startsWith("inflate_preview__"), "overlay file name must be uniquely generated")
    assertTrue(overlay.name.endsWith(".xml"))
    assertEquals("layout", overlay.parentFile.name, "overlay lives under the original type dir")
  }

  @Test
  fun `overlay file name is unique per document path`(@TempDir tempDir: File) {
    val xml = "<LinearLayout />"
    val a = Preprocessor.preprocess(
      xml,
      DocKind.layout,
      File("/project/res/layout/a.xml"),
      roots = emptyList(),
      overlayBaseDir = tempDir,
    )
    val b = Preprocessor.preprocess(
      xml,
      DocKind.layout,
      File("/project/res/layout/b.xml"),
      roots = emptyList(),
      overlayBaseDir = tempDir,
    )

    assertNotEquals(a.overlayFile!!.name, b.overlayFile!!.name, "distinct doc paths must not collide")
  }

  @Test
  fun `syntax error reports 1-based line and column, and writes no overlay`(@TempDir tempDir: File) {
    // Mismatched end tag on line 2 — kxml2 reports the position where the mismatch is detected.
    val xml = "<Foo>\n<Bar>\n</Foo>"
    val docPath = File("/project/res/layout/broken.xml")

    val result = Preprocessor.preprocess(xml, DocKind.layout, docPath, roots = emptyList(), overlayBaseDir = tempDir)

    assertNull(result.overlayFile, "a syntax error must not produce an overlay")
    assertNotNull(result.syntaxError)
    val error = result.syntaxError!!
    assertEquals(3, error.line, "kxml2 reports the line of the offending closing tag")
    assertEquals(7, error.column, "kxml2 reports the column right after the offending token")
    assertTrue(error.message.isNotBlank())
    val layoutOverlayDir = tempDir.resolve("res/layout")
    assertTrue(
      !layoutOverlayDir.exists() || layoutOverlayDir.listFiles().isNullOrEmpty(),
      "no overlay file must be written on syntax error",
    )
  }

  @Test
  fun `unterminated attribute is reported as a syntax error with line and column`(@TempDir tempDir: File) {
    val xml = """<Foo><Bar attr="unterminated></Bar></Foo>"""
    val result = Preprocessor.preprocess(
      xml,
      DocKind.layout,
      File("/project/res/layout/broken2.xml"),
      roots = emptyList(),
      overlayBaseDir = tempDir,
    )

    assertNull(result.overlayFile)
    assertNotNull(result.syntaxError)
    val error = result.syntaxError!!
    assertEquals(1, error.line)
    assertTrue(error.column > 0)
  }

  @Test
  fun `lineMap is identity for a file that required no rewriting`(@TempDir tempDir: File) {
    val xml = "<LinearLayout>\n  <TextView />\n</LinearLayout>\n"
    val result = Preprocessor.preprocess(
      xml,
      DocKind.layout,
      File("/project/res/layout/foo.xml"),
      roots = emptyList(),
      overlayBaseDir = tempDir,
    )

    assertEquals(xml.lines().size, result.lineMap.size)
    for (line in 1..result.lineMap.size) {
      assertEquals(line, result.lineMap.originalLine(line), "untouched lines map to themselves")
    }
  }

  @Test
  fun `no warnings, references or custom classes for a plain framework layout`(@TempDir tempDir: File) {
    val result = Preprocessor.preprocess(
      "<LinearLayout />",
      DocKind.layout,
      File("/project/res/layout/foo.xml"),
      roots = emptyList(),
      overlayBaseDir = tempDir,
    )

    assertTrue(result.warnings.isEmpty())
    assertTrue(result.referencedResources.isEmpty())
    assertTrue(result.customClasses.isEmpty())
  }
}
