package preprocess

/**
 * M0 item 4 fallback (design §D2 plan B for AD-007): Paparazzi's `PaparazziCallback` throws for a
 * missing view class and layoutlib rethrows rather than substituting a MockView, so we substitute
 * unknown custom-view tags with a labeled `TextView` box during preprocessing. Each substitution is
 * reported via [onSubstituted] (fed into the LogBridge as a `substitutedClass` warning, AD-007).
 *
 * v1 handles the common self-closing / open-close forms of a fully-qualified tag; the full
 * preprocessor (Phase 5) generalises this.
 */
object UnknownViewSubstitutor {

  // A start tag whose name is fully-qualified (contains at least one dot), capturing name/attrs/slash.
  private val OPEN_TAG = Regex("""<([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)+)\b([^>]*?)(/?)>""")

  /**
   * Replace every fully-qualified tag for which [isLoadable] returns false with a labeled TextView.
   * Returns the rewritten XML; invokes [onSubstituted] once per substituted class name.
   */
  fun substitute(
    xml: String,
    isLoadable: (String) -> Boolean,
    onSubstituted: (String) -> Unit,
  ): String {
    val substituted = LinkedHashSet<String>()
    var result = OPEN_TAG.replace(xml) { m ->
      val name = m.groupValues[1]
      val attrs = m.groupValues[2]
      val selfClose = m.groupValues[3]
      if (isLoadable(name)) {
        m.value
      } else {
        substituted.add(name)
        val label = """ android:text="$name" android:gravity="center" android:background="#5566AACC""""
        "<TextView$attrs$label$selfClose>"
      }
    }
    substituted.forEach { name ->
      result = result.replace("</$name>", "</TextView>")
      onSubstituted(name)
    }
    return result
  }
}
