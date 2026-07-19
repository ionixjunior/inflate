package engine

import app.cash.paparazzi.DeviceConfig
import com.android.resources.Density
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * T24 — cached project sessions with overlay and invalidation (RES-02, HOST-02, UX-02), rendered
 * against the gradle-sample fixture. Proves:
 *  - every reference kind (@color/@string/@dimen/@drawable/@style) resolves across the module roots;
 *  - priority order (containing module wins over the library module) — app's blue @color/background
 *    beats the lib module's red;
 *  - a values edit + invalidate() produces the new value on the next render (rebuild ms logged);
 *  - a repeat session() with an unchanged key and no invalidation reuses the app repo (no rebuild).
 */
class SessionTest {

  private val pkg = "com.inflate.gradlesample"

  private fun newAdapter() = EngineAdapter(
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

  @Test
  fun `sessions resolve every reference kind across roots in priority order and hot-reload`() {
    val proj = EngineTestSupport.copyFixtureTree("gradle-sample")
    val appRes = File(proj, "app/src/main/res")
    val libRes = File(proj, "lib/src/main/res")
    val roots = listOf(appRes, libRes) // containing module first = highest priority (RES-02)

    val adapter = newAdapter()
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(appTestDir = proj, roots = roots, packageName = pkg),
    )

    val s1 = adapter.session(roots, pkg)
    assertTrue(s1.rebuilt, "the first session must build the app repository")

    // Every reference kind used by the shared layout resolves against the merged roots.
    val kinds = listOf(
      "background" to "color",
      "hello" to "string",
      "pad" to "dimen",
      "box" to "drawable",
      "Body" to "style",
      "AppTheme" to "style",
    )
    for ((name, type) in kinds) {
      assertTrue(s1.resourceId(name, type) != 0, "@$type/$name should resolve to a non-zero id")
    }
    // A resource that exists ONLY in the library module resolves too (roots are merged).
    assertTrue(s1.resourceId("libOnly", "color") != 0, "@color/libOnly (lib module) should resolve")

    val layoutId = s1.resourceId("main", "layout")
    assertTrue(layoutId != 0, "@layout/main should resolve")

    // Priority: app @color/background (blue) overrides the library's @color/background (red).
    val argb1 = EngineTestSupport.centerArgb(s1.render(layoutId))
    assertTrue(
      EngineTestSupport.blue(argb1) > 200 &&
        EngineTestSupport.red(argb1) < 60 &&
        EngineTestSupport.green(argb1) < 60,
      "app background (blue) must win over the library (red); was #%08X".format(argb1),
    )

    // Same key, no invalidation, only the previewed file "changed" => reuse (no rebuild).
    val s2 = adapter.session(roots, pkg)
    assertFalse(s2.rebuilt, "an unchanged key with no invalidation must reuse the cached app repo")
    assertFalse(adapter.lastSessionRebuilt)

    // invalidate() with a path OUTSIDE the roots must not schedule a rebuild.
    assertFalse(
      adapter.invalidate(listOf("/some/other/place/values.xml")),
      "a path outside every root must not schedule a rebuild",
    )
    assertFalse(adapter.session(roots, pkg).rebuilt, "no rebuild after an unrelated invalidate")

    // Edit a values file on disk and invalidate with its path -> next session rebuilds.
    File(appRes, "values/colors.xml").writeText(
      """
      <?xml version="1.0" encoding="utf-8"?>
      <resources>
        <color name="background">#FFFF00FF</color>
        <color name="tablet">#FFFFEE00</color>
        <color name="brand">#FFEE0000</color>
      </resources>
      """.trimIndent(),
    )
    val affected = adapter.invalidate(listOf(File(appRes, "values/colors.xml").absolutePath))
    assertTrue(affected, "an edit under a session root must schedule a rebuild")

    val s3 = adapter.session(roots, pkg)
    assertTrue(s3.rebuilt, "invalidate() must force the next session to rebuild the app repo")
    assertTrue(adapter.lastRebuildMillis >= 0, "the rebuild duration must be recorded")
    println("[T24] app-repository rebuild took ${adapter.lastRebuildMillis} ms")

    val argb3 = EngineTestSupport.centerArgb(s3.render(layoutId))
    assertTrue(
      EngineTestSupport.red(argb3) > 200 &&
        EngineTestSupport.blue(argb3) > 200 &&
        EngineTestSupport.green(argb3) < 80,
      "the edited magenta background must appear after invalidate; was #%08X".format(argb3),
    )
  }
}
