package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertArrayEquals
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
import java.io.File
import java.nio.file.Files
import javax.imageio.ImageIO

/**
 * G3 discriminating test (RES-01 / P1-G AC1 / AD-001 / Q6) — legacy Xamarin capital-cased resource
 * directories (`Resources/Layout/`) must render. Renders `dotnet-sample/Resources/Layout/Main.axml`
 * (capital `L`) and its lowercase twin (`Resources/layout/main.axml`, same bytes) and asserts both
 * produce a non-blank render that is pixel-identical. Fails against case-sensitive host resolution
 * (the capital dir is never indexed by layoutlib → "inflated to null"); passes once the host maps
 * resource type dirs case-insensitively.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LegacyCasingTest {

  private val pkg = "com.inflate.preview"
  private lateinit var resCap: File
  private lateinit var resLower: File
  private lateinit var adapter: EngineAdapter

  @BeforeAll
  fun setUp() {
    // Capital-cased tree exactly as shipped (Resources/Layout/Main.axml).
    val projCap = EngineTestSupport.copyFixtureTree("dotnet-sample")
    resCap = File(projCap, "Resources")

    // Lowercase twin: copy again and rename the layout dir to the modern lowercase convention.
    val projLower = EngineTestSupport.copyFixtureTree("dotnet-sample")
    resLower = File(projLower, "Resources")
    val capDir = File(resLower, "Layout")
    val lowerDir = File(resLower, "layout")
    require(capDir.renameTo(lowerDir)) { "could not rename ${capDir} -> $lowerDir" }

    adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(appTestDir = projCap, roots = listOf(resCap), packageName = pkg),
    )
  }

  private fun routing(): RenderRouting = RenderRouting(
    adapter,
    outputDir = Files.createTempDirectory("inflate-out").toFile(),
    overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile(),
  )

  private fun request(id: Int, layoutFile: File, res: File): RenderRequest = RenderRequest(
    id = id,
    docPath = layoutFile.absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(res.absolutePath),
    packageName = pkg,
    config = PreviewConfig(
      themeName = "android:Theme.Material.Light.NoActionBar",
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

  private fun pixels(pngPath: String): IntArray {
    val img = ImageIO.read(File(pngPath))
    return img.getRGB(0, 0, img.width, img.height, null, 0, img.width)
  }

  @Test
  fun `legacy capital-cased Resources dir renders equal to its lowercase twin`() {
    val cap = routing().render(request(1, File(resCap, "Layout/Main.axml"), resCap))
    assertEquals(RenderStatus.ok, cap.status, "capital Resources/Layout must render; error=${cap.error?.message}")
    assertNotNull(cap.pngPath)

    val lower = routing().render(request(2, File(resLower, "layout/Main.axml"), resLower))
    assertEquals(RenderStatus.ok, lower.status, "lowercase twin must render; error=${lower.error?.message}")
    assertNotNull(lower.pngPath)

    val capPixels = pixels(cap.pngPath!!)
    val lowerPixels = pixels(lower.pngPath!!)
    assertTrue(capPixels.toSet().size > 1, "the capital-cased render must not be blank")
    assertArrayEquals(lowerPixels, capPixels, "capital-cased render must be pixel-identical to the lowercase twin")
  }
}
