package engine

import android.view.View
import android.view.ViewGroup
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * T40 (LAY-05/LAY-06, design finding #6): the theme-aware Factory2 honours the resolved theme's
 * `viewInflaterClass`. A single plain `<Button>` tag inflates to a different concrete class per theme:
 *  - `Theme.Material3.DayNight` (viewInflaterClass = MaterialComponentsViewInflater) → `MaterialButton`
 *  - a platform `android:` theme (no viewInflaterClass) → framework `android.widget.Button`
 *  - a theme whose `viewInflaterClass` cannot be loaded → AppCompat fallback (`AppCompatButton`),
 *    without failing the render.
 *
 * All three run in one test method: layoutlib's Bridge holds process-global state, so engineTest
 * classes keep to a single render sequence (each `render` releases the prior scene, as in SessionTest).
 */
class ThemeAwareFactoryTest {

  private fun descendants(v: View): Sequence<View> = sequence {
    yield(v)
    if (v is ViewGroup) for (i in 0 until v.childCount) yieldAll(descendants(v.getChildAt(i)))
  }

  private fun buttonClassAfterRender(adapter: EngineAdapter, session: EngineAdapter.ProjectSession, layoutId: Int, theme: String): String {
    session.render(layoutId, theme = theme)
    val root = adapter.inflate(layoutId)
    val button = descendants(root).firstOrNull { it.javaClass.simpleName.endsWith("Button") }
      ?: error("no Button-like view inflated under theme '$theme' (got ${descendants(root).map { it.javaClass.name }.toList()})")
    return button.javaClass.name
  }

  @Test
  fun `Button inflates per the resolved theme's viewInflaterClass`() {
    val res = EngineTestSupport.copyFixtureRes("factory")
    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      libraryResDirs = EngineTestSupport.libResDirs(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(
        appTestDir = res.parentFile,
        roots = listOf(res),
        resourcePackageNames = EngineTestSupport.rPackages(),
      ),
    )
    val session = adapter.session(listOf(res), "com.inflate.preview")
    val layoutId = session.resourceId("factory_probe", "layout")

    assertEquals(
      "com.google.android.material.button.MaterialButton",
      buttonClassAfterRender(adapter, session, layoutId, "Theme.Material3.DayNight"),
      "<Button> under a Material3 theme must inflate as MaterialButton (viewInflaterClass honoured)",
    )

    assertEquals(
      "android.widget.Button",
      buttonClassAfterRender(adapter, session, layoutId, "android:Theme.Material.NoActionBar.Fullscreen"),
      "<Button> under a platform theme (no viewInflaterClass) must stay the framework Button",
    )

    assertEquals(
      "androidx.appcompat.widget.AppCompatButton",
      buttonClassAfterRender(adapter, session, layoutId, "BadInflaterTheme"),
      "<Button> under a theme with an unloadable viewInflaterClass must fall back to AppCompatButton",
    )
  }
}
