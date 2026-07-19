package themes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import rpc.ThemeSource
import themes.ThemeCatalog.Companion.catalog
import themes.ThemeCatalog.Companion.isTheme
import themes.ThemeCatalog.Companion.looksLikeThemeName

/**
 * T26 unit coverage — the theme-detection predicate (name prefix, parent-chain walk, cycle guard,
 * non-theme exclusion) and catalog assembly. Pure logic, no engine (CFG-04, LAY-06).
 */
class ThemeCatalogTest {

  @Test
  fun `looksLikeThemeName matches Theme root names only, ignoring style-ref prefixes`() {
    assertTrue(looksLikeThemeName("Theme"))
    assertTrue(looksLikeThemeName("Theme.Material3.DayNight"))
    assertTrue(looksLikeThemeName("@style/Theme.Custom"))
    assertTrue(looksLikeThemeName("android:Theme.Material"))
    assertTrue(looksLikeThemeName("@android:style/Theme.Holo"))
    assertFalse(looksLikeThemeName("ThemeOverlay.App"))
    assertFalse(looksLikeThemeName("Theme2.Foo"))
    assertFalse(looksLikeThemeName("Widget.Button"))
  }

  @Test
  fun `detects a theme by name prefix`() {
    assertTrue(isTheme("Theme.Custom", explicitParent = "AppTheme", parents = emptyMap()))
    assertTrue(isTheme("Theme", explicitParent = null, parents = emptyMap()))
  }

  @Test
  fun `detects a theme via an explicit parent reaching a theme root`() {
    assertTrue(isTheme("AppTheme", explicitParent = "android:Theme.Material.Light", parents = emptyMap()))
  }

  @Test
  fun `detects a theme via a multi-hop project parent chain`() {
    // Base(project) -> Mid(project) -> Theme.Material (framework). Only names are theme-checked;
    // the parents map lets the walk hop through project styles.
    val parents = mapOf("Base" to null, "Mid" to "Base", "Base2" to "android:Theme.Material")
    // Base -> parent Base2 -> Theme.Material
    assertTrue(isTheme("Base", explicitParent = "Base2", parents = mapOf("Base2" to "android:Theme.Material")))
    // A -> B -> Theme.Material through the map (implicit lookups)
    val chain = mapOf("A" to "B", "B" to "android:Theme.Material")
    assertTrue(isTheme("A", explicitParent = "B", parents = chain))
  }

  @Test
  fun `excludes non-theme styles`() {
    assertFalse(isTheme("Body", explicitParent = "android:TextAppearance.Material.Body1", parents = emptyMap()))
    assertFalse(isTheme("Widget.Fancy", explicitParent = null, parents = emptyMap()))
    // A dotted widget name whose implicit parent is also not a theme.
    assertFalse(isTheme("Widget.Card.Big", explicitParent = null, parents = mapOf("Widget.Card" to null)))
  }

  @Test
  fun `guards against a parent cycle without hanging`() {
    val parents = mapOf("A" to "B", "B" to "A")
    assertFalse(isTheme("A", explicitParent = "B", parents = parents))
    assertFalse(isTheme("B", explicitParent = "A", parents = parents))
  }

  @Test
  fun `catalog tags sources, keeps themes, drops non-themes, and de-duplicates`() {
    val project = ThemeCatalog.StyleSource(
      ThemeSource.project,
      mapOf(
        "AppTheme" to "android:Theme.Material.Light",
        "Theme.Custom" to "AppTheme",
        "Body" to "android:TextAppearance.Material",
        "Widget.Fancy" to null,
      ),
    )
    val platform = ThemeCatalog.StyleSource(
      ThemeSource.platform,
      mapOf("Theme" to null, "Theme.Material" to "Theme", "TextAppearance" to null),
    )

    val result = catalog(listOf(project, platform))
    val byName = result.associateBy { it.name }

    assertTrue(byName.containsKey("AppTheme"))
    assertTrue(byName.containsKey("Theme.Custom"))
    assertTrue(byName.containsKey("Theme"))
    assertTrue(byName.containsKey("Theme.Material"))
    assertFalse(byName.containsKey("Body"))
    assertFalse(byName.containsKey("Widget.Fancy"))
    assertFalse(byName.containsKey("TextAppearance"))

    assertEquals(ThemeSource.project, byName["AppTheme"]!!.source)
    assertTrue(byName["AppTheme"]!!.isProjectTheme)
    assertEquals(ThemeSource.platform, byName["Theme.Material"]!!.source)
    assertFalse(byName["Theme.Material"]!!.isProjectTheme)
  }
}
