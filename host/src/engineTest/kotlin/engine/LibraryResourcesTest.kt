package engine

import android.view.View
import android.view.ViewGroup
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import engine.EngineTestSupport.blue
import engine.EngineTestSupport.centerArgb
import engine.EngineTestSupport.green
import engine.EngineTestSupport.red

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

    // Apply the Material3 theme + resolve the library style chain (proves it renders, no crash). The
    // root ConstraintLayout background references @color/abc_decor_view_status_guard (see RES-02 below).
    val image = session.render(layoutId, theme = "Theme.Material3.DayNight")

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

    // RES-02 (T39): the fixture defines @color/abc_decor_view_status_guard = #FFFF0000 (red). That
    // exact name also exists in the bundled appcompat AAR as #ff000000 (black). The project root
    // repository sits ABOVE the library repositories, so the red project value must win — the
    // background (center pixel, away from the top-start button) resolves red, not black.
    val argb = centerArgb(image)
    assertTrue(
      red(argb) > 200 && green(argb) < 60 && blue(argb) < 60,
      "background must resolve to the project's red override (#FFFF0000), not the appcompat " +
        "library black — got argb=0x${Integer.toHexString(argb)}",
    )
  }
}
