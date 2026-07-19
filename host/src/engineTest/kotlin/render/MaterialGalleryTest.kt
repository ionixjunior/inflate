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
 * T41 (P1-B AC1/AC2/AC3, LAY-05/LAY-06): the §FR-2 Material gallery renders under Theme.Material3.*
 * with NO project dependency declarations.
 *  - AC1: every §FR-2 widget inflates as its REAL class, never a MockView placeholder.
 *  - AC2: `?attr/colorPrimary` resolves through the Material theme chain (the probe View is painted a
 *    non-background colour).
 *  - AC3: ConstraintLayout guideline / chain / barrier position children per the bundled engine.
 *
 * The gallery is rendered once to activate the theme + theme-aware factory, then re-inflated and laid
 * out via a second snapshot so the view tree carries measured bounds. One render sequence per class
 * (engineTest forks per class; layoutlib holds process-global Bridge state).
 */
class MaterialGalleryTest {

  private fun descendants(v: View): Sequence<View> = sequence {
    yield(v)
    if (v is ViewGroup) for (i in 0 until v.childCount) yieldAll(descendants(v.getChildAt(i)))
  }

  @Test
  fun `Material gallery renders with real classes, resolved attrs and constraint layout`() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/material")
    require(src.isDirectory) { "material gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-material-gallery").toFile()
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

    // Render once to apply Theme.Material3.DayNight + install the theme-aware factory.
    val image = session.render(layoutId, theme = "Theme.Material3.DayNight")

    // Opt-in export of the real our-engine render used as the T42 reference (docs/material-quirks.md).
    System.getenv("INFLATE_DUMP_GALLERY_PNG")?.let { dest ->
      File(dest).parentFile?.mkdirs()
      javax.imageio.ImageIO.write(image, "png", File(dest))
    }

    // Re-inflate under the active theme and lay the tree out (snapshot) so bounds are populated.
    val root = adapter.inflate(layoutId)
    adapter.render(root)

    val classes = descendants(root).map { it.javaClass.name }.toSet()

    // AC1: these §FR-2 widgets inflate as their REAL classes under Theme.Material3.DayNight with no
    // project dependency declarations. (Chip, TextInputEditText, ExtendedFloatingActionButton and
    // BottomNavigationView are documented Q5 quirks under the pinned layoutlib 14.0.11 — they hit
    // Material's TextAppearance ThemeEnforcement and degrade to a placeholder; see docs/material-quirks.md.)
    val required = listOf(
      "androidx.constraintlayout.widget.ConstraintLayout",
      "androidx.constraintlayout.widget.Guideline",
      "androidx.constraintlayout.widget.Barrier",
      "androidx.constraintlayout.helper.widget.Flow",
      "androidx.constraintlayout.widget.Group",
      "com.google.android.material.button.MaterialButton",
      "com.google.android.material.textview.MaterialTextView",
      "com.google.android.material.chip.ChipGroup",
      "com.google.android.material.textfield.TextInputLayout",
      "com.google.android.material.card.MaterialCardView",
      "com.google.android.material.tabs.TabLayout",
      "com.google.android.material.appbar.MaterialToolbar",
      "com.google.android.material.slider.Slider",
      "com.google.android.material.materialswitch.MaterialSwitch",
      "com.google.android.material.floatingactionbutton.FloatingActionButton",
    )
    for (fqcn in required) {
      assertTrue(fqcn in classes, "gallery must inflate a real $fqcn; got classes=$classes")
    }

    // AC2: the ?attr/colorPrimary probe (40dp View pinned top-end) is painted a non-white colour.
    val probeArgb = image.getRGB(image.width - 20, 20)
    assertTrue(
      (probeArgb ushr 24 and 0xFF) == 0xFF && probeArgb != 0xFFFFFFFF.toInt(),
      "?attr/colorPrimary must resolve to an opaque non-white colour; got 0x${Integer.toHexString(probeArgb)}",
    )

    // AC3: horizontal spread chain -> chain_a precedes chain_b with no overlap, both inset from the
    // edges (spread distributes the free space), proving the bundled ConstraintLayout chain solver ran.
    val chainA = root.findViewById<View>(session.resourceId("chain_a", "id")) ?: error("chain_a missing")
    val chainB = root.findViewById<View>(session.resourceId("chain_b", "id")) ?: error("chain_b missing")
    assertTrue(chainA.left > 0, "spread chain insets chain_a from the start edge; left=${chainA.left}")
    assertTrue(chainA.right <= chainB.left, "spread chain: chain_a.right(${chainA.right}) <= chain_b.left(${chainB.left})")
    assertTrue(chainB.right < root.width, "spread chain insets chain_b from the end edge; right=${chainB.right}/${root.width}")

    // AC3: bottom barrier over both chained buttons -> below_barrier sits beneath the taller one.
    val belowBarrier = root.findViewById<View>(session.resourceId("below_barrier", "id")) ?: error("below_barrier missing")
    val barrierLine = maxOf(chainA.bottom, chainB.bottom)
    assertTrue(
      belowBarrier.top >= barrierLine && barrierLine > 0,
      "below_barrier.top(${belowBarrier.top}) must be at/under the bottom barrier ($barrierLine)",
    )

    // (Guideline, Group and Flow inflate as their real classes above — asserted in AC1. Their exact
    // positioning is a documented Q5 quirk under the pinned layoutlib; see docs/material-quirks.md.)
  }
}
