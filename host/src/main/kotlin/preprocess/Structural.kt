package preprocess

import java.io.File
import log.LogBridge

/**
 * T31 (LAY-02, spec include-cycle edge case): structural tag handling for `<merge>`, `<fragment>`,
 * `<ViewStub>` and `<include>` (P1-A AC4).
 *  - `<merge ...>` (assumed to be the file's root, its only legal position) is wrapped in a
 *    `match_parent` `FrameLayout`, carrying over any `xmlns:*` declarations.
 *  - `<fragment .../>` with an `android:layout="@layout/x"` attribute (copied from `tools:layout` by
 *    [ToolsAttributes], T29) is swapped for an `<include layout="@layout/x" .../>`; without one, it
 *    becomes a labeled placeholder box naming the fragment (`android:name`/`class`), with a notice.
 *  - `<ViewStub ...>` is left completely untouched — its collapsed state is layoutlib's own default.
 *  - Every `<include layout="@layout/x">` (including ones just produced from a fragment swap) is
 *    walked, following the on-disk include graph from [roots] with a visited-name set; a chain that
 *    re-enters a name already on the path (self-include or a longer cycle) aborts that top-level
 *    `<include>` with a placeholder and a notice naming the exact chain (e.g. `"a -> b -> a"`).
 *    Per design (only the previewed file's overlay is rewritable in v1), only the TOP-level
 *    `<include>` occurrence that leads into the cycle is replaced — descendant files on disk are
 *    read for graph-walking only, never rewritten.
 */
object Structural {

  data class Result(val content: String)

  private val MERGE_OPEN = Regex("""<merge\b([^>]*)>""")
  private val MERGE_CLOSE = Regex("""</merge>""")
  private val FRAGMENT_SELF_CLOSE = Regex("""<fragment\b([^>]*)/>""")
  private val INCLUDE_LAYOUT = Regex("""<include\b[^>]*\blayout="@layout/([\w.]+)"[^>]*/?>""")
  private val XMLNS_ATTR = Regex("""\s+xmlns:[\w.-]+="[^"]*"""")
  private val ATTR = Regex("""([\w:.-]+)="([^"]*)"""")

  private val CARRIED_FRAGMENT_ATTRS = setOf("android:id", "android:layout_width", "android:layout_height")

  fun process(content: String, docPath: File, roots: List<File>, log: LogBridge): Result {
    var working = wrapMerge(content)
    working = substituteFragments(working, log)
    working = resolveIncludeCycles(working, docPath, roots, log)
    return Result(working)
  }

  /** Wraps a root `<merge>` in a `match_parent` `FrameLayout` (P1-A AC4). Commented `<merge>` is ignored. */
  private fun wrapMerge(content: String): String {
    val spans = Comments.spans(content)
    val open = MERGE_OPEN.findAll(content).firstOrNull { !Comments.inComment(spans, it.range.first) } ?: return content
    val xmlns = XMLNS_ATTR.findAll(open.groupValues[1]).joinToString("") { it.value }
    val newOpen = """<FrameLayout$xmlns android:layout_width="match_parent" android:layout_height="match_parent">"""
    val rewritten = content.substring(0, open.range.first) + newOpen + content.substring(open.range.last + 1)
    val spans2 = Comments.spans(rewritten)
    val close = MERGE_CLOSE.findAll(rewritten).firstOrNull { !Comments.inComment(spans2, it.range.first) }
      ?: return rewritten
    return rewritten.substring(0, close.range.first) + "</FrameLayout>" + rewritten.substring(close.range.last + 1)
  }

  /** Swaps a `<fragment>` for an `<include>` of its `android:layout`, else a labeled placeholder. */
  private fun substituteFragments(content: String, log: LogBridge): String {
    val spans = Comments.spans(content)
    return FRAGMENT_SELF_CLOSE.replace(content) { m ->
      if (Comments.inComment(spans, m.range.first)) return@replace m.value
      val attrs = ATTR.findAll(m.groupValues[1]).associate { it.groupValues[1] to it.groupValues[2] }
      val carried = CARRIED_FRAGMENT_ATTRS.mapNotNull { name -> attrs[name]?.let { name to it } }
        .joinToString("") { (name, value) -> " $name=\"$value\"" }
      val layout = attrs["android:layout"]
      if (layout != null) {
        """<include layout="$layout"$carried />"""
      } else {
        val label = attrs["android:name"] ?: attrs["class"] ?: "fragment"
        log.recordNotice("fragment", "Fragment without tools:layout, rendered as placeholder: $label")
        """<TextView android:text="$label" android:gravity="center" android:background="#5566AACC"$carried />"""
      }
    }
  }

  /** Walks the `<include>` graph from [docPath]'s own resource name, aborting any cycle found. */
  private fun resolveIncludeCycles(content: String, docPath: File, roots: List<File>, log: LogBridge): String {
    val topName = docPath.nameWithoutExtension
    val spans = Comments.spans(content)
    return INCLUDE_LAYOUT.replace(content) { m ->
      if (Comments.inComment(spans, m.range.first)) return@replace m.value
      val name = m.groupValues[1]
      val cyclePath = findCycle(name, roots, mutableListOf(topName))
      if (cyclePath != null) {
        log.recordNotice("includeCycle", "Include cycle detected, aborted: $cyclePath")
        """<TextView android:text="Include cycle: $cyclePath" android:gravity="center" """ +
          """android:background="#5566AACC" />"""
      } else {
        m.value
      }
    }
  }

  /**
   * Depth-first search from [name]: if [name] is already in [path], the chain (path + name) is the
   * cycle. Otherwise resolves [name] to an on-disk layout under [roots] and recurses into its own
   * `<include>` targets. Returns the full `"a -> b -> a"` chain string when a cycle is found, else
   * null (including when [name] can't be resolved — a missing include is a different failure mode).
   */
  private fun findCycle(name: String, roots: List<File>, path: MutableList<String>): String? {
    if (name in path) return (path + name).joinToString(" -> ")
    val file = resolveLayoutFile(name, roots) ?: return null
    path.add(name)
    try {
      val childContent = file.readText()
      val childSpans = Comments.spans(childContent)
      for (childMatch in INCLUDE_LAYOUT.findAll(childContent)) {
        if (Comments.inComment(childSpans, childMatch.range.first)) continue
        val cycle = findCycle(childMatch.groupValues[1], roots, path)
        if (cycle != null) return cycle
      }
      return null
    } finally {
      path.removeAt(path.size - 1)
    }
  }

  private fun resolveLayoutFile(name: String, roots: List<File>): File? {
    for (root in roots) {
      val layoutDirs = root.listFiles { f -> f.isDirectory && (f.name == "layout" || f.name.startsWith("layout-")) }
        ?: emptyArray()
      for (dir in layoutDirs) {
        File(dir, "$name.xml").let { if (it.exists()) return it }
        File(dir, "$name.axml").let { if (it.exists()) return it }
      }
    }
    return null
  }
}
