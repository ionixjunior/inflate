package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import rpc.Density
import rpc.DevicePreset
import rpc.DocKind
import rpc.Orientation
import rpc.PreviewConfig
import rpc.RenderRequest
import rpc.RenderRouting
import rpc.RenderStatus
import rpc.SizeBucket
import rpc.WarningKind
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

/**
 * G2 discriminating test (RES-04 / UX-05 / P1-G AC4) — graceful degradation of unresolved resource
 * references must run on the LIVE render path (RenderRouting → LayoutRenderer), not only in the
 * isolated [engine.DegradationTest]. Drives the `unresolved-refs` fixture (four missing kinds) through
 * the real `render` RPC and asserts the render COMPLETES with per-kind substitutions and exactly the
 * four `unresolvedRef` warnings. Fails against the unwired code (inflation errors on `@color/missing`);
 * passes once Degradation is wired into LayoutRenderer.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DegradationLiveTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var overlayBaseDir: File
  private lateinit var routing: RenderRouting

  @BeforeAll
  fun setUp() {
    val proj = EngineTestSupport.copyFixtureTree("unresolved-refs")
    res = File(proj, "res")
    overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile()
    val outputDir = Files.createTempDirectory("inflate-out").toFile()

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(appTestDir = proj, roots = listOf(res), packageName = pkg),
    )
    routing = RenderRouting(adapter, outputDir = outputDir, overlayBaseDir = overlayBaseDir)
  }

  private fun request(): RenderRequest = RenderRequest(
    id = 1,
    docPath = File(res, "layout/broken.xml").absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(res.absolutePath),
    packageName = pkg,
    config = PreviewConfig(
      themeName = "android:Theme.Material.NoActionBar",
      isProjectTheme = false,
      night = false,
      device = DevicePreset("test", "Test", 200, 300, "mdpi", SizeBucket.normal),
      orientation = Orientation.portrait,
      density = Density.mdpi,
      pixelScale = 1,
      drawable = null,
    ),
    timeoutMs = 15000,
  )

  @Test
  fun `unresolved refs degrade per-kind on the live render path and the render completes`() {
    val r = routing.render(request())

    // P1-G AC4: "the render SHALL still complete" despite unresolvable references.
    assertEquals(RenderStatus.ok, r.status, "render must complete despite missing refs; error=${r.error?.message}")
    assertNotNull(r.pngPath)

    // Exactly the four missing references, each warned as unresolvedRef with its correct kind.
    val unresolved = r.warnings.filter { it.kind == WarningKind.unresolvedRef }
    assertEquals(4, unresolved.size, "one unresolvedRef warning per missing reference; warnings=${r.warnings}")
    val kinds = unresolved.mapNotNull { w ->
      Regex("""@(color|dimen|string|drawable)/""").find(w.message)?.groupValues?.get(1)
    }.toSet()
    assertEquals(
      setOf("color", "dimen", "string", "drawable"),
      kinds,
      "each of the four missing kinds must be reported; warnings=${r.warnings}",
    )

    // The degraded overlay carries every per-kind substitution the spec requires.
    val overlay = File(overlayBaseDir, "res/layout").listFiles { f -> f.name.startsWith("inflate_preview__") }
      ?.firstOrNull()
    assertNotNull(overlay, "the preprocessed overlay must exist")
    val overlayText = overlay!!.readText()
    assertTrue(overlayText.contains("\"#FF00FF\""), "color -> magenta; overlay=$overlayText")
    assertTrue(overlayText.contains("\"0dp\""), "dimen -> 0dp; overlay=$overlayText")
    assertTrue(overlayText.contains("android:text=\"missing\""), "string -> reference name; overlay=$overlayText")
    assertTrue(overlayText.contains("@drawable/inflate_degraded_placeholder"), "drawable -> outlined placeholder")

    // The magenta color substitution is visible in the rendered output (FrameLayout background).
    val img = ImageIO.read(File(r.pngPath!!))
    val center = img.getRGB(img.width / 2, img.height / 2)
    val red = (center shr 16) and 0xFF
    val green = (center shr 8) and 0xFF
    val blue = center and 0xFF
    assertTrue(
      red > 200 && blue > 200 && green < 80,
      "the degraded magenta background must be visible; center was #%08X".format(center),
    )
  }
}
