package engine

import com.android.resources.NightMode
import com.android.resources.ScreenOrientation
import com.android.resources.ScreenSize
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import rpc.Density
import rpc.DevicePreset
import rpc.Orientation
import rpc.PreviewConfig
import rpc.SizeBucket
import com.android.resources.Density as ResDensity

/**
 * T25 unit coverage — every [PreviewConfig] field maps onto the correct [app.cash.paparazzi.DeviceConfig]
 * value and, through `folderConfiguration`, the correct Android qualifier (P1-E AC1/AC2/AC3).
 */
class ConfigMapperTest {

  private fun config(
    device: DevicePreset = DevicePresets.phone,
    night: Boolean = false,
    orientation: Orientation = Orientation.portrait,
    density: Density = Density.xhdpi,
    pixelScale: Int = 1,
  ) = PreviewConfig(
    themeName = "android:Theme.Material.Light.NoActionBar",
    isProjectTheme = false,
    night = night,
    device = device,
    orientation = orientation,
    density = density,
    pixelScale = pixelScale,
  )

  @Test
  fun `exposes the five built-in device presets with correct dp dimensions and buckets`() {
    assertEquals(listOf("smallPhone", "phone", "largePhone", "tablet7", "tablet10"), DevicePresets.all.map { it.id })
    assertEquals(360 to 640, DevicePresets.smallPhone.widthDp to DevicePresets.smallPhone.heightDp)
    assertEquals(411 to 891, DevicePresets.phone.widthDp to DevicePresets.phone.heightDp)
    assertEquals(480 to 1040, DevicePresets.largePhone.widthDp to DevicePresets.largePhone.heightDp)
    assertEquals(600 to 960, DevicePresets.tablet7.widthDp to DevicePresets.tablet7.heightDp)
    assertEquals(800 to 1280, DevicePresets.tablet10.widthDp to DevicePresets.tablet10.heightDp)
    assertEquals(SizeBucket.large, DevicePresets.tablet7.sizeBucket)
    assertEquals(SizeBucket.xlarge, DevicePresets.tablet10.sizeBucket)
    assertEquals(DevicePresets.phone, DevicePresets.byId("phone"))
    assertEquals(null, DevicePresets.byId("nope"))
  }

  @Test
  fun `maps night on and off to the night-mode qualifier`() {
    assertEquals(NightMode.NIGHT, ConfigMapper.map(config(night = true)).nightMode)
    assertEquals(NightMode.NOTNIGHT, ConfigMapper.map(config(night = false)).nightMode)
    assertEquals(
      NightMode.NIGHT,
      ConfigMapper.map(config(night = true)).folderConfiguration.nightModeQualifier.value,
    )
  }

  @Test
  fun `maps every density bucket to the matching Density enum and dpi`() {
    val expected = mapOf(
      Density.mdpi to (ResDensity.MEDIUM to 160),
      Density.hdpi to (ResDensity.HIGH to 240),
      Density.xhdpi to (ResDensity.XHIGH to 320),
      Density.xxhdpi to (ResDensity.XXHIGH to 480),
      Density.xxxhdpi to (ResDensity.XXXHIGH to 640),
    )
    for ((d, exp) in expected) {
      val (resDensity, dpi) = exp
      assertEquals(resDensity, ConfigMapper.map(config(density = d)).density, "density $d")
      assertEquals(dpi, ConfigMapper.densityDpi(d), "dpi for $d")
      assertEquals(resDensity, ConfigMapper.map(config(density = d)).folderConfiguration.densityQualifier.value)
    }
  }

  @Test
  fun `maps both orientations`() {
    assertEquals(ScreenOrientation.PORTRAIT, ConfigMapper.map(config(orientation = Orientation.portrait)).orientation)
    assertEquals(ScreenOrientation.LANDSCAPE, ConfigMapper.map(config(orientation = Orientation.landscape)).orientation)
  }

  @Test
  fun `maps the size bucket of each preset`() {
    assertEquals(ScreenSize.NORMAL, ConfigMapper.map(config(device = DevicePresets.phone)).size)
    assertEquals(ScreenSize.LARGE, ConfigMapper.map(config(device = DevicePresets.tablet7)).size)
    assertEquals(ScreenSize.XLARGE, ConfigMapper.map(config(device = DevicePresets.tablet10)).size)
  }

  @Test
  fun `converts device dp to pixels at the selected density`() {
    // phone 411dp wide at xhdpi (320): 411 * 320/160 = 822 px.
    val dc = ConfigMapper.map(config(device = DevicePresets.phone, density = Density.xhdpi))
    assertEquals(822, dc.screenWidth)
    assertEquals(320, dc.xdpi)
  }

  @Test
  fun `pixelScale multiplies pixels and dpi but leaves the density bucket unchanged`() {
    val base = ConfigMapper.map(config(device = DevicePresets.phone, density = Density.xhdpi, pixelScale = 1))
    val scaled = ConfigMapper.map(config(device = DevicePresets.phone, density = Density.xhdpi, pixelScale = 2))
    assertEquals(base.screenWidth * 2, scaled.screenWidth)
    assertEquals(base.xdpi * 2, scaled.xdpi)
    // Same density bucket => same density-qualified resource selection at 2x resolution.
    assertEquals(base.density, scaled.density)
  }

  @Test
  fun `smallest-width qualifier is density-invariant and equals the preset width (drives -sw600dp)`() {
    // tablet7 is 600dp wide -> smallestScreenWidth 600 regardless of density (dp round-trips px).
    for (density in Density.entries) {
      val sw = ConfigMapper.map(config(device = DevicePresets.tablet7, density = density))
        .folderConfiguration.smallestScreenWidthQualifier.value
      assertEquals(600, sw, "sw for density $density")
    }
    // phone (411dp) stays below the 600 bucket.
    val phoneSw = ConfigMapper.map(config(device = DevicePresets.phone))
      .folderConfiguration.smallestScreenWidthQualifier.value
    assertEquals(411, phoneSw)
  }
}
