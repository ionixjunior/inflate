package engine

import log.LogBridge
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.nio.file.Files

/**
 * T27 engineTest — unresolved-reference degradation (P1-G AC4, RES-04). The broken fixture
 * references four missing kinds and a style with a broken parent; after degradation the file renders
 * successfully with a magenta background, every missing ref is warned exactly once with its kind,
 * and the broken style parent degrades to its nearest resolvable ancestor with a warning.
 */
class DegradationTest {

  private val pkg = "com.inflate.degraded"

  @Test
  fun `degrades every unresolved kind, warns exactly, and still renders`() {
    val proj = EngineTestSupport.copyFixtureTree("unresolved-refs")
    val res = File(proj, "res")
    val stylesFile = File(res, "values/styles.xml")
    val overlayRes = File(Files.createTempDirectory("inflate-overlay").toFile(), "res").apply { mkdirs() }
    val roots = listOf(res)

    val log = LogBridge()
    val adapter = EngineAdapter(EngineTestSupport.runtimeRoot(), EngineTestSupport.resourcesRoot())
    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = proj, roots = roots, packageName = pkg))
    adapter.session(roots, pkg)
    // Real existence check (getIdentifier can't detect absence under the dynamic-id scheme, Q3).
    val resolves: (String, String) -> Boolean = { kind, name -> adapter.appResourceExists(kind, name) }

    val degradation = Degradation(log, overlayRes)

    // Broken style parent -> nearest resolvable ancestor (Base.Ghost -> Base).
    val styleResult = degradation.degradeStyleParent("@style/Base.Ghost") { name -> resolves("style", name) }
    assertTrue(styleResult.degraded, "the broken style parent must be degraded")
    assertEquals("Base", styleResult.resolvedParent, "nearest resolvable ancestor is @style/Base")
    stylesFile.writeText(
      """
      <?xml version="1.0" encoding="utf-8"?>
      <resources>
        <style name="Base"><item name="android:padding">2dp</item></style>
        <style name="Broken" parent="@style/${styleResult.resolvedParent}" />
      </resources>
      """.trimIndent(),
    )

    // Degrade the four unresolved references in the layout.
    val degraded = degradation.degradeReferences(File(res, "layout/broken.xml").readText(), resolves)
    assertEquals(
      setOf(
        Degradation.Ref("color", "missing"),
        Degradation.Ref("dimen", "missing"),
        Degradation.Ref("string", "missing"),
        Degradation.Ref("drawable", "missing"),
      ),
      degraded.unresolved.toSet(),
      "exactly the four missing refs, each with its kind",
    )
    assertEquals(4, degraded.unresolved.size, "no duplicate/extra degraded refs")
    assertTrue(degraded.placeholderEmitted, "an outlined placeholder drawable must be emitted")
    // The per-kind substitutions are present in the degraded content.
    assertTrue(degraded.content.contains("\"#FF00FF\""), "color -> magenta")
    assertTrue(degraded.content.contains("\"0dp\""), "dimen -> 0dp")
    assertTrue(degraded.content.contains("android:text=\"missing\""), "string -> reference name")
    assertTrue(
      degraded.content.contains("@drawable/${degradation.placeholderDrawableName}"),
      "drawable -> outlined placeholder",
    )

    File(overlayRes, "layout").mkdirs()
    File(overlayRes, "layout/degraded.xml").writeText(degraded.content)

    // Rebuild with the overlay (holds the degraded layout + placeholder) and the edited styles.
    adapter.overlayDir = overlayRes
    adapter.invalidate(listOf(stylesFile.absolutePath))
    val s2 = adapter.session(roots, pkg)
    val layoutId = s2.resourceId("degraded", "layout")
    assertTrue(layoutId != 0, "the degraded overlay layout must resolve")

    val image = s2.render(layoutId)
    assertTrue(image.width > 0 && image.height > 0, "the render must complete despite the missing refs")
    val center = EngineTestSupport.centerArgb(image)
    assertTrue(
      EngineTestSupport.red(center) > 200 &&
        EngineTestSupport.blue(center) > 200 &&
        EngineTestSupport.green(center) < 80,
      "the degraded magenta background must be visible; was #%08X".format(center),
    )

    // Warnings via LogBridge: exactly four resource refs + one style-parent degradation.
    val refWarnings = log.warnings().filter { it.kind == LogBridge.Kind.unresolvedRef && it.tag == "resource" }
    assertEquals(4, refWarnings.size, "one unresolvedRef warning per missing reference")
    assertEquals(
      1,
      log.warnings().count { it.kind == LogBridge.Kind.unresolvedRef && it.tag == "styleParent" },
      "one warning for the degraded style parent",
    )
  }
}
