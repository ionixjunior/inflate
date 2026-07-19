package log

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertDoesNotThrow

/** Unit coverage for LogBridge severity mapping and its never-throws guarantee (design §17). */
class LogBridgeTest {

  @Test
  fun `error calls map to ERROR severity`() {
    val bridge = LogBridge()
    bridge.error("tag", "boom", null, null)
    bridge.error("tag", "boom2", RuntimeException("x"), null, null)
    assertEquals(2, bridge.errors().size)
    assertTrue(bridge.warnings().isEmpty())
    assertEquals(LogBridge.Kind.error, bridge.errors().first().kind)
  }

  @Test
  fun `warning, fidelityWarning and logAndroidFramework map to WARNING severity`() {
    val bridge = LogBridge()
    bridge.warning("tag", "w", null, null)
    bridge.fidelityWarning("tag", "f", null, null, null)
    bridge.logAndroidFramework(3, "tag", "a")
    assertEquals(3, bridge.warnings().size)
    assertTrue(bridge.errors().isEmpty())
  }

  @Test
  fun `substituted class is recorded as a substitutedClass warning naming the class`() {
    val bridge = LogBridge()
    bridge.recordSubstitutedClass("com.example.FakeView")
    val entry = bridge.warnings().single()
    assertEquals(LogBridge.Kind.substitutedClass, entry.kind)
    assertTrue(entry.message.contains("com.example.FakeView"))
  }

  @Test
  fun `resource-resolve warnings map to the unresolvedRef kind`() {
    val bridge = LogBridge()
    bridge.warning(com.android.ide.common.rendering.api.ILayoutLog.TAG_RESOURCES_RESOLVE, "missing", null, null)
    assertEquals(LogBridge.Kind.unresolvedRef, bridge.warnings().single().kind)
  }

  @Test
  fun `sink never throws even with null arguments`() {
    val bridge = LogBridge()
    assertDoesNotThrow {
      bridge.warning(null, null, null, null)
      bridge.error(null, null, null, null)
      bridge.error(null, null, null, null, null)
      bridge.fidelityWarning(null, null, null, null, null)
      bridge.logAndroidFramework(0, null, null)
    }
    // Entries were still recorded (5 calls).
    assertEquals(5, bridge.entries().size)
  }

  @Test
  fun `clear empties the sink`() {
    val bridge = LogBridge()
    bridge.warning("t", "m", null, null)
    bridge.clear()
    assertTrue(bridge.entries().isEmpty())
  }
}
