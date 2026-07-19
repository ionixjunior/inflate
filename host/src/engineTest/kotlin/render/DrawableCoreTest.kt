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
import rpc.DocKind
import rpc.DrawableConfig
import rpc.DrawableSize
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
 * T44 — the drawable render core end to end (DRW-01/02/06/08, P1-C AC1/AC2/AC5) over the drawable
 * gallery fixtures (§FR-3), driven through [RenderRouting]. One Bridge per test-class JVM.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DrawableCoreTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/drawables")
    require(src.isDirectory) { "drawable gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-drawable-gallery").toFile()
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

  /** mdpi (density 1.0) so dp == px and canvas dimensions are exact. */
  private fun config(size: DrawableSize? = null): PreviewConfig = PreviewConfig(
    themeName = "android:Theme.Material.NoActionBar",
    isProjectTheme = false,
    night = false,
    device = DevicePresetTest,
    orientation = Orientation.portrait,
    density = Density.mdpi,
    pixelScale = 1,
    drawable = DrawableConfig(states = emptyList(), sizeDp = size),
  )

  private fun request(dir: String, name: String, kind: DocKind, size: DrawableSize? = null): RenderRequest =
    RenderRequest(
      id = ++idSeq,
      docPath = File(res, "$dir/$name").absolutePath,
      docKind = kind,
      inlineContent = null,
      roots = listOf(res.absolutePath),
      packageName = pkg,
      config = config(size),
      timeoutMs = 15000,
    )

  private fun image(path: String) = ImageIO.read(File(path))
  private fun argb(img: java.awt.image.BufferedImage, x: Int, y: Int) = img.getRGB(x, y)
  private fun alpha(c: Int) = (c ushr 24) and 0xFF
  private fun distinctColors(img: java.awt.image.BufferedImage): Int {
    val seen = HashSet<Int>()
    var y = 0
    while (y < img.height) { var x = 0; while (x < img.width) { seen.add(img.getRGB(x, y)); x += 2 }; y += 2 }
    return seen.size
  }

  @Test
  fun `vector renders at intrinsic size with sweep gradient and trimPath`() {
    val r = routing.render(request("drawable", "vector_gradient.xml", DocKind.drawableXml))
    assertEquals(RenderStatus.ok, r.status, "vector should render; error=${r.error?.message}")
    // 48dp intrinsic at mdpi -> 48x48 device px (P1-C AC2 intrinsic sizing).
    assertEquals(48, r.imageWidth)
    assertEquals(48, r.imageHeight)
    val img = image(r.pngPath!!)
    // The sweep gradient (red->green->blue around the centre) yields many distinct colours.
    assertTrue(distinctColors(img) >= 8, "sweep gradient must produce a colour spread; got ${distinctColors(img)}")
  }

  @Test
  fun `shape with declared size renders at that intrinsic size`() {
    val r = routing.render(request("drawable", "shape_oval.xml", DocKind.drawableXml))
    assertEquals(RenderStatus.ok, r.status, "shape_oval should render; error=${r.error?.message}")
    assertEquals(72, r.imageWidth, "oval declares a 72dp size -> intrinsic 72px at mdpi")
    assertEquals(72, r.imageHeight)
    val img = image(r.pngPath!!)
    // Oval fill: centre opaque, corners transparent -> alpha preserved (PNG keeps alpha, DRW core).
    assertTrue(alpha(argb(img, img.width / 2, img.height / 2)) == 0xFF, "oval centre must be opaque")
    assertEquals(0, alpha(argb(img, 0, 0)), "oval corner must be transparent (alpha preserved)")
  }

  @Test
  fun `shape without a size uses the default 128dp canvas`() {
    val r = routing.render(request("drawable", "shape_rectangle.xml", DocKind.drawableXml))
    assertEquals(RenderStatus.ok, r.status, "shape_rectangle should render; error=${r.error?.message}")
    assertEquals(128, r.imageWidth, "non-intrinsic shape -> 128dp default canvas (P1-C AC2)")
    assertEquals(128, r.imageHeight)
    assertTrue(distinctColors(image(r.pngPath!!)) >= 2, "rectangle gradient must not be blank")
  }

  @Test
  fun `sizeDp override forces an exact canvas`() {
    val r = routing.render(request("drawable", "shape_oval.xml", DocKind.drawableXml, DrawableSize(200, 100)))
    assertEquals(RenderStatus.ok, r.status, "override render should succeed; error=${r.error?.message}")
    assertEquals(200, r.imageWidth, "sizeDp override sets width (DRW-08)")
    assertEquals(100, r.imageHeight, "sizeDp override sets height (DRW-08)")
  }

  @Test
  fun `layer-list composites its stacked items`() {
    val r = routing.render(request("drawable", "layer_list.xml", DocKind.drawableXml))
    assertEquals(RenderStatus.ok, r.status, "layer-list should render; error=${r.error?.message}")
    assertEquals(96, r.imageWidth, "layer-list intrinsic from its 96dp base layer")
    val img = image(r.pngPath!!)
    // Base rect (primary) at the corner; the centred 24dp accent square on top -> distinct regions.
    val corner = argb(img, 2, 2)
    val center = argb(img, img.width / 2, img.height / 2)
    assertEquals(0xFF3F51B5.toInt(), corner, "corner shows the base primary layer")
    assertEquals(0xFFE91E63.toInt(), center, "centre shows the top accent layer (compositing)")
    assertTrue(corner != center, "layered items must composite to different regions")
  }

  @Test
  fun `bitmap tiles across an overridden canvas`() {
    val r = routing.render(request("drawable", "bitmap_tile.xml", DocKind.drawableXml, DrawableSize(64, 64)))
    assertEquals(RenderStatus.ok, r.status, "bitmap should render; error=${r.error?.message}")
    val img = image(r.pngPath!!)
    // The 8px red/green checker tiled across 64px shows both source colours (tileMode repeat).
    assertTrue(distinctColors(img) >= 2, "tiled bitmap must show its repeating source colours")
  }

  @Test
  fun `color drawable resolves an at-color reference and fills the swatch (AC5)`() {
    val r = routing.render(request("drawable", "color_drawable.xml", DocKind.drawableXml))
    assertEquals(RenderStatus.ok, r.status, "color drawable should render; error=${r.error?.message}")
    val img = image(r.pngPath!!)
    // @color/gallery_accent = #FFE91E63 — resolving the reference proves AC5 (same resolver chain).
    assertEquals(0xFFE91E63.toInt(), argb(img, img.width / 2, img.height / 2), "swatch must be the referenced colour")
  }

  @Test
  fun `color resource renders as a swatch of its default color (DRW-06)`() {
    val r = routing.render(request("color", "state_color.xml", DocKind.color))
    assertEquals(RenderStatus.ok, r.status, "color resource should render; error=${r.error?.message}")
    assertNotNull(r.pngPath)
    val img = image(r.pngPath!!)
    // ColorStateList default (the unqualified item) = @color/gallery_primary #FF3F51B5.
    assertEquals(0xFF3F51B5.toInt(), argb(img, img.width / 2, img.height / 2), "swatch = ColorStateList default color")
  }

  companion object {
    private val DevicePresetTest = rpc.DevicePreset("test", "Test", 411, 891, "mdpi", SizeBucket.normal)
  }
}
