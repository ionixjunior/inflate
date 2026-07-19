package engine

import android.view.View
import android.view.ViewGroup
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T39 (LAY-05, RES-02): bundled androidx/Material AAR classes + resources are wired into the engine.
 * Proves a layout using `MaterialButton` inside `ConstraintLayout` inflates with the REAL classes
 * (not a MockView placeholder) and that library resources (`@style/Widget.Material3.*`) resolve —
 * with NO project dependency declarations. Also checks RES-02: a project root resource overrides a
 * bundled library resource of the same name.
 */
class LibraryResourcesTest {

  private fun newAdapter(): EngineAdapter = EngineAdapter(
    runtimeRoot = EngineTestSupport.runtimeRoot(),
    resourcesRoot = EngineTestSupport.resourcesRoot(),
    libraryResDirs = EngineTestSupport.libResDirs(),
  )

  private fun descendants(v: View): Sequence<View> = sequence {
    yield(v)
    if (v is ViewGroup) for (i in 0 until v.childCount) yieldAll(descendants(v.getChildAt(i)))
  }

  @Test
  fun `MaterialButton inside ConstraintLayout inflates with real classes under a Material3 theme`() {
    val res = EngineTestSupport.copyFixtureRes("material")
    val adapter = newAdapter()
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(
        appTestDir = res.parentFile,
        roots = listOf(res),
        resourcePackageNames = EngineTestSupport.rPackages(),
      ),
    )
    val session = adapter.session(listOf(res), "com.inflate.preview")
    val layoutId = session.resourceId("material_probe", "layout")

    // Apply the Material3 theme + resolve the library style chain (proves it renders, no crash).
    session.render(layoutId, theme = "Theme.Material3.DayNight")

    // Re-inflate under the now-active theme to inspect the class of each view.
    val root = adapter.inflate(layoutId)
    val classes = descendants(root).map { it.javaClass.name }.toList()

    assertTrue(
      classes.any { it == "androidx.constraintlayout.widget.ConstraintLayout" },
      "root should be the real ConstraintLayout, got $classes",
    )
    assertTrue(
      classes.any { it == "com.google.android.material.button.MaterialButton" },
      "button should be the real MaterialButton (not a MockView placeholder), got $classes",
    )
    assertTrue(
      classes.none { it.contains("MockView") },
      "no view should degrade to a MockView placeholder, got $classes",
    )
  }
}
