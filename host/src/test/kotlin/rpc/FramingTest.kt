package rpc

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

/** T13 framing coverage (design §D5, AD-010): fragmentation tolerance, back-to-back frames,
 * MB-scale payloads, and malformed-header rejection — independent of JSON-RPC semantics. */
class FramingTest {

  /** Wraps [delegate] but returns at most [chunk] bytes per multi-byte read() call, simulating a
   * pipe that delivers a frame's bytes across many small OS reads. */
  private class FragmentingInputStream(private val delegate: InputStream, private val chunk: Int) : InputStream() {
    override fun read(): Int = delegate.read()
    override fun read(b: ByteArray, off: Int, len: Int): Int = delegate.read(b, off, minOf(len, chunk))
  }

  private fun frameBytes(json: String): ByteArray {
    val body = json.toByteArray(Charsets.UTF_8)
    val header = "Content-Length: ${body.size}\r\n\r\n".toByteArray(Charsets.US_ASCII)
    return header + body
  }

  @Test
  fun `reads a frame delivered across many fragmented reads`() {
    val json = """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""
    val bytes = frameBytes(json)
    val reader = FrameReader(FragmentingInputStream(ByteArrayInputStream(bytes), chunk = 3))
    assertEquals(json, reader.readFrame())
  }

  @Test
  fun `reads two frames arriving back-to-back in one buffer`() {
    val first = """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""
    val second = """{"jsonrpc":"2.0","id":2,"method":"shutdown","params":{}}"""
    val combined = frameBytes(first) + frameBytes(second)
    val reader = FrameReader(ByteArrayInputStream(combined))
    assertEquals(first, reader.readFrame())
    assertEquals(second, reader.readFrame())
    assertNull(reader.readFrame())
  }

  @Test
  fun `round-trips a megabyte-scale payload`() {
    val bigString = "x".repeat(2_000_000)
    val json = """{"jsonrpc":"2.0","id":1,"method":"render","params":{"data":"$bigString"}}"""
    val out = ByteArrayOutputStream()
    FrameWriter(out).writeFrame(json)
    val reader = FrameReader(ByteArrayInputStream(out.toByteArray()))
    val result = reader.readFrame()
    assertEquals(json.length, result?.length)
    assertEquals(json, result)
  }

  @Test
  fun `rejects a header block with no Content-Length`() {
    val malformed = "X-Foo: bar\r\n\r\n{}".toByteArray(Charsets.US_ASCII)
    val reader = FrameReader(ByteArrayInputStream(malformed))
    val ex = assertThrows(FramingException::class.java) { reader.readFrame() }
    assertEquals(true, ex.message?.contains("Content-Length"))
  }

  @Test
  fun `rejects a Content-Length value that is not a number`() {
    val malformed = "Content-Length: not-a-number\r\n\r\n{}".toByteArray(Charsets.US_ASCII)
    val reader = FrameReader(ByteArrayInputStream(malformed))
    val ex = assertThrows(FramingException::class.java) { reader.readFrame() }
    assertEquals(true, ex.message?.contains("not-a-number"))
  }

  @Test
  fun `readFrame returns null on clean EOF before any bytes arrive`() {
    val reader = FrameReader(ByteArrayInputStream(ByteArray(0)))
    assertNull(reader.readFrame())
  }
}
