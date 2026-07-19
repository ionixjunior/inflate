package engine

import log.LogBridge
import java.io.File

/**
 * T27 — graceful degradation of unresolved resource references (RES-04, UX-05) so a render always
 * completes. Applied to the previewed file's content before inflation: each unresolvable
 * `@color|dimen|string|drawable/name` attribute value is replaced per-kind, and every unresolved
 * reference is recorded via [LogBridge] as a `kind=unresolvedRef` warning:
 *
 *  - color    -> `#FF00FF` (magenta)
 *  - dimen    -> `0dp`
 *  - string   -> the reference name text
 *  - drawable -> an outlined placeholder drawable emitted into the overlay
 *
 * Framework refs (`@android:...`) are left untouched (always resolvable via the framework repo).
 * A style whose parent cannot be resolved degrades to its nearest resolvable dotted ancestor
 * ([degradeStyleParent]) with a warning (spec edge case).
 */
class Degradation(
  private val log: LogBridge,
  /** Overlay res dir to receive the generated drawable placeholder; required to degrade drawables. */
  private val overlayResDir: File? = null,
) {

  /** A degraded reference (for assertions/dependency tracking). */
  data class Ref(val kind: String, val name: String)

  data class Result(val content: String, val unresolved: List<Ref>, val placeholderEmitted: Boolean)

  /** Name of the generated outlined-placeholder drawable substituted for unresolved drawable refs. */
  val placeholderDrawableName: String get() = PLACEHOLDER_DRAWABLE

  /**
   * Rewrite unresolved `@color|dimen|string|drawable/name` attribute values in [content] per-kind,
   * consulting [resolves] `(kind, name) -> Boolean`. Records an unresolvedRef warning for each
   * degraded reference and returns the rewritten content.
   */
  fun degradeReferences(content: String, resolves: (String, String) -> Boolean): Result {
    val unresolved = ArrayList<Ref>()
    var placeholderEmitted = false
    val out = REFERENCE.replace(content) { m ->
      val kind = m.groupValues[1]
      val name = m.groupValues[2]
      if (resolves(kind, name)) {
        m.value
      } else {
        unresolved += Ref(kind, name)
        log.recordUnresolvedRef(kind, name)
        when (kind) {
          "color" -> "\"#FF00FF\""
          "dimen" -> "\"0dp\""
          "string" -> "\"$name\""
          "drawable" -> {
            placeholderEmitted = emitPlaceholderDrawable() || placeholderEmitted
            "\"@drawable/$PLACEHOLDER_DRAWABLE\""
          }
          else -> m.value
        }
      }
    }
    return Result(out, unresolved, placeholderEmitted)
  }

  data class StyleParentResult(val degraded: Boolean, val resolvedParent: String?)

  /**
   * Resolve [requestedParent] to itself if resolvable, else to its nearest resolvable dotted
   * ancestor (`A.B.C` -> `A.B` -> `A`), else null (drop the parent). [resolvesStyle] takes a bare
   * style name. Records a warning when degradation occurs.
   */
  fun degradeStyleParent(requestedParent: String?, resolvesStyle: (String) -> Boolean): StyleParentResult {
    if (requestedParent.isNullOrBlank()) return StyleParentResult(degraded = false, resolvedParent = null)
    var current: String? = bareName(requestedParent)
    if (current != null && resolvesStyle(current)) {
      return StyleParentResult(degraded = false, resolvedParent = requestedParent)
    }
    while (current != null && current.contains('.')) {
      current = current.substringBeforeLast('.')
      if (resolvesStyle(current)) {
        log.recordStyleParentDegraded(requestedParent, current)
        return StyleParentResult(degraded = true, resolvedParent = current)
      }
    }
    log.recordStyleParentDegraded(requestedParent, null)
    return StyleParentResult(degraded = true, resolvedParent = null)
  }

  private fun emitPlaceholderDrawable(): Boolean {
    val dir = overlayResDir ?: return false
    val drawableDir = File(dir, "drawable").apply { mkdirs() }
    val file = File(drawableDir, "$PLACEHOLDER_DRAWABLE.xml")
    if (!file.exists()) file.writeText(PLACEHOLDER_DRAWABLE_XML)
    return true
  }

  companion object {
    const val PLACEHOLDER_DRAWABLE = "inflate_degraded_placeholder"

    // Quoted attribute value that is exactly a project resource ref of one of the four kinds.
    // Package-prefixed refs (android/library namespaces) don't match and are left untouched.
    private val REFERENCE = Regex("\"@(color|dimen|string|drawable)/([A-Za-z0-9_.]+)\"")

    private val PLACEHOLDER_DRAWABLE_XML = """
      <?xml version="1.0" encoding="utf-8"?>
      <shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
          <solid android:color="#00000000" />
          <stroke android:width="2dp" android:color="#FF888888" />
      </shape>
    """.trimIndent()

    private fun bareName(raw: String): String = raw.trim().substringAfterLast('/').substringAfterLast(':')
  }
}
