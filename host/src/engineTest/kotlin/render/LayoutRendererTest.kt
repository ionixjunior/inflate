package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
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
 * T35 — the layout render loop end to end (P1-A AC3/AC4/AC5/AC6, LAY-01/02/03/07, UX-04), driven
 * through [RenderRouting] over the framework gallery fixtures (§FR-1, androidx-free). One Bridge is
 * initialised per test-class JVM (engineTest forks per class); every test previews a distinct
 * document, so the app repository re-indexes each overlay.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LayoutRendererTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    // Copy the nested gallery into a writable temp dir (a slash in a temp-dir prefix is illegal, so
    // the shared copyFixtureTree helper can't take "galleries/framework" directly).
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/framework")
    require(src.isDirectory) { "framework gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-framework-gallery").toFile()
    src.copyRecursively(proj, overwrite = true)
    res = File(proj, "res")
    val overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile()
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

  private fun config(widthDp: Int = 200, heightDp: Int = 300, density: Density = Density.mdpi): PreviewConfig =
    PreviewConfig(
      themeName = "android:Theme.Material.NoActionBar",
      isProjectTheme = false,
      night = false,
      device = DevicePreset("test", "Test", widthDp, heightDp, "mdpi", SizeBucket.normal),
      orientation = Orientation.portrait,
      density = density,
      pixelScale = 1,
      drawable = null,
    )

  private fun request(docName: String, config: PreviewConfig = config()): RenderRequest =
    RenderRequest(
      id = ++idSeq,
      docPath = File(res, "layout/$docName.xml").absolutePath,
      docKind = DocKind.layout,
      inlineContent = null,
      roots = listOf(res.absolutePath),
      packageName = pkg,
      config = config,
      timeoutMs = 15000,
    )

  private fun distinctPixels(pngPath: String): Int {
    val img = ImageIO.read(File(pngPath))
    val seen = HashSet<Int>()
    var y = 0
    while (y < img.height) {
      var x = 0
      while (x < img.width) {
        seen.add(img.getRGB(x, y)); x += 4
      }
      y += 4
    }
    return seen.size
  }

  @Test
  fun `framework gallery renders with deep nesting`() {
    val r = routing.render(request("framework_gallery"))
    assertEquals(RenderStatus.ok, r.status, "gallery should render; error=${r.error?.message}")
    assertNotNull(r.pngPath)
    assertEquals(200, r.imageWidth, "device-resolution width")
    assertEquals(300, r.imageHeight, "device-resolution height")
    assertTrue(distinctPixels(r.pngPath!!) > 1, "the gallery render must not be blank")
    println("[T35] warm framework_gallery render: total=${r.timings.totalMs}ms prepare=${r.timings.prepareMs}ms render=${r.timings.renderMs}ms rebuilt=${r.sessionRebuilt}")
  }

  @Test
  fun `structural include ViewStub and fragment render (P1-A AC4)`() {
    val r = routing.render(request("structural_host"))
    assertEquals(RenderStatus.ok, r.status, "structural host should render; error=${r.error?.message}")
    assertTrue(distinctPixels(r.pngPath!!) > 1, "structural render must not be blank")
    // The plain <fragment> without tools:layout becomes a labeled placeholder (a notice).
    assertTrue(
      r.warnings.any { it.kind == WarningKind.notice && it.message.contains("Fragment") },
      "a fragment without tools:layout should emit a placeholder notice; warnings=${r.warnings}",
    )
  }

  @Test
  fun `merge root renders inside a default parent (P1-A AC4)`() {
    val r = routing.render(request("merge_root"))
    assertEquals(RenderStatus.ok, r.status, "merge root should render; error=${r.error?.message}")
    assertTrue(distinctPixels(r.pngPath!!) > 1, "merge render must not be blank")
  }

  @Test
  fun `custom view becomes a labeled placeholder with a warning (P1-A AC5)`() {
    val r = routing.render(request("custom_view"))
    assertEquals(RenderStatus.ok, r.status, "custom-view layout should still render; error=${r.error?.message}")
    val subs = r.warnings.filter { it.kind == WarningKind.substitutedClass }
    assertTrue(subs.any { it.message.contains("com.example.FakeView") }, "must warn on FakeView; warnings=${r.warnings}")
    assertTrue(subs.any { it.message.contains("com.example.OtherFakeView") }, "must warn on <view class> form")
  }

  @Test
  fun `adapter views render empty at their bounds (LAY-07)`() {
    val r = routing.render(request("adapterviews"))
    assertEquals(RenderStatus.ok, r.status, "adapter views should render empty; error=${r.error?.message}")
    assertEquals(200, r.imageWidth)
    assertEquals(300, r.imageHeight)
  }

  @Test
  fun `bad syntax yields a mapped line-column error (P1-A AC3)`() {
    val r = routing.render(request("bad_syntax"))
    assertEquals(RenderStatus.error, r.status, "a syntax error must fail the render")
    assertNotNull(r.error)
    val error = r.error!!
    assertEquals(File(res, "layout/bad_syntax.xml").absolutePath, error.file)
    assertNotNull(error.line, "a 1-based line must be reported")
    assertTrue(error.line!! >= 1, "line is 1-based")
    assertNotNull(error.column, "a 1-based column must be reported")
    assertNull(r.pngPath, "no image is produced for a syntax error")
  }

  @Test
  fun `data-binding layout emits a bindingReplaced notice (P1-A AC6)`() {
    val r = routing.render(request("data_binding"))
    assertEquals(RenderStatus.ok, r.status, "data-binding layout should render; error=${r.error?.message}")
    assertTrue(
      r.warnings.any { it.kind == WarningKind.bindingReplaced },
      "unwrapping @{...} must emit a bindingReplaced notice; warnings=${r.warnings}",
    )
  }

  @Test
  fun `include cycle renders a placeholder and names the path`() {
    val r = routing.render(request("cycle_a"))
    assertEquals(RenderStatus.ok, r.status, "a cycle aborts the include, not the render; error=${r.error?.message}")
    assertTrue(
      r.warnings.any { it.kind == WarningKind.notice && it.message.contains("cycle_a -> cycle_b -> cycle_a") },
      "the cycle warning must name the exact path; warnings=${r.warnings}",
    )
  }

  @Test
  fun `oversize canvas is clipped to the cap with a notice`() {
    val r = routing.render(request("oversize", config(widthDp = 5000, heightDp = 5000, density = Density.mdpi)))
    assertEquals(RenderStatus.ok, r.status, "oversize should render capped; error=${r.error?.message}")
    assertEquals(true, r.canvasCapped, "canvasCapped must be flagged")
    assertTrue(r.imageWidth!! <= LayoutRenderer.MAX_CANVAS_PX, "width clipped to the cap")
    assertTrue(r.imageHeight!! <= LayoutRenderer.MAX_CANVAS_PX, "height clipped to the cap")
    assertTrue(r.warnings.any { it.detail == "canvasCapped" }, "a canvasCapped notice must be present")
  }
}
