package themes

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import rpc.ThemeSource
import java.io.File

/**
 * T26 engineTest — ThemeCatalog against real repositories on gradle-sample: project themes and
 * framework/platform themes are listed with correct sources, non-theme styles are excluded, and the
 * catalog refreshes after a style edit + invalidate (CFG-04, LAY-06).
 */
class ThemeCatalogEngineTest {

  private val pkg = "com.inflate.gradlesample"

  @Test
  fun `lists project and platform themes with sources and refreshes on invalidation`() {
    val proj = EngineTestSupport.copyFixtureTree("gradle-sample")
    val stylesFile = File(proj, "app/src/main/res/values/styles.xml")
    val roots = listOf(File(proj, "app/src/main/res"))
    val adapter = EngineAdapter(EngineTestSupport.runtimeRoot(), EngineTestSupport.resourcesRoot())
    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = proj, roots = roots, packageName = pkg))
    adapter.session(roots, pkg)

    val catalog = ThemeCatalog(adapter)
    val themes = catalog.list()
    val byName = themes.associateBy { it.name }

    // Project themes: AppTheme (via parent chain) + Theme.Custom (via name prefix), source=project.
    assertTrue(byName.containsKey("AppTheme"), "AppTheme should be listed (parent-chain theme)")
    assertTrue(byName.containsKey("Theme.Custom"), "Theme.Custom should be listed (name-prefix theme)")
    assertTrue(byName["AppTheme"]!!.isProjectTheme && byName["AppTheme"]!!.source == ThemeSource.project)
    assertTrue(byName["Theme.Custom"]!!.source == ThemeSource.project)

    // Non-theme project styles excluded.
    assertFalse(byName.containsKey("Body"), "Body (TextAppearance) must be excluded")
    assertFalse(byName.containsKey("Widget.Fancy"), "Widget.Fancy must be excluded")

    // Platform themes present with source=platform (the framework base theme "Theme" always exists).
    assertTrue(
      themes.any { it.source == ThemeSource.platform && it.name == "Theme" },
      "framework base theme 'Theme' should be listed as platform",
    )
    assertTrue(
      themes.any { it.source == ThemeSource.platform && it.name.startsWith("Theme.Material") },
      "a platform Theme.Material* should be listed",
    )

    // Caching: same session generation returns the same (cached) instance.
    assertTrue(catalog.list() === themes, "unchanged session must return the cached list")

    // Edit styles.xml to add a new project theme, invalidate, rebuild -> catalog refreshes.
    assertFalse(byName.containsKey("Theme.Added"), "Theme.Added not present before the edit")
    stylesFile.writeText(
      """
      <?xml version="1.0" encoding="utf-8"?>
      <resources>
        <style name="AppTheme" parent="android:Theme.Material.Light.NoActionBar" />
        <style name="Theme.Custom" parent="AppTheme" />
        <style name="Body" parent="android:TextAppearance.Material.Body1" />
        <style name="Widget.Fancy" />
        <style name="Theme.Added" parent="AppTheme" />
      </resources>
      """.trimIndent(),
    )
    adapter.invalidate(listOf(stylesFile.absolutePath))
    adapter.session(roots, pkg) // rebuild -> sessionGeneration++

    val refreshed = catalog.list()
    assertTrue(refreshed !== themes, "a rebuilt session must recompute the catalog")
    assertTrue(refreshed.any { it.name == "Theme.Added" }, "the newly added theme must appear after invalidate")
  }
}
