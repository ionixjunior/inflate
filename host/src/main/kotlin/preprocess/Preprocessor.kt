package preprocess

import java.io.File
import java.io.StringReader
import java.security.MessageDigest
import log.LogBridge
import org.kxml2.io.KXmlParser
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserException
import rpc.DocKind

/**
 * Preprocessor core (T28, LAY-04/UX-04): validates the previewed file's well-formedness with a
 * namespace-aware kxml2 pull-parse (1-based line/col surfaced on failure, UX-04), then emits a
 * shadow-overlay copy under a unique per-document name so the on-disk project is never modified
 * (design Q3, spec §Architecture). [lineMap] tracks how overlay line numbers relate back to the
 * original file's line numbers so later render-time errors can be mapped back precisely (P1-A AC3).
 *
 * This module is the skeleton the rest of Phase 5 extends in place, in dependency order:
 * T29 ([ToolsAttributes]) -> T30 ([DataBinding]) -> T31 ([Structural]) -> T32 ([Scan]).
 */
object Preprocessor {

  /** A resolved `@kind/name` resource reference found in the previewed file (T32, UX-02). */
  data class Ref(val kind: String, val name: String)

  /** A 1-based line/column XML syntax error surfaced by the kxml2 parse (UX-04, P1-A AC3). */
  data class SyntaxError(val line: Int, val column: Int, val message: String)

  /**
   * Maps 1-based overlay (post-preprocessing) line numbers back to the original file's 1-based
   * line numbers, so a render-time error reported against the overlay content can be shown against
   * the file the user actually has open (UX-04). Untouched lines map to themselves (identity).
   */
  data class LineMap(private val overlayToOriginal: List<Int>) {

    /** Number of lines this map covers (the overlay's line count). */
    val size: Int get() = overlayToOriginal.size

    /** 1-based overlay line -> 1-based original line. Out-of-range clamps to the nearest known line. */
    fun originalLine(overlayLine: Int): Int {
      if (overlayToOriginal.isEmpty()) return overlayLine
      val index = (overlayLine - 1).coerceIn(0, overlayToOriginal.size - 1)
      return overlayToOriginal[index]
    }

    companion object {
      /** An identity map sized to [content]'s line count: overlay line N -> original line N. */
      fun identity(content: String): LineMap = LineMap((1..content.lines().size).toList())
    }
  }

  /**
   * Result of preprocessing one previewed file (design §13 interface). [overlayFile] and
   * [syntaxError] are mutually exclusive: a syntax error means no overlay was written.
   */
  data class PreprocessResult(
    val overlayFile: File?,
    val lineMap: LineMap,
    val warnings: List<LogBridge.Entry>,
    val referencedResources: List<Ref>,
    val customClasses: List<String>,
    val syntaxError: SyntaxError?,
  )

  /**
   * Preprocess [content] (the previewed file's buffer/disk text, kind [docKind], originally at
   * [docPath]) for rendering. [roots] are the project's resource roots (used by later pipeline
   * stages to resolve `<include>` targets, e.g. T31's cycle detection) — T28 itself does not need
   * them. Returns a [PreprocessResult] with either a written [PreprocessResult.overlayFile] or a
   * [PreprocessResult.syntaxError], never both.
   */
  fun preprocess(
    content: String,
    docKind: DocKind,
    docPath: File,
    roots: List<File>,
    overlayBaseDir: File = defaultOverlayBaseDir(),
    log: LogBridge = LogBridge(),
  ): PreprocessResult {
    val error = validate(content)
    if (error != null) {
      return PreprocessResult(
        overlayFile = null,
        lineMap = LineMap.identity(content),
        warnings = log.warnings(),
        referencedResources = emptyList(),
        customClasses = emptyList(),
        syntaxError = error,
      )
    }

    val overlayFile = writeOverlay(content, docKind, docPath, overlayBaseDir)

    return PreprocessResult(
      overlayFile = overlayFile,
      lineMap = LineMap.identity(content),
      warnings = log.warnings(),
      referencedResources = emptyList(),
      customClasses = emptyList(),
      syntaxError = null,
    )
  }

  /** Namespace-aware well-formedness check. Returns the 1-based line/col error, or null if valid. */
  private fun validate(content: String): SyntaxError? {
    return try {
      val parser = KXmlParser()
      parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
      parser.setInput(StringReader(content))
      var event = parser.eventType
      while (event != XmlPullParser.END_DOCUMENT) {
        event = parser.next()
      }
      null
    } catch (e: XmlPullParserException) {
      SyntaxError(line = e.lineNumber, column = e.columnNumber, message = e.message ?: "XML syntax error")
    }
  }

  /** Writes [content] to `<overlayBaseDir>/res/<type dir>/inflate_preview__<sha1(docPath)>.xml`. */
  private fun writeOverlay(content: String, docKind: DocKind, docPath: File, overlayBaseDir: File): File {
    val typeDir = docPath.parentFile?.name ?: docKind.name
    val dir = File(overlayBaseDir, "res/$typeDir").apply { mkdirs() }
    val file = File(dir, "inflate_preview__${sha1(docPath.path)}.xml")
    file.writeText(content)
    return file
  }

  private fun sha1(input: String): String {
    val digest = MessageDigest.getInstance("SHA-1").digest(input.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  /**
   * A single fixed overlay location for the whole host process (design "fixed overlay dir"),
   * deliberately outside any project resource root so the on-disk project is never touched (Q3).
   * Callers needing determinism across runs (or test isolation) pass an explicit [overlayBaseDir].
   */
  private fun defaultOverlayBaseDir(): File = File(System.getProperty("java.io.tmpdir"), "inflate-overlay")
}
