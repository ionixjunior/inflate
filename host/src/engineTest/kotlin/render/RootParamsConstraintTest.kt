package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
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
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

/**
 * T91 (LAY-08 AC7) — the two shapes from the original user report, rendered end to end through the
 * full routing path with the bundled androidx/ConstraintLayout closure (constraintlayout 2.2.1,
 * `EngineArtifacts.kt`): (a) a `match_parent`x`wrap_content` card with margins/padding must wrap to
 * its content with the margins as insets; (b) a child `top_toBottomOf` a sibling AND
 * `bottom_toBottomOf="parent"` must sit directly below the sibling inside the wrapped bounds,
 * reproducing (and proving the fix for) the exact defect signature from the report.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RootParamsConstraintTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  // Theme.Material3.DayNight's resolved colorBackground (non-night), engine-verified empirically.
  private val THEME_BG = 0xFFFEF7FF.toInt()

  // The fixtures' own opaque root/sibling backgrounds — distinct colors so "painted by which view"
  // is unambiguous in pixel assertions.
  private val ROOT_BG = 0xFF224488.toInt()
  private val SIBLING_A_BG = 0xFFDD3311.toInt()
  private val CHILD_B_BG = 0xFF33AA55.toInt()

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/material")
    require(src.isDirectory) { "material gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-rootparams-constraint-gallery").toFile()
    src.copyRecursively(proj, overwrite = true)
    res = File(proj, "res")
    val overlayBaseDir = Files.createTempDirectory("inflate-rootparams-constraint-overlay").toFile()
    val outputDir = Files.createTempDirectory("inflate-rootparams-constraint-out").toFile()

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      libraryResDirs = EngineTestSupport.libResDirs(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(
        appTestDir = proj,
        roots = listOf(res),
        packageName = pkg,
        resourcePackageNames = EngineTestSupport.rPackages(),
      ),
    )
    routing = RenderRouting(adapter, outputDir = outputDir, overlayBaseDir = overlayBaseDir)
  }

  // mdpi keeps 1dp == 1px, so pixel coordinates below can be reasoned about in dp directly.
  private fun config(): PreviewConfig = PreviewConfig(
    themeName = "Theme.Material3.DayNight",
    isProjectTheme = true,
    night = false,
    device = DevicePreset("test", "Test", 200, 300, "mdpi", SizeBucket.normal),
    orientation = Orientation.portrait,
    density = Density.mdpi,
    pixelScale = 1,
    drawable = null,
  )

  private fun request(docName: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(res, "layout/$docName.xml").absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(res.absolutePath),
    packageName = pkg,
    config = config(),
    timeoutMs = 15000,
  )

  private fun argbAt(pngPath: String, x: Int, y: Int): Int {
    val img = ImageIO.read(File(pngPath))
    return img.getRGB(x, y)
  }

  @Test
  fun `shape a - wrap_content ConstraintLayout card wraps to content with margin insets (LAY-08 AC7)`() {
    val r = routing.render(request("rootparams_card"))
    assertEquals(RenderStatus.ok, r.status, "should render; error=${r.error?.message}")
    val png = r.pngPath!!
    assertEquals(200, r.imageWidth, "device-resolution width unchanged")
    assertEquals(300, r.imageHeight, "device-resolution height unchanged")

    assertEquals(THEME_BG, argbAt(png, 100, 5), "above the 16dp top margin must show the theme background")
    assertEquals(THEME_BG, argbAt(png, 5, 20), "inside the 16dp left margin must show the theme background")
    assertEquals(THEME_BG, argbAt(png, 190, 20), "inside the 16dp right margin must show the theme background")

    assertEquals(ROOT_BG, argbAt(png, 20, 20), "just past the left inset must be the card's own background")
    assertEquals(ROOT_BG, argbAt(png, 180, 20), "just past the right inset must be the card's own background")
    assertEquals(ROOT_BG, argbAt(png, 100, 50), "inside the wrapped card must be the card's own background")
    assertEquals(ROOT_BG, argbAt(png, 100, 80), "inside the wrapped card must be the card's own background")

    assertEquals(
      THEME_BG,
      argbAt(png, 100, 150),
      "the device vertical center is far below the wrapped card — must show the theme background, " +
        "not float centered as the pre-fix defect did",
    )
  }

  @Test
  fun `shape b - a bottom_toBottomOf child sits directly below its sibling, not centered (LAY-08 AC7)`() {
    val r = routing.render(request("rootparams_bottomconstraint"))
    assertEquals(RenderStatus.ok, r.status, "should render; error=${r.error?.message}")
    val png = r.pngPath!!

    assertEquals(SIBLING_A_BG, argbAt(png, 20, 20), "sibling_a's own 40dp x 40dp box must be painted")
    assertEquals(
      CHILD_B_BG,
      argbAt(png, 20, 40),
      "child B must start immediately below sibling_a's bottom edge (y=40), not centered in the device",
    )
    assertEquals(CHILD_B_BG, argbAt(png, 100, 55), "child B's 30dp band must span the full width")
    assertEquals(
      THEME_BG,
      argbAt(png, 100, 150),
      "the device vertical center must show the theme background — child B is NOT centered there " +
        "(the pre-fix defect's exact failure mode)",
    )
  }
}
