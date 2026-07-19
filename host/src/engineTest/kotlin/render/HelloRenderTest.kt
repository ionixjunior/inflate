package render

import app.cash.paparazzi.DeviceConfig
import com.android.resources.Density
import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import out.PngWriter
import java.io.File
import javax.imageio.ImageIO

/**
 * M0 checklist item 3 (host half / end-to-end render gate): a hardcoded LinearLayout fixture is
 * inflated by generated resource name and snapshotted to a PNG on disk. Asserts the PNG exists at
 * the expected device-pixel dimensions, has non-blank content, and preserves an alpha channel.
 */
class HelloRenderTest {

  @Test
  fun `hello layout renders to a png with correct size, content and alpha`(@TempDir out: File) {
    val res = EngineTestSupport.copyFixtureRes("hello")
    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      deviceConfig = DeviceConfig(
        screenWidth = 200,
        screenHeight = 200,
        xdpi = 160,
        ydpi = 160,
        density = Density.MEDIUM,
      ),
    )
    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = res.parentFile, roots = listOf(res)))
    adapter.buildRepositories(listOf(res))

    val writer = PngWriter(out)
    val result = HelloRender(adapter, writer).render(docKey = "hello.xml", renderId = 1, layoutName = "hello")

    // PNG exists on disk.
    assertTrue(result.png.exists() && result.png.length() > 0, "png should be written")

    // Expected device-pixel dimensions (useDeviceResolution=true, no decor).
    assertEquals(200, result.width, "render width should equal device width")
    assertEquals(200, result.height, "render height should equal device height")

    // Read the PNG back and assert content + alpha survived the disk round-trip.
    val png = ImageIO.read(result.png)
    assertEquals(200, png.width)
    assertEquals(200, png.height)
    assertTrue(png.colorModel.hasAlpha(), "png should preserve an alpha channel")

    // Center pixel is the LinearLayout background (#FF3366CC), opaque.
    val center = png.getRGB(100, 100)
    assertEquals(255, EngineTestSupport.alpha(center), "background should be opaque")
    assertTrue(EngineTestSupport.red(center) in 41..61, "R ~51 but was ${EngineTestSupport.red(center)}")
    assertTrue(EngineTestSupport.green(center) in 92..112, "G ~102 but was ${EngineTestSupport.green(center)}")
    assertTrue(EngineTestSupport.blue(center) in 194..214, "B ~204 but was ${EngineTestSupport.blue(center)}")

    // Non-blank: the TextView text and the bottom View add more than one distinct color.
    val distinct = HashSet<Int>()
    for (y in 0 until png.height step 4) for (x in 0 until png.width step 4) distinct.add(png.getRGB(x, y))
    assertTrue(distinct.size > 1, "image should not be a single flat color")
  }
}
