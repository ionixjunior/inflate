package preprocess

import log.LogBridge
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T30 unit coverage — `<layout>` root unwrap with line-map shift tracking, `@{...}` expression
 * defaults per attribute kind, the once-per-file `bindingReplaced` notice, and pass-through for
 * non-data-binding files (LAY-04 data-binding half, P1-A AC6).
 */
class DataBindingTest {

  @Test
  fun `unwraps a layout root, drops data, promotes the view child, and shifts the lineMap`() {
    val original = """
      |<?xml version="1.0" encoding="utf-8"?>
      |<layout xmlns:android="http://schemas.android.com/apk/res/android">
      |    <data>
      |        <variable name="user" type="com.example.User" />
      |    </data>
      |    <TextView
      |        android:text="@{user.name}" />
      |</layout>
    """.trimMargin()
    val log = LogBridge()

    val result = DataBinding.unwrap(original, Preprocessor.LineMap.identity(original), log)

    assertTrue(result.unwrapped)
    assertFalse(result.content.contains("<layout"), "layout root must be dropped")
    assertFalse(result.content.contains("<data"), "data block must be dropped")
    assertFalse(result.content.contains("</layout>"))
    assertTrue(result.content.contains("xmlns:android"), "namespace decl must move to the promoted root")

    // lineMap shift: original line 6 (`<TextView`, now the root) is overlay line 2; original line 7
    // (the bound attribute, now holding the replaced default) is overlay line 3 — the removed
    // <layout>/<data> lines above it shift everything below by 4.
    assertEquals(3, result.lineMap.size)
    assertEquals(1, result.lineMap.originalLine(1))
    assertEquals(6, result.lineMap.originalLine(2))
    assertEquals(7, result.lineMap.originalLine(3))
  }

  @Test
  fun `text visibility and dimension expressions get type-appropriate defaults, others are dropped`() {
    val original = """
      |<layout xmlns:android="http://schemas.android.com/apk/res/android"
      |    xmlns:app="http://schemas.android.com/apk/res-auto">
      |    <TextView
      |        android:text="@{user.name}"
      |        android:visibility="@{user.visible}"
      |        android:layout_width="@{user.width}"
      |        app:customProp="@{user.custom}" />
      |</layout>
    """.trimMargin()

    val result = DataBinding.unwrap(original, Preprocessor.LineMap.identity(original), LogBridge())

    assertTrue(result.content.contains("""android:text="binding""""), "text default")
    assertTrue(result.content.contains("""android:visibility="visible""""), "visibility default")
    assertTrue(result.content.contains("""android:layout_width="0dp""""), "dimension default")
    assertFalse(result.content.contains("customProp"), "an attribute with no known default is dropped")
    assertFalse(result.content.contains("@{"), "no raw expression survives")
  }

  @Test
  fun `bindingReplaced notice is emitted exactly once per file regardless of expression count`() {
    val original = """
      |<layout xmlns:android="http://schemas.android.com/apk/res/android">
      |    <TextView
      |        android:text="@{user.name}"
      |        android:visibility="@{user.visible}" />
      |</layout>
    """.trimMargin()
    val log = LogBridge()

    val result = DataBinding.unwrap(original, Preprocessor.LineMap.identity(original), log)

    assertTrue(result.bindingReplaced)
    val notices = log.warnings().filter { it.kind == LogBridge.Kind.bindingReplaced }
    assertEquals(1, notices.size, "exactly one notice regardless of how many expressions were replaced")
  }

  @Test
  fun `a file whose root is not layout is returned untouched`() {
    val original = "<LinearLayout><TextView android:text=\"literal\" /></LinearLayout>"
    val log = LogBridge()
    val identity = Preprocessor.LineMap.identity(original)

    val result = DataBinding.unwrap(original, identity, log)

    assertFalse(result.unwrapped)
    assertFalse(result.bindingReplaced)
    assertEquals(original, result.content)
    assertTrue(log.warnings().isEmpty())
    for (line in 1..identity.size) {
      assertEquals(identity.originalLine(line), result.lineMap.originalLine(line))
    }
  }
}
