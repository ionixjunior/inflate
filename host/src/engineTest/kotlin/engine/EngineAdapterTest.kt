package engine

import app.cash.paparazzi.DeviceConfig
import com.android.resources.Density
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * M0 checklist item 2 (hot-reload architecture gate). Proves the AD-009 split works end to end:
 * the Bridge is initialised once, the app-resource repository is rebuilt on invalidation while
 * the process stays up, and an edited `values/colors.xml` is reflected in the next render.
 *
 * A small 120x120 mdpi device keeps the render fast. The layout `screen.xml` fills the canvas with
 * `@color/testColor`, so the center pixel directly reports the resolved color value.
 */
class EngineAdapterTest {

  private fun newAdapter() = EngineAdapter(
    runtimeRoot = EngineTestSupport.runtimeRoot(),
    resourcesRoot = EngineTestSupport.resourcesRoot(),
    deviceConfig = DeviceConfig(
      screenWidth = 120,
      screenHeight = 120,
      xdpi = 160,
      ydpi = 160,
      density = Density.MEDIUM,
    ),
  )

  @Test
  fun `bridge inits once and app repository rebuild reflects an edited color`() {
    val res = EngineTestSupport.copyFixtureRes("reload")
    val roots = listOf(res)
    val adapter = newAdapter()

    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = res.parentFile, roots = roots))
    adapter.buildRepositories(roots)

    // Initial render: testColor is opaque blue.
    val layoutId = adapter.resourceId("screen", "layout", "com.inflate.preview")
    assertTrue(layoutId != 0, "expected screen.xml to resolve to a non-zero layout id")
    val before = EngineTestSupport.centerArgb(adapter.render(adapter.inflate(layoutId)))
    assertTrue(
      EngineTestSupport.blue(before) > 200 &&
        EngineTestSupport.red(before) < 60 &&
        EngineTestSupport.green(before) < 60,
      "initial center pixel should be blue but was #%08X".format(before),
    )

    // Edit colors.xml on disk: testColor -> opaque green.
    File(res, "values/colors.xml").writeText(
      """
      <?xml version="1.0" encoding="utf-8"?>
      <resources>
        <color name="testColor">#FF00FF00</color>
      </resources>
      """.trimIndent(),
    )

    // Invalidate + rebuild the app repository (Bridge stays up).
    adapter.invalidate()
    val rebuildMs = adapter.buildRepositories(roots)
    assertTrue(rebuildMs >= 0, "rebuild duration should be recorded")
    println("[M0-item2] app-repository rebuild took ${rebuildMs} ms")

    // Re-render: the new green value must be reflected.
    val after = EngineTestSupport.centerArgb(adapter.render(adapter.inflate(layoutId)))
    assertTrue(
      EngineTestSupport.green(after) > 200 &&
        EngineTestSupport.red(after) < 60 &&
        EngineTestSupport.blue(after) < 60,
      "post-edit center pixel should be green but was #%08X".format(after),
    )
  }
}
