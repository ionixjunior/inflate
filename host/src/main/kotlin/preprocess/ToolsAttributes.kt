package preprocess

/**
 * T29 (LAY-04 tools: half): honors the core design-time `tools:` attribute set — `tools:text`,
 * `tools:src`, `tools:visibility`, `tools:background`, `tools:layout` (the last read by [Structural]
 * on `<fragment>`/`<include>`, T31), `tools:layout_height` (LAY-08 edge case, T90: a root's design-time
 * height override) — by copying each into the `android:` namespace on the SAME tag (overriding an
 * existing `android:` value, or adding one), then stripping every `tools:` attribute (core and
 * non-core alike) plus the `xmlns:tools` namespace declaration.
 *
 * Every attribute's original leading whitespace (including any newline/indentation, for the common
 * one-attribute-per-line layout style) is preserved verbatim; a stripped attribute's whitespace is
 * kept as filler rather than deleted. So this stage only ever rewrites the `name="value"` span of an
 * attribute in place — it never adds or removes a line, and a caller-held [Preprocessor.LineMap]
 * built before this stage stays valid after it.
 */
object ToolsAttributes {

  /** The design-time attributes honored for rendering; every other `tools:` attribute is dropped. */
  private val CORE_ATTRS = setOf("text", "src", "visibility", "background", "layout", "layout_height")

  private const val TOOLS_NS_ATTR = "xmlns:tools"

  // One XML start tag: name, then a run of attribute pairs, then optional trailing whitespace + `/`,
  // then `>`. Trailing whitespace/slash are captured (not discarded) so the original spacing before a
  // self-closing `/>` is preserved byte-for-byte when untouched.
  private val START_TAG = Regex("""<([A-Za-z_][\w.]*)((?:\s+[\w:.-]+="[^"]*")*)(\s*)(/?)>""")

  // A single attribute WITH its leading whitespace, so that whitespace can be preserved even when
  // the attribute itself is stripped or renamed.
  private val ATTR = Regex("""(\s+)([\w:.-]+)="([^"]*)"""")

  data class Result(val content: String)

  fun apply(content: String): Result {
    val spans = Comments.spans(content)
    val rewritten = START_TAG.replace(content) { tagMatch ->
      // A start tag inside a comment is inert markup — never rewrite tools: attrs there (G1).
      if (Comments.inComment(spans, tagMatch.range.first)) return@replace tagMatch.value
      val tagName = tagMatch.groupValues[1]
      val trailingWs = tagMatch.groupValues[3]
      val selfClose = tagMatch.groupValues[4]

      val attrs = ATTR.findAll(tagMatch.groupValues[2]).toList()
      val presentNames = attrs.map { it.groupValues[2] }.toSet()

      // For each core tools:X, decide: override an existing android:X value, or rename this
      // occurrence to android:X in place (add case). Non-core tools: attrs and xmlns:tools blank.
      val overrideValues = HashMap<String, String>() // android:X -> value to apply at that attr's own position
      val renameTo = HashMap<Int, String>() // attr index -> new local name (add case)
      val blankIndexes = HashSet<Int>()

      attrs.forEachIndexed { index, m ->
        val name = m.groupValues[2]
        when {
          name == TOOLS_NS_ATTR -> blankIndexes += index
          name.startsWith("tools:") -> {
            val local = name.removePrefix("tools:")
            if (local in CORE_ATTRS) {
              val androidName = "android:$local"
              if (androidName in presentNames) {
                overrideValues[androidName] = m.groupValues[3]
                blankIndexes += index
              } else {
                renameTo[index] = androidName
              }
            } else {
              blankIndexes += index // non-core tools: attr: silently dropped
            }
          }
        }
      }

      val rebuiltAttrsBlock = attrs.mapIndexed { index, m ->
        val leadingWs = m.groupValues[1]
        val name = m.groupValues[2]
        when {
          index in blankIndexes -> leadingWs
          index in renameTo -> "$leadingWs${renameTo.getValue(index)}=\"${m.groupValues[3]}\""
          overrideValues.containsKey(name) -> "$leadingWs$name=\"${overrideValues.getValue(name)}\""
          else -> m.value
        }
      }.joinToString("")

      "<$tagName$rebuiltAttrsBlock$trailingWs$selfClose>"
    }
    return Result(rewritten)
  }
}
