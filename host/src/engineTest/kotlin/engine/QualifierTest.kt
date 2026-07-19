package engine

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import rpc.Density
import rpc.DevicePreset
import rpc.Orientation
import rpc.PreviewConfig
import java.io.File

/**
 * T25 engineTest — the DeviceConfig produced by [ConfigMapper] drives Android qualifier matching on
 * the gradle-sample fixture (P1-E AC1/AC2/AC3 resolution half):
 *  - night off  -> values/colors.xml     -> @color/background blue
 *  - night on   -> values-night/colors.xml-> @color/background green
 *  - -sw600dp   -> layout-sw600dp/main.xml-> @color/tablet yellow (a different layout entirely)
 * selected iff the config says so.
 */
class QualifierTest {

  private val pkg = "com.inflate.gradlesample"

  private fun cfg(device: DevicePreset, night: Boolean) = PreviewConfig(
    themeName = "android:Theme.Material.Light.NoActionBar",
    isProjectTheme = false,
    night = night,
    device = device,
    orientation = Orientation.portrait,
    density = Density.mdpi, // px == dp keeps the rendered images small and fast
    pixelScale = 1,
  )

  @Test
  fun `night and sw600dp qualifiers select the right resources iff configured`() {
    val proj = EngineTestSupport.copyFixtureTree("gradle-sample")
    val roots = listOf(File(proj, "app/src/main/res"))
    val adapter = EngineAdapter(EngineTestSupport.runtimeRoot(), EngineTestSupport.resourcesRoot())
    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = proj, roots = roots, packageName = pkg))
    val session = adapter.session(roots, pkg)
    val layoutId = session.resourceId("main", "layout")
    assertTrue(layoutId != 0, "@layout/main should resolve")

    // Phone, day -> layout/main + values -> blue.
    val day = EngineTestSupport.centerArgb(
      session.render(layoutId, deviceConfig = ConfigMapper.map(cfg(DevicePresets.phone, night = false))),
    )
    assertTrue(
      EngineTestSupport.blue(day) > 200 && EngineTestSupport.red(day) < 60 && EngineTestSupport.green(day) < 60,
      "phone/day must select the blue values/ background; was #%08X".format(day),
    )

    // Phone, night -> values-night -> green.
    val night = EngineTestSupport.centerArgb(
      session.render(layoutId, deviceConfig = ConfigMapper.map(cfg(DevicePresets.phone, night = true))),
    )
    assertTrue(
      EngineTestSupport.green(night) > 200 && EngineTestSupport.red(night) < 60 && EngineTestSupport.blue(night) < 60,
      "phone/night must select the green values-night/ background; was #%08X".format(night),
    )

    // 7\" tablet (smallestWidth >= 600dp) -> layout-sw600dp/main -> @color/tablet yellow.
    val tablet = EngineTestSupport.centerArgb(
      session.render(layoutId, deviceConfig = ConfigMapper.map(cfg(DevicePresets.tablet7, night = false))),
    )
    assertTrue(
      EngineTestSupport.red(tablet) > 200 && EngineTestSupport.green(tablet) > 180 && EngineTestSupport.blue(tablet) < 80,
      "tablet must select the -sw600dp layout (yellow @color/tablet); was #%08X".format(tablet),
    )
  }
}
