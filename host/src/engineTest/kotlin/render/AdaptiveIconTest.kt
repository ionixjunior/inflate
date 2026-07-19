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
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

/**
 * T48 — adaptive-icon composition under a circular mask (DRW-06, P1-C AC6) over the gallery
 * adaptive_icon fixture, driven through [RenderRouting].
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdaptiveIconTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/drawables")
    val proj = Files.createTempDirectory("inflate-adaptive").toFile()
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

  private fun request(): RenderRequest = RenderRequest(
    id = 1,
    docPath = File(res, "drawable/adaptive_icon.xml").absolutePath,
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

  private fun alpha(c: Int) = (c ushr 24) and 0xFF

  @Test
  fun `adaptive icon is composed under a circular mask with correct layer order (P1-C AC6)`() {
    val r = routing.render(request())
    assertEquals(RenderStatus.ok, r.status, "adaptive-icon should render; error=${r.error?.message}")
    val img = ImageIO.read(File(r.pngPath!!))
    val w = img.width
    val cx = w / 2
    val cy = img.height / 2

    // Circular mask: the four corners lie outside the inscribed circle -> transparent.
    assertEquals(0, alpha(img.getRGB(1, 1)), "top-left corner is masked out")
    assertEquals(0, alpha(img.getRGB(w - 2, 1)), "top-right corner is masked out")
    assertEquals(0, alpha(img.getRGB(1, img.height - 2)), "bottom-left corner is masked out")
    assertEquals(0, alpha(img.getRGB(w - 2, img.height - 2)), "bottom-right corner is masked out")

    // Centre is inside the circle and inside the white foreground triangle -> opaque foreground.
    assertEquals(0xFF, alpha(img.getRGB(cx, cy)), "centre is opaque")
    assertEquals(0xFFFFFFFF.toInt(), img.getRGB(cx, cy), "foreground (white triangle) is drawn on top (layer order)")

    // A point inside the circle but above the triangle shows the background primary layer.
    val bg = img.getRGB(cx, img.height / 4)
    assertEquals(0xFF, alpha(bg), "background region inside the circle is opaque")
    assertEquals(0xFF3F51B5.toInt(), bg, "background layer (@color/gallery_primary) is visible behind the foreground")
  }
}
