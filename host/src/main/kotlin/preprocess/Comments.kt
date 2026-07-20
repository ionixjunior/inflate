package preprocess

/**
 * G1 (LAY-02/LAY-04, P1-A AC4/AC6) — XML comment detection so the regex-based transform stages
 * ([Structural], [DataBinding], [Scan]) never rewrite tag-like text that lives inside a
 * `<!-- … -->` comment. Rather than mask/restore (which would perturb offsets and line numbers and
 * risk corrupting comment bytes), each stage computes the comment spans of its CURRENT content and
 * skips any regex match whose start falls inside a comment. Because no stage ever modifies a
 * comment, comments survive byte-identical into the overlay and [Preprocessor.LineMap] stays correct.
 */
object Comments {

  // XML comments cannot contain "--", so a non-greedy body up to the first "-->" is exact.
  // DOT_MATCHES_ALL lets a single comment span multiple lines.
  private val COMMENT = Regex("""<!--.*?-->""", RegexOption.DOT_MATCHES_ALL)

  /** Character ranges (inclusive) of every `<!-- … -->` comment in [content], in document order. */
  fun spans(content: String): List<IntRange> = COMMENT.findAll(content).map { it.range }.toList()

  /** True if the character at [index] falls inside any of the given comment [spans]. */
  fun inComment(spans: List<IntRange>, index: Int): Boolean = spans.any { index in it }
}
