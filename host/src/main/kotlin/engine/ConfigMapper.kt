package engine

import app.cash.paparazzi.DeviceConfig
import com.android.resources.NightMode
import com.android.resources.ScreenOrientation
import com.android.resources.ScreenSize
import rpc.Density
import rpc.DevicePreset
import rpc.Orientation
import rpc.PreviewConfig
import rpc.SizeBucket
import com.android.resources.Density as ResDensity

/**
 * T25 — maps the protocol [PreviewConfig] onto Paparazzi's [DeviceConfig] (RES-03, CFG-01/02/03),
 * whose `folderConfiguration` drives Studio's qualifier matching. Every knob the toolbar exposes
 * (night, density, orientation, device preset, pixelScale) becomes a DeviceConfig field:
 *
 *  - night        -> [DeviceConfig.nightMode] (selects `-night` resources + DayNight theme variants)
 *  - density      -> [DeviceConfig.density] bucket (selects `-mdpi`.. `-xxxhdpi` resources)
 *  - orientation  -> [DeviceConfig.orientation] (DeviceConfig swaps width/height internally)
 *  - device       -> screen px (dp -> px at the selected density) + [DeviceConfig.size] bucket
 *  - pixelScale   -> multiplies output px AND dpi by 1|2, leaving the density BUCKET (and therefore
 *                    every qualifier selection) unchanged, so a 2x crispness re-render (UX-03)
 *                    produces the same resource selection at double resolution.
 */
object ConfigMapper {

  fun toNightMode(night: Boolean): NightMode = if (night) NightMode.NIGHT else NightMode.NOTNIGHT

  fun toResDensity(density: Density): ResDensity = when (density) {
    Density.mdpi -> ResDensity.MEDIUM
    Density.hdpi -> ResDensity.HIGH
    Density.xhdpi -> ResDensity.XHIGH
    Density.xxhdpi -> ResDensity.XXHIGH
    Density.xxxhdpi -> ResDensity.XXXHIGH
  }

  /** Numeric dpi for the density bucket (mdpi=160, hdpi=240, xhdpi=320, xxhdpi=480, xxxhdpi=640). */
  fun densityDpi(density: Density): Int = toResDensity(density).dpiValue

  fun toScreenOrientation(orientation: Orientation): ScreenOrientation = when (orientation) {
    Orientation.portrait -> ScreenOrientation.PORTRAIT
    Orientation.landscape -> ScreenOrientation.LANDSCAPE
  }

  fun toScreenSize(bucket: SizeBucket): ScreenSize = when (bucket) {
    SizeBucket.normal -> ScreenSize.NORMAL
    SizeBucket.large -> ScreenSize.LARGE
    SizeBucket.xlarge -> ScreenSize.XLARGE
  }

  private fun dpToPx(dp: Int, dpi: Int): Int = Math.round(dp.toDouble() * dpi / 160.0).toInt()

  fun map(config: PreviewConfig): DeviceConfig {
    val dpi = densityDpi(config.density)
    val scale = config.pixelScale.coerceAtLeast(1)
    // Preset dims are authored portrait (widthDp <= heightDp); DeviceConfig derives current
    // width/height from `orientation`, so we always pass width from widthDp and height from heightDp.
    return DeviceConfig(
      screenWidth = dpToPx(config.device.widthDp, dpi) * scale,
      screenHeight = dpToPx(config.device.heightDp, dpi) * scale,
      xdpi = dpi * scale,
      ydpi = dpi * scale,
      orientation = toScreenOrientation(config.orientation),
      nightMode = toNightMode(config.night),
      density = toResDensity(config.density),
      size = toScreenSize(config.device.sizeBucket),
    )
  }
}

/** The five built-in device presets (P1-E AC2; design §Data Models). Dimensions are in dp, portrait. */
object DevicePresets {
  val smallPhone = DevicePreset("smallPhone", "Small Phone", 360, 640, "hdpi", SizeBucket.normal)
  val phone = DevicePreset("phone", "Phone", 411, 891, "xxhdpi", SizeBucket.normal)
  val largePhone = DevicePreset("largePhone", "Large Phone", 480, 1040, "xxhdpi", SizeBucket.normal)
  val tablet7 = DevicePreset("tablet7", "7\" Tablet", 600, 960, "hdpi", SizeBucket.large)
  val tablet10 = DevicePreset("tablet10", "10\" Tablet", 800, 1280, "xhdpi", SizeBucket.xlarge)

  val all: List<DevicePreset> = listOf(smallPhone, phone, largePhone, tablet7, tablet10)

  fun byId(id: String): DevicePreset? = all.firstOrNull { it.id == id }
}
