package preprocess

import log.LogBridge
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T32 unit coverage — `@kind/name` reference collection (deduped, framework refs excluded) and the
 * custom/unknown-view class scan for both the fully-qualified-tag and `<view class="...">` forms
 * (LAY-03 scan half, UX-02).
 */
class ScanTest {

  @Test
  fun `every reference kind is collected exactly once, framework refs excluded`() {
    val xml = """
      <LinearLayout>
        <TextView android:text="@string/hello" android:textColor="@color/red" />
        <TextView android:text="@string/hello" />
        <ImageView android:src="@drawable/icon" />
        <View android:id="@+id/newId" />
        <View android:id="@id/existingId" />
        <TextView android:background="@android:color/white" />
      </LinearLayout>
    """.trimIndent()

    val result = Scan.scan(xml, isLoadable = { true }, LogBridge())

    val refs = result.referencedResources
    assertEquals(5, refs.size, "duplicate @string/hello must be counted once, framework ref excluded")
    assertTrue(refs.contains(Preprocessor.Ref("string", "hello")))
    assertTrue(refs.contains(Preprocessor.Ref("color", "red")))
    assertTrue(refs.contains(Preprocessor.Ref("drawable", "icon")))
    assertTrue(refs.contains(Preprocessor.Ref("id", "newId")))
    assertTrue(refs.contains(Preprocessor.Ref("id", "existingId")))
    assertFalse(refs.any { it.name == "white" }, "@android:color/white is a framework ref, not tracked")
  }

  @Test
  fun `framework and androidx tags are never flagged as custom classes`() {
    val xml = "<LinearLayout><androidx.constraintlayout.widget.ConstraintLayout /></LinearLayout>"

    val result = Scan.scan(xml, isLoadable = { true }, LogBridge())

    assertTrue(result.customClasses.isEmpty())
    assertEquals(xml, result.content)
  }

  @Test
  fun `an unknown fully-qualified tag is flagged and substituted`() {
    val xml = "<FrameLayout><com.example.FakeView /></FrameLayout>"
    val log = LogBridge()

    val result = Scan.scan(xml, isLoadable = { false }, log)

    assertEquals(listOf("com.example.FakeView"), result.customClasses)
    assertTrue(result.content.contains("<TextView"))
    assertEquals(1, log.warnings().size)
  }

  @Test
  fun `a loadable view class= form is left untouched`() {
    val xml = """<view class="com.example.Loadable" android:id="@+id/a" />"""

    val result = Scan.scan(xml, isLoadable = { it == "com.example.Loadable" }, LogBridge())

    assertEquals(xml, result.content)
    assertTrue(result.customClasses.isEmpty())
  }

  @Test
  fun `an unloadable view class= form is substituted, carrying other attributes`() {
    val xml = """<view class="com.example.Unloadable" android:id="@+id/b" />"""
    val log = LogBridge()

    val result = Scan.scan(xml, isLoadable = { false }, log)

    assertEquals(listOf("com.example.Unloadable"), result.customClasses)
    assertTrue(result.content.contains("<TextView"))
    assertTrue(result.content.contains("""android:text="com.example.Unloadable""""))
    assertTrue(result.content.contains("""android:id="@+id/b""""), "other attributes are carried over")
    assertFalse(result.content.contains("class="), "the class= attribute itself must not survive")
    assertEquals(1, log.warnings().size)
  }
}
