package render

import engine.EngineTestSupport
import out.PngWriter
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
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
import rpc.RenderStatus
import rpc.SizeBucket
import rpc.WarningKind
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

/**
 * T47 — source-format nine-patch rendering (DRW-05, P1-C AC4 + malformed-marker edge case). Uses the
 * gallery `.9.png` fixtures (valid + malformed); no layoutlib session needed for this path.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class NinePatchTest {

  private lateinit var ninePatchDir: File
  private lateinit var renderer: NinePatchRenderer
  private var idSeq = 0

  private val blue = 0xFF0000FF.toInt()

  @BeforeAll
  fun setUp() {
    ninePatchDir = File(EngineTestSupport.fixturesRoot(), "galleries/drawables/res/drawable-nodpi")
    require(ninePatchDir.isDirectory) { "nine-patch fixtures missing at $ninePatchDir" }
    renderer = NinePatchRenderer(PngWriter(Files.createTempDirectory("inflate-out").toFile()))
  }

  private fun request(name: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(ninePatchDir, name).absolutePath,
    docKind = DocKind.ninePatch,
    inlineContent = null,
    roots = listOf(ninePatchDir.absolutePath),
    packageName = "com.inflate.preview",
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

  @Test
  fun `valid nine-patch keeps corners unscaled across two sizes (P1-C AC4)`() {
    val r = renderer.render(request("nine_patch.9.png"))
    assertEquals(RenderStatus.ok, r.status, "nine-patch should render; error=${r.error?.message}")
    val img = ImageIO.read(File(r.pngPath!!))
    // Composite = 40x40 render at x=0 then 80x80 render at x=48 (gap 8).
    val secondX = 40 + 8
    // Both renders' top-left corner is the same fixed 3px blue block — unscaled at either size.
    for (originX in listOf(0, secondX)) {
      assertEquals(blue, img.getRGB(originX + 0, 0), "corner pixel (origin $originX)")
      assertEquals(blue, img.getRGB(originX + 2, 2), "corner is 3px (origin $originX)")
      assertTrue(img.getRGB(originX + 3, 0) != blue, "corner must not scale past 3px (origin $originX)")
    }
  }

  @Test
  fun `valid nine-patch decodes its padding markers`() {
    val raw = ImageIO.read(File(ninePatchDir, "nine_patch.9.png"))
    val decoded = renderer.decode(raw, listOf(40 to 40, 80 to 80))
    assertNull(decoded.markerError, "valid markers must decode cleanly")
    assertNotNull(decoded.padding, "padding markers must be read")
    // Padding box = content cols/rows 3..5 -> left=top=right=bottom=3 (fixture markers).
    assertArrayEquals(intArrayOf(3, 3, 3, 3), decoded.padding, "content padding honored (P1-C AC4)")
  }

  @Test
  fun `nine-patch preview emits a padding notice`() {
    val r = renderer.render(request("nine_patch.9.png"))
    assertTrue(
      r.warnings.any { it.kind == WarningKind.notice && it.message.contains("padding [l=3,t=3,r=3,b=3]") },
      "the preview must report the honored padding; warnings=${r.warnings}",
    )
  }

  @Test
  fun `malformed nine-patch falls back to a plain image with a warning (edge case)`() {
    val r = renderer.render(request("nine_patch_malformed.9.png"))
    assertEquals(RenderStatus.ok, r.status, "malformed markers must not fail the render")
    assertTrue(
      r.warnings.any { it.kind == WarningKind.notice && it.message.contains("Malformed nine-patch markers") },
      "a marker-error warning must be present; warnings=${r.warnings}",
    )
    val img = ImageIO.read(File(r.pngPath!!))
    // Plain fallback strips the 1px marker border: an 11x11 raw -> 9x9 plain image.
    assertEquals(9, img.width, "plain fallback strips the marker border")
    assertEquals(9, img.height)
  }
}
