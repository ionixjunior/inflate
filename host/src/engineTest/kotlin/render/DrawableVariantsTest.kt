package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import rpc.Density
import rpc.DocKind
import rpc.DrawableConfig
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
 * T46 — animated static-frame + level-based drawable rendering (DRW-02/04, P1-C AC3) over the
 * drawable gallery fixtures, driven through [RenderRouting].
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DrawableVariantsTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/drawables")
    val proj = Files.createTempDirectory("inflate-drawable-variants").toFile()
    src.copyRecursively(proj, overwrite = true)
    res = File(proj, "res")
    routing = RenderRouting(
      EngineAdapter(
        runtimeRoot = EngineTestSupport.runtimeRoot(),
        resourcesRoot = EngineTestSupport.resourcesRoot(),
      ).also {
        it.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = proj, roots = listOf(res), packageName = pkg))
      },
      outputDir = Files.createTempDirectory("inflate-out").toFile(),
      overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile(),
    )
  }

  private fun request(name: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(res, "drawable/$name.xml").absolutePath,
    docKind = DocKind.drawableXml,
    inlineContent = null,
    roots = listOf(res.absolutePath),
    packageName = pkg,
    config = PreviewConfig(
      themeName = "android:Theme.Material.NoActionBar",
      isProjectTheme = false,
      night = false,
      device = rpc.DevicePreset("test", "Test", 411, 891, "mdpi", SizeBucket.normal),
      orientation = Orientation.portrait,
      density = Density.mdpi,
      pixelScale = 1,
      drawable = DrawableConfig(),
    ),
    timeoutMs = 15000,
  )

  private fun img(path: String) = ImageIO.read(File(path))
  private fun alphaAt(i: java.awt.image.BufferedImage, x: Int, y: Int) = (i.getRGB(x, y) ushr 24) and 0xFF

  @Test
  fun `animated types render a static frame with the preview badge (P1-C AC3)`() {
    for (name in listOf("animated_vector", "animation_list", "animated_selector", "transition")) {
      val r = routing.render(request(name))
      assertEquals(RenderStatus.ok, r.status, "$name should render a static frame; error=${r.error?.message}")
      assertEquals(true, r.staticPreviewBadge, "$name must set the static-preview badge (DRW-04)")
    }
  }

  @Test
  fun `clip renders half at level 5000 with a levelDefault notice (P1-C AC3)`() {
    val r = routing.render(request("clip"))
    assertEquals(RenderStatus.ok, r.status, "clip should render; error=${r.error?.message}")
    assertTrue(
      r.warnings.any { it.kind == WarningKind.levelDefault },
      "a level-based drawable must emit a levelDefault notice; warnings=${r.warnings}",
    )
    val i = img(r.pngPath!!)
    // gravity=left, horizontal clip at level 5000 -> left half of the red child shown, right half clipped.
    assertEquals(0xFF, alphaAt(i, i.width / 4, i.height / 2), "left half must be painted at level 5000")
    assertEquals(0, alphaAt(i, i.width * 3 / 4, i.height / 2), "right half must be clipped away at level 5000")
  }

  @Test
  fun `level-list picks the item whose range contains 5000`() {
    val r = routing.render(request("level_list"))
    assertEquals(RenderStatus.ok, r.status, "level-list should render; error=${r.error?.message}")
    val i = img(r.pngPath!!)
    // Item [5000,10000] = clip_child (solid red); the [0,4999] item is the oval. Level 5000 -> red.
    assertEquals(0xFFFF0000.toInt(), i.getRGB(i.width / 2, i.height / 2), "level 5000 selects the red child")
  }

  @Test
  fun `rotate and scale render non-blank at level 5000`() {
    for (name in listOf("rotate", "scale")) {
      val r = routing.render(request(name))
      assertEquals(RenderStatus.ok, r.status, "$name should render; error=${r.error?.message}")
      val i = img(r.pngPath!!)
      var opaque = 0
      for (y in 0 until i.height step 4) for (x in 0 until i.width step 4) if (alphaAt(i, x, y) > 0) opaque++
      assertTrue(opaque > 0, "$name at level 5000 must render visible pixels")
    }
  }

  @Test
  fun `inset leaves a transparent border around its child`() {
    val r = routing.render(request("inset"))
    assertEquals(RenderStatus.ok, r.status, "inset should render; error=${r.error?.message}")
    val i = img(r.pngPath!!)
    assertEquals(0, alphaAt(i, 1, 1), "the inset border must be transparent")
    assertEquals(0xFF, alphaAt(i, i.width / 2, i.height / 2), "the inset child fills the centre")
  }
}
