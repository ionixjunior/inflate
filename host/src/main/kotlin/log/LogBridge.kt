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
