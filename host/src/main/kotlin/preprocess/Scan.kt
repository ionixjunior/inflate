package preprocess

import log.LogBridge

/**
 * T32 (LAY-03 scan half, UX-02): collects every `@kind/name` resource reference in the previewed
 * file for dependency tracking (hot reload invalidation, UX-02), and probes every custom/unknown
 * view tag against the host classpath, substituting a labeled placeholder for anything that can't
 * be loaded — generalizing the M0 fallback ([UnknownViewSubstitutor], AD-013) to also cover the
 * `<view class="com.example.FooView">` form, which that regex (fully-qualified TAG names only)
 * doesn't match. Framework/androidx tags are never flagged: they either have no dot in their tag
 * name (never probed at all) or [isLoadable] genuinely returns true for them at runtime.
 */
object Scan {

  data class Result(
    val content: String,
    val referencedResources: List<Preprocessor.Ref>,
    val customClasses: List<String>,
  )

  // `@kind/name`, optionally `+` (new-id) and an `android:` framework-namespace prefix. Framework
  // refs are excluded from dependency tracking below — they're always resolvable (never invalidate).
  private val REFERENCE = Regex("""@(\+)?(?:(android):)?([A-Za-z_][\w]*)/([\w.]+)""")

  private val VIEW_CLASS_TAG = Regex("""<view\b([^>]*)\bclass="([\w.]+)"([^>]*)/>""")
  private val ATTR = Regex("""([\w:.-]+)="([^"]*)"""")

  fun scan(
    content: String,
    isLoadable: (String) -> Boolean,
    log: LogBridge,
  ): Result {
    val referenced = collectReferences(content)

    val customClasses = LinkedHashSet<String>()
    var working = UnknownViewSubstitutor.substitute(
      content,
      isLoadable = isLoadable,
      onSubstituted = { name ->
        customClasses += name
        log.recordSubstitutedClass(name)
      },
    )
    working = substituteViewClassForm(working, isLoadable, customClasses, log)

    return Result(working, referenced, customClasses.toList())
  }

  private fun collectReferences(content: String): List<Preprocessor.Ref> {
    val seen = LinkedHashSet<Preprocessor.Ref>()
    REFERENCE.findAll(content).forEach { m ->
      val isFrameworkNamespace = m.groupValues[2] == "android"
      if (isFrameworkNamespace) return@forEach
      val kind = m.groupValues[3]
      val name = m.groupValues[4]
      seen += Preprocessor.Ref(kind, name)
    }
    return seen.toList()
  }

  /** Handles `<view class="com.example.FooView" .../>` — untouched if loadable, else placeholder. */
  private fun substituteViewClassForm(
    content: String,
    isLoadable: (String) -> Boolean,
    customClasses: MutableSet<String>,
    log: LogBridge,
  ): String = VIEW_CLASS_TAG.replace(content) { m ->
    val className = m.groupValues[2]
    if (isLoadable(className)) {
      m.value
    } else {
      customClasses += className
      log.recordSubstitutedClass(className)
      val otherAttrs = ATTR.findAll(m.groupValues[1] + m.groupValues[3])
        .filterNot { it.groupValues[1] == "class" }
        .joinToString("") { " ${it.groupValues[1]}=\"${it.groupValues[2]}\"" }
      """<TextView android:text="$className" android:gravity="center" """ +
        """android:background="#5566AACC"$otherAttrs />"""
    }
  }
}
