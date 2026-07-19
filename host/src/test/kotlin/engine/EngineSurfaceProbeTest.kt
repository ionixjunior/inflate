package engine

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards AD-009 (M0 checklist item 1): the friend-paths compile must resolve real Paparazzi
 * `internal` types. Compilation of EngineSurfaceProbe already proves the flag is present; this
 * test proves the resolved symbols are the genuine internal engine classes and are loadable
 * at runtime (guarding against a silent flag loss that resolves to the wrong/absent types).
 */
class EngineSurfaceProbeTest {

  @Test
  fun `all inventoried internal engine symbols are resolved`() {
    // The design's EngineAdapter depends on exactly these 8 internal symbols (§D2/#12).
    assertEquals(8, EngineSurfaceProbe.internalSymbols.size)
  }

  @Test
  fun `every symbol is a genuine Paparazzi internal class and is loadable`() {
    EngineSurfaceProbe.internalSymbols.forEach { cls ->
      assertNotNull(cls.name)
      // Must come from Paparazzi's internal packages — proves friend-paths reached real
      // internal machinery rather than silently resolving to something public/wrong.
      assertTrue(
        cls.name.startsWith("app.cash.paparazzi.internal"),
        "expected an app.cash.paparazzi.internal.* class but was ${cls.name}",
      )
      // Loadable by the same name via the classloader (runtime accessibility).
      assertEquals(cls, Class.forName(cls.name, false, cls.classLoader))
    }
  }

  @Test
  fun `inventory covers each required engine role exactly once`() {
    val names = EngineSurfaceProbe.internalSymbols.map { it.name }.toSet()
    val required = setOf(
      "app.cash.paparazzi.internal.Renderer",
      "app.cash.paparazzi.internal.SessionParamsBuilder",
      "app.cash.paparazzi.internal.PaparazziCallback",
      "app.cash.paparazzi.internal.PaparazziLogger",
      "app.cash.paparazzi.internal.parsers.LayoutPullParser",
      "app.cash.paparazzi.internal.resources.FrameworkResourceRepository",
      "app.cash.paparazzi.internal.resources.AppResourceRepository",
      "app.cash.paparazzi.internal.resources.AarSourceResourceRepository",
    )
    assertEquals(required, names)
  }
}
