package render

import app.cash.paparazzi.DeviceConfig
import com.android.resources.Density
import engine.EngineAdapter
import engine.EngineTestSupport
import log.LogBridge
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import preprocess.UnknownViewSubstitutor
import java.io.File

/**
 * M0 checklist item 4 (AD-007 gate) — FALLBACK APPLIED.
 *
 * Empirical M0 finding: Paparazzi's `PaparazziCallback.loadView` throws for a missing class and
 * layoutlib RETHROWS (verified: it only auto-MockViews when the callback itself returns one), so
 * the primary "rely on layoutlib MockView" path fails — inflation of the whole file returns null.
 * We therefore apply the design's pre-agreed plan B: preprocessor tag substitution replaces the
 * unknown custom-view tag with a labeled TextView box, and the LogBridge records a substitutedClass
 * warning. The custom-view fixture then renders without any exception escaping.
 */
class MockViewTest {

  @Test
  fun `unknown view is substituted with a labeled placeholder and reported`() {
    val res = EngineTestSupport.copyFixtureRes("custom")
    val logBridge = LogBridge()

    // Preprocess the overlay: substitute the unknown tag (Class.forName fails) with a TextView box.
    val layoutFile = File(res, "layout/custom.xml")
    val substituted = UnknownViewSubstitutor.substitute(
      xml = layoutFile.readText(),
      isLoadable = { name -> runCatching { Class.forName(name) }.isSuccess },
      onSubstituted = { logBridge.recordSubstitutedClass(it) },
    )
    layoutFile.writeText(substituted)

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      deviceConfig = DeviceConfig(
        screenWidth = 240,
        screenHeight = 240,
        xdpi = 160,
        ydpi = 160,
        density = Density.MEDIUM,
      ),
    )
    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = res.parentFile, roots = listOf(res)))
    adapter.buildRepositories(listOf(res))

    // Renders without any exception escaping, producing a non-blank placeholder region.
    val layoutId = adapter.resourceId("custom", "layout", "com.inflate.preview")
    assertTrue(layoutId != 0, "custom.xml should resolve to a layout id")
    val image = adapter.render(adapter.inflate(layoutId))

    val distinct = HashSet<Int>()
    for (y in 0 until image.height step 4) for (x in 0 until image.width step 4) distinct.add(image.getRGB(x, y))
    assertTrue(distinct.size > 1, "placeholder should produce non-blank content")

    // LogBridge captured the load failure as a substitutedClass warning naming the class.
    val entry = logBridge.warnings().single { it.kind == LogBridge.Kind.substitutedClass }
    assertTrue(entry.message.contains("com.example.FakeView"), "warning should name the substituted class")
  }
}
