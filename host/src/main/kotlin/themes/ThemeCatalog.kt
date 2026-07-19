package themes

import engine.EngineAdapter
import rpc.ThemeInfo
import rpc.ThemeSource

/**
 * T26 — enumerates the themes available to a preview (CFG-04, LAY-06). A STYLE is a theme when its
 * name starts with `Theme.` (or is exactly `Theme`) OR its parent chain reaches such a theme root.
 * The parent walk is bounded and cycle-guarded (a broken/looping parent never hangs enumeration).
 * Themes are collected from the app (project + bundled library) and framework repositories and each
 * carries its {@link ThemeSource}. Results are cached per session and refresh when the app
 * repository is rebuilt (the EngineAdapter session generation changes on invalidation).
 */
class ThemeCatalog(private val adapter: EngineAdapter) {

  /** One repository's STYLE set: `name -> parentStyleName?` plus the source to tag its themes with. */
  data class StyleSource(val source: ThemeSource, val styles: Map<String, String?>)

  private var cachedGeneration: Long = -1L
  private var cached: List<ThemeInfo>? = null

  /** Themes for the active session, cached until the app repository is rebuilt (invalidation). */
  fun list(): List<ThemeInfo> {
    val generation = adapter.sessionGeneration
    cached?.let { if (cachedGeneration == generation) return it }
    val sources = listOf(
      StyleSource(ThemeSource.project, adapter.appStyleParents()),
      StyleSource(ThemeSource.platform, adapter.frameworkStyleParents()),
    )
    val result = catalog(sources)
    cachedGeneration = generation
    cached = result
    return result
  }

  companion object {
    private const val MAX_PARENT_WALK = 50

    /** Strip `@style/`, `@android:style/`, `android:`, and any `pkg:` prefix down to the bare name. */
    fun bareName(raw: String): String = raw.trim().substringAfterLast('/').substringAfterLast(':')

    /** A bare style name that IS a theme root: exactly `Theme` or `Theme.<something>`. */
    fun looksLikeThemeName(raw: String): Boolean {
      val n = bareName(raw)
      return n == "Theme" || n.startsWith("Theme.")
    }

    /**
     * Build the theme list from all style sources. A style is included when {@link #isTheme} holds;
     * de-duplicated by bare name with earlier sources (project first) winning.
     */
    fun catalog(sources: List<StyleSource>): List<ThemeInfo> {
      // Union of every style's parent (bare name -> parent), for multi-hop project parent walks.
      val parents = HashMap<String, String?>()
      for (s in sources) for ((name, parent) in s.styles) parents[bareName(name)] = parent

      val seen = HashSet<String>()
      val out = ArrayList<ThemeInfo>()
      for (s in sources) {
        for ((name, parent) in s.styles) {
          if (!isTheme(name, parent, parents)) continue
          if (!seen.add(bareName(name))) continue
          out += ThemeInfo(name = name, isProjectTheme = s.source == ThemeSource.project, source = s.source)
        }
      }
      return out
    }

    /**
     * True if [name] is a theme: its own name looks like a theme root, or following its parent chain
     * (explicit parent, else the implicit dotted parent) reaches one. Bounded by [MAX_PARENT_WALK]
     * and cycle-guarded via a visited set of bare names.
     */
    fun isTheme(name: String, explicitParent: String?, parents: Map<String, String?>): Boolean {
      if (looksLikeThemeName(name)) return true
      val visited = hashSetOf(bareName(name))
      var current: String? = resolveParent(name, explicitParent)
      var depth = 0
      while (current != null && depth++ < MAX_PARENT_WALK) {
        if (looksLikeThemeName(current)) return true
        val bare = bareName(current)
        if (!visited.add(bare)) return false // cycle
        val entry = parents[bare]
        current = resolveParent(current, entry)
      }
      return false
    }

    /** Explicit parent wins; otherwise a dotted name implies its prefix as parent (Android rule). */
    private fun resolveParent(name: String, explicitParent: String?): String? {
      val explicit = explicitParent?.trim()
      if (!explicit.isNullOrEmpty()) return explicit
      val bare = bareName(name)
      return if (bare.contains('.')) bare.substringBeforeLast('.') else null
    }
  }
}
