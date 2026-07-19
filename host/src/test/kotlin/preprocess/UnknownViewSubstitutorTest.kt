package preprocess

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Unit coverage for the AD-007 plan-B tag substitution (M0 item 4 fallback). */
class UnknownViewSubstitutorTest {

  @Test
  fun `unknown fully-qualified tag becomes a labeled TextView`() {
    val xml = """<FrameLayout><com.example.FakeView android:layout_width="1dp" /></FrameLayout>"""
    val subs = mutableListOf<String>()
    val out = UnknownViewSubstitutor.substitute(xml, isLoadable = { false }, onSubstituted = { subs.add(it) })

    assertFalse(out.contains("com.example.FakeView<"), "the tag name should be replaced")
    assertTrue(out.contains("<TextView"), "should substitute a TextView")
    assertTrue(out.contains("""android:text="com.example.FakeView""""), "label names the class")
    assertTrue(out.contains("""android:layout_width="1dp""""), "original attributes are preserved")
    assertEquals(listOf("com.example.FakeView"), subs)
  }

  @Test
  fun `loadable classes are left untouched`() {
    val xml = """<androidx.constraintlayout.widget.ConstraintLayout />"""
    val subs = mutableListOf<String>()
    val out = UnknownViewSubstitutor.substitute(xml, isLoadable = { true }, onSubstituted = { subs.add(it) })
    assertEquals(xml, out)
    assertTrue(subs.isEmpty())
  }

  @Test
  fun `open-close custom tag rewrites both ends`() {
    val xml = """<com.example.Foo><TextView /></com.example.Foo>"""
    val out = UnknownViewSubstitutor.substitute(xml, isLoadable = { false }, onSubstituted = {})
    assertTrue(out.startsWith("<TextView"))
    assertTrue(out.endsWith("</TextView>"))
    assertFalse(out.contains("<com.example.Foo"), "no opening custom tag should remain")
    assertFalse(out.contains("</com.example.Foo>"), "no closing custom tag should remain")
    assertTrue(out.contains("android:text=\"com.example.Foo\""), "label names the class")
  }

  @Test
  fun `plain framework tags without a dot are ignored`() {
    val xml = """<LinearLayout><TextView /></LinearLayout>"""
    val out = UnknownViewSubstitutor.substitute(xml, isLoadable = { false }, onSubstituted = {})
    assertEquals(xml, out)
  }
}
