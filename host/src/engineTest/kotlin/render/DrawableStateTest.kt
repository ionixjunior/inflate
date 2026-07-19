package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import rpc.Density
import rpc.DocKind
import rpc.DrawableConfig
import rpc.DrawableState
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
 * T45 — drawable state rendering + matched-item indicator (P1-D AC1–AC4, DRW-03/07) over the drawable
 * gallery selector/ripple fixtures, driven through [RenderRouting].
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DrawableStateTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/drawables")
    val proj = Files.createTempDirectory("inflate-drawable-state").toFile()
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

  private fun request(name: String, vararg states: DrawableState): RenderRequest = RenderRequest(
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
      drawable = DrawableConfig(states = states.toList()),
    ),
    timeoutMs = 15000,
  )

  private fun centerArgb(path: String): Int {
    val img = ImageIO.read(File(path))
    return img.getRGB(img.width / 2, img.height / 2)
  }

  @Test
  fun `selector renders each state distinctly with the correct matched item (P1-D AC1-2)`() {
    data class Case(val state: DrawableState?, val index: Int, val attrs: List<String>, val color: Int)
    val cases = listOf(
      Case(null, 3, emptyList(), 0xFF0000FF.toInt()),               // default -> blue item
      Case(DrawableState.pressed, 0, listOf("state_pressed"), 0xFFFF0000.toInt()),
      Case(DrawableState.checked, 1, listOf("state_checked"), 0xFF00FF00.toInt()),
      Case(DrawableState.disabled, 2, listOf("!state_enabled"), 0xFF888888.toInt()),
    )
    val colors = mutableSetOf<Int>()
    for (c in cases) {
      val r = if (c.state == null) routing.render(request("selector")) else routing.render(request("selector", c.state))
      assertEquals(RenderStatus.ok, r.status, "selector[${c.state}] should render; error=${r.error?.message}")
      assertEquals(true, r.stateSensitive, "a selector is state-sensitive")
      val matched = r.matchedStateItem
      assertNotNull(matched, "a selector must report a matched item (DRW-07)")
      assertEquals(c.index, matched!!.index, "matched <item> index for state ${c.state}")
      assertEquals(c.attrs, matched.stateAttrs, "matched item's declared state attrs for ${c.state}")
      assertEquals(c.color, centerArgb(r.pngPath!!), "rendered colour for state ${c.state}")
      colors += centerArgb(r.pngPath!!)
    }
    assertEquals(4, colors.size, "all four states must render pairwise-different images (P1-D independent test)")
  }

  @Test
  fun `bounded ripple in pressed state shows the settled overlay (P1-D AC4)`() {
    val default = routing.render(request("ripple_bounded"))
    val pressed = routing.render(request("ripple_bounded", DrawableState.pressed))
    assertEquals(RenderStatus.ok, default.status, "ripple default should render; error=${default.error?.message}")
    assertEquals(RenderStatus.ok, pressed.status, "ripple pressed should render; error=${pressed.error?.message}")
    assertEquals(true, pressed.stateSensitive, "a ripple is state-sensitive")
    // The settled pressed overlay (ripple colour composited over the content) changes the pixels.
    assertTrue(
      centerArgb(default.pngPath!!) != centerArgb(pressed.pngPath!!),
      "pressed ripple must show a settled overlay distinct from the resting state",
    )
  }

  @Test
  fun `unbounded ripple in pressed state fills with the settled overlay colour`() {
    val default = routing.render(request("ripple_unbounded"))
    val pressed = routing.render(request("ripple_unbounded", DrawableState.pressed))
    assertEquals(RenderStatus.ok, pressed.status, "unbounded ripple pressed should render; error=${pressed.error?.message}")
    // Unbounded resting state paints nothing (transparent); pressed shows the settled overlay colour.
    assertEquals(0, (centerArgb(default.pngPath!!) ushr 24) and 0xFF, "resting unbounded ripple is transparent")
    assertTrue((centerArgb(pressed.pngPath!!) ushr 24) and 0xFF > 0, "pressed unbounded ripple shows a visible overlay")
  }

  @Test
  fun `animated-selector is reported state-sensitive`() {
    val r = routing.render(request("animated_selector"))
    assertEquals(RenderStatus.ok, r.status, "animated-selector should render; error=${r.error?.message}")
    assertEquals(true, r.stateSensitive, "an animated-selector is state-sensitive (P1-D AC1)")
  }

  @Test
  fun `non-stateful drawable reports stateSensitive false with no matched item (P1-D AC3)`() {
    val r = routing.render(request("shape_rectangle"))
    assertEquals(RenderStatus.ok, r.status, "shape should render; error=${r.error?.message}")
    assertFalse(r.stateSensitive == true, "a plain shape is not state-sensitive -> picker hidden")
    assertNull(r.matchedStateItem, "a non-selector has no matched item")
  }
}
