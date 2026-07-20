package render

import android.view.View
import android.view.ViewGroup
import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.nio.file.Files

/**
 * AD-016 (revisits Q5 / P1-B AC1, LAY-05): the Material widgets that formerly degraded to a MockView
 * placeholder under the pinned layoutlib 14.0.11 now inflate as their REAL classes.
 *
 * Root cause (fixed in [engine.RClassGenerator]): the generated library `R.styleable` arrays zeroed
 * every framework (`android:`) attr slot, because `mergeAndRenumberSymbols` was given an EMPTY
 * platform symbol table. At render time `obtainStyledAttributes(...).getResourceId(android:textAppearance,
 * -1)` therefore read id 0 and returned -1, tripping Material's `ThemeEnforcement.checkTextAppearance`
 * (Chip NPEs on a null TextAppearance; ExtendedFloatingActionButton and BottomNavigationView throw).
 * Populating the platform table with the framework ids baked into the AAR R.txt styleable arrays
 * keeps those slots at their canonical framework ids (layoutlib resolves them natively), so the
 * enforcement check reads the real text-appearance id and the widgets construct normally.
 *
 * This is the discriminating counterpart to [MaterialGalleryTest], which documented these three as
 * quirks and did NOT assert them as real. It renders the same §FR-2 gallery under
 * Theme.Material3.DayNight (no project dependency declarations) and asserts the three formerly-degraded
 * widgets inflate as their real classes with no MockView substitution.
 */
class MaterialTextAppearanceTest {

  private fun descendants(v: View): Sequence<View> = sequence {
    yield(v)
    if (v is ViewGroup) for (i in 0 until v.childCount) yieldAll(descendants(v.getChildAt(i)))
  }

  @Test
  fun `formerly-degraded Material widgets inflate as real classes under Theme_Material3_DayNight`() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/material")
    require(src.isDirectory) { "material gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-material-textappearance").toFile()
    src.copyRecursively(proj, overwrite = true)
    val res = File(proj, "res")

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      libraryResDirs = EngineTestSupport.libResDirs(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(
        appTestDir = proj,
        roots = listOf(res),
        resourcePackageNames = EngineTestSupport.rPackages(),
      ),
    )
    val session = adapter.session(listOf(res), "com.inflate.preview")
    val layoutId = session.resourceId("material_gallery", "layout")

    // Render once to apply Theme.Material3.DayNight + install the theme-aware factory, then re-inflate
    // under the active theme so every widget's constructor (incl. ThemeEnforcement) actually runs.
    session.render(layoutId, theme = "Theme.Material3.DayNight")
    val root = adapter.inflate(layoutId)
    val classes = descendants(root).map { it.javaClass.name }.toSet()

    // The three §FR-2 widgets whose TextAppearance ThemeEnforcement formerly threw/NPEd and degraded.
    val formerlyDegraded = listOf(
      "com.google.android.material.chip.Chip",
      "com.google.android.material.floatingactionbutton.ExtendedFloatingActionButton",
      "com.google.android.material.bottomnavigation.BottomNavigationView",
    )
    for (fqcn in formerlyDegraded) {
      assertTrue(
        fqcn in classes,
        "gallery must now inflate a real $fqcn (TextAppearance ThemeEnforcement must pass); got classes=$classes",
      )
    }

    // None of the rendered views degraded to a MockView placeholder.
    assertTrue(
      classes.none { it.contains("MockView") },
      "no §FR-2 widget should degrade to a MockView placeholder; got classes=$classes",
    )
  }
}
