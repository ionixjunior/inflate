package preprocess

import log.LogBridge

/**
 * T30 (LAY-04 data-binding half, P1-A AC6): unwraps a data-binding layout's `<layout>` root — drops
 * the `<data>` block, promotes the view child to become the document root (carrying over the
 * `<layout>` tag's `xmlns:*` declarations so the promoted root stays validly namespaced) — and
 * replaces `@{...}` binding expressions with static, type-appropriate defaults:
 *  - `text`        -> `"binding"`
 *  - `visibility`  -> `"visible"`
 *  - a dimension-shaped attribute (width/height/margin/padding/size/elevation/translation*)
 *                  -> `"0dp"`
 *  - anything else -> the attribute is dropped entirely
 *
 * A file whose root is not `<layout>` is not a data-binding layout and is returned untouched
 * (P1-A AC6 1:1). This assumes the common one-construct-per-line formatting Android Studio's own
 * templates produce: `<layout ...>`, an optional `<data>...</data>` block, the view root, then a
 * closing `</layout>` line — each on its own line(s).
 */
object DataBinding {

  data class Result(
    val content: String,
    val lineMap: Preprocessor.LineMap,
    /** True when a `<layout>` root was found and unwrapped. */
    val unwrapped: Boolean,
    /** True when at least one `@{...}` expression was replaced (drives the once-per-file notice). */
    val bindingReplaced: Boolean,
  )

  // `[^>]*` already spans newlines (a negated character class isn't line-restricted), so this finds
  // a `<layout ...>` open tag whose attributes wrap across several lines (e.g. two xmlns: decls).
  private val LAYOUT_OPEN_ANY = Regex("""<layout\b([^>]*)>""")
  private val LAYOUT_CLOSE = Regex("""^\s*</layout>\s*$""")
  private val DATA_OPEN = Regex("""^\s*<data(?:\s[^>]*)?>\s*$""")
  private val DATA_SELF_CLOSE = Regex("""^\s*<data\s*/>\s*$""")
  private val DATA_CLOSE = Regex("""^\s*</data>\s*$""")
  private val XMLNS_ATTR = Regex("""\s+(xmlns:[\w.-]+)="([^"]*)"""")
  private val TAG_NAME = Regex("""<([A-Za-z_][\w.]*)""")

  // An attribute bound to a `@{...}` expression, with its leading whitespace captured so a dropped
  // attribute can leave its whitespace (and any newline within it) in place — no line is ever added
  // or removed by this stage either.
  private val BOUND_ATTR = Regex("""(\s+)([\w:.-]+)="(@\{[^}]*\})"""")
  private val DIMENSION_NAME = Regex(
    "(?i)width|height|margin|padding|size|elevation|translationX|translationY|translationZ|radius",
  )

  fun unwrap(content: String, lineMap: Preprocessor.LineMap, log: LogBridge): Result {
    val lines = content.lines()
    val layoutMatch = LAYOUT_OPEN_ANY.find(content)
    if (layoutMatch == null) {
      return Result(content, lineMap, unwrapped = false, bindingReplaced = false)
    }
    val layoutLineIdx = content.substring(0, layoutMatch.range.first).count { it == '\n' }
    val layoutOpenEndLineIdx = content.substring(0, layoutMatch.range.last + 1).count { it == '\n' }
    val closeLineIdx = lines.indexOfLast { LAYOUT_CLOSE.matches(it) }
    check(closeLineIdx > layoutOpenEndLineIdx) { "found <layout> without a matching closing </layout>" }

    val xmlnsAttrs = XMLNS_ATTR.findAll(layoutMatch.groupValues[1]).map { it.groupValues[1] to it.groupValues[2] }
      .toList()

    val removed = (layoutLineIdx..layoutOpenEndLineIdx).toMutableSet()
    removed += closeLineIdx
    val dataRange = findDataBlock(lines, layoutOpenEndLineIdx, closeLineIdx)
    if (dataRange != null) removed += dataRange

    val viewRootIdx = ((layoutOpenEndLineIdx + 1) until closeLineIdx)
      .firstOrNull { it !in removed && lines[it].isNotBlank() }

    val outLines = mutableListOf<String>()
    val newLineMap = mutableListOf<Int>()
    for (i in lines.indices) {
      if (i in removed) continue
      val text = if (i == viewRootIdx) injectXmlns(lines[i], xmlnsAttrs) else lines[i]
      outLines += text
      newLineMap += lineMap.originalLine(i + 1)
    }

    val unwrappedContent = outLines.joinToString("\n")
    val (finalContent, replaced) = replaceExpressions(unwrappedContent)
    if (replaced) log.recordBindingReplaced()

    return Result(finalContent, Preprocessor.LineMap(newLineMap), unwrapped = true, bindingReplaced = replaced)
  }

  /** Locates a `<data>`/`<data/>` block between the layout tags; null when the layout has none. */
  private fun findDataBlock(lines: List<String>, layoutLineIdx: Int, closeLineIdx: Int): IntRange? {
    for (i in (layoutLineIdx + 1) until closeLineIdx) {
      val line = lines[i]
      if (line.isBlank()) continue
      return when {
        DATA_SELF_CLOSE.matches(line) -> i..i
        DATA_OPEN.matches(line) -> {
          var j = i + 1
          while (j < closeLineIdx && !DATA_CLOSE.matches(lines[j])) j++
          i..j
        }
        else -> null // first non-blank content isn't <data>: this layout has none
      }
    }
    return null
  }

  private fun injectXmlns(tagLine: String, xmlnsAttrs: List<Pair<String, String>>): String {
    if (xmlnsAttrs.isEmpty()) return tagLine
    val nameMatch = TAG_NAME.find(tagLine) ?: return tagLine
    val insertPos = nameMatch.range.last + 1
    val toAdd = xmlnsAttrs.filterNot { (name, _) -> tagLine.contains("$name=") }
    if (toAdd.isEmpty()) return tagLine
    val injected = toAdd.joinToString("") { (name, value) -> " $name=\"$value\"" }
    return tagLine.substring(0, insertPos) + injected + tagLine.substring(insertPos)
  }

  private fun replaceExpressions(content: String): Pair<String, Boolean> {
    var any = false
    val out = BOUND_ATTR.replace(content) { m ->
      any = true
      val leadingWs = m.groupValues[1]
      val name = m.groupValues[2]
      val local = name.substringAfter(':')
      val defaultValue = when {
        local == "text" -> "\"binding\""
        local == "visibility" -> "\"visible\""
        DIMENSION_NAME.containsMatchIn(local) -> "\"0dp\""
        else -> null
      }
      if (defaultValue != null) "$leadingWs$name=$defaultValue" else leadingWs
    }
    return out to any
  }
}
