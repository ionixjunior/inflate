package log

import com.android.ide.common.rendering.api.ILayoutLog

/**
 * Per-render log sink (design §17, UX-05). Implements layoutlib's [ILayoutLog] so render-time
 * framework messages can be collected, and exposes [recordSubstitutedClass] for the preprocessor
 * class pre-scan (AD-007). It NEVER throws — unlike Paparazzi's `PaparazziLogger.assertNoErrors`,
 * a logging sink must not abort a render.
 */
class LogBridge : ILayoutLog {

  enum class Severity { WARNING, ERROR }

  /** Warning categories surfaced in the preview warnings strip. */
  enum class Kind { unresolvedRef, substitutedClass, bindingReplaced, levelDefault, notice, error }

  data class Entry(
    val kind: Kind,
    val severity: Severity,
    val tag: String?,
    val message: String,
    val throwable: Throwable?,
  )

  private val collected = mutableListOf<Entry>()

  fun entries(): List<Entry> = synchronized(collected) { collected.toList() }
  fun warnings(): List<Entry> = entries().filter { it.severity == Severity.WARNING }
  fun errors(): List<Entry> = entries().filter { it.severity == Severity.ERROR }
  fun clear() {
    synchronized(collected) { collected.clear() }
  }

  private fun add(entry: Entry) {
    synchronized(collected) { collected.add(entry) }
  }

  /**
   * Record an unresolved resource reference that was degraded per-kind (RES-04). [tag] is
   * `"resource"` for a `@kind/name` reference and `"styleParent"` for a degraded style parent, so
   * callers can partition the two while both surface as [Kind.unresolvedRef] warnings.
   */
  fun recordUnresolvedRef(refKind: String, name: String) {
    add(
      Entry(
        kind = Kind.unresolvedRef,
        severity = Severity.WARNING,
        tag = "resource",
        message = "Unresolved @$refKind/$name — degraded",
        throwable = null,
      ),
    )
  }

  /** Record a style whose parent could not be resolved and was degraded to [resolvedTo] (or dropped). */
  fun recordStyleParentDegraded(requestedParent: String, resolvedTo: String?) {
    add(
      Entry(
        kind = Kind.unresolvedRef,
        severity = Severity.WARNING,
        tag = "styleParent",
        message = "Unresolved style parent $requestedParent — degraded to ${resolvedTo ?: "no parent"}",
        throwable = null,
      ),
    )
  }

  /** Record a view class layoutlib cannot load (rendered as a MockView placeholder — AD-007). */
  fun recordSubstitutedClass(className: String, throwable: Throwable? = null) {
    add(
      Entry(
        kind = Kind.substitutedClass,
        severity = Severity.WARNING,
        tag = "class",
        message = "View class not found, rendered as placeholder: $className",
        throwable = throwable,
      ),
    )
  }

  /**
   * Record that a data-binding layout's `@{...}` expressions were replaced with static,
   * type-appropriate defaults during preprocessing (LAY-04, P1-A AC6). Emitted once per file.
   */
  fun recordBindingReplaced() {
    add(
      Entry(
        kind = Kind.bindingReplaced,
        severity = Severity.WARNING,
        tag = "databinding",
        message = "Binding expressions replaced with static defaults",
        throwable = null,
      ),
    )
  }

  // --- ILayoutLog sink (all overrides swallow exceptions; a log call must never fail a render) ---

  override fun warning(tag: String?, message: String?, viewCookie: Any?, data: Any?) {
    safe { add(Entry(kindForTag(tag), Severity.WARNING, tag, message.orEmpty(), null)) }
  }

  override fun fidelityWarning(tag: String?, message: String?, throwable: Throwable?, cookie: Any?, data: Any?) {
    safe { add(Entry(Kind.notice, Severity.WARNING, tag, message.orEmpty(), throwable)) }
  }

  override fun error(tag: String?, message: String?, viewCookie: Any?, data: Any?) {
    safe { add(Entry(Kind.error, Severity.ERROR, tag, message.orEmpty(), null)) }
  }

  override fun error(tag: String?, message: String?, throwable: Throwable?, viewCookie: Any?, data: Any?) {
    safe { add(Entry(Kind.error, Severity.ERROR, tag, message ?: throwable?.message.orEmpty(), throwable)) }
  }

  override fun logAndroidFramework(priority: Int, tag: String?, message: String?) {
    safe { add(Entry(Kind.notice, Severity.WARNING, tag, message.orEmpty(), null)) }
  }

  private fun kindForTag(tag: String?): Kind = when (tag) {
    ILayoutLog.TAG_RESOURCES_RESOLVE, ILayoutLog.TAG_RESOURCES_RESOLVE_THEME_ATTR -> Kind.unresolvedRef
    else -> Kind.notice
  }

  private inline fun safe(block: () -> Unit) {
    try {
      block()
    } catch (_: Throwable) {
      // A logging sink must never throw and abort a render.
    }
  }
}
