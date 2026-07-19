package rpc

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicInteger
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T13 coverage: JSON-RPC dispatch semantics over piped byte streams — [RpcServer] only depends on
 * `InputStream`/`OutputStream`, so no real subprocess is needed to exercise it (design §D5/§11).
 */
class RpcServerTest {

  private val moshi = ProtocolMoshi.moshi
  private val anyAdapter = moshi.adapter(Any::class.java)

  private fun requestFrame(id: Int, method: String, paramsJson: String = "{}"): String =
    """{"jsonrpc":"2.0","id":$id,"method":"$method","params":$paramsJson}"""

  private fun frameBytes(json: String): ByteArray {
    val body = json.toByteArray(Charsets.UTF_8)
    val header = "Content-Length: ${body.size}\r\n\r\n".toByteArray(Charsets.US_ASCII)
    return header + body
  }

  private fun inputOf(vararg jsons: String): ByteArrayInputStream {
    val out = ByteArrayOutputStream()
    jsons.forEach { out.write(frameBytes(it)) }
    return ByteArrayInputStream(out.toByteArray())
  }

  /** Reads every frame written to [outputBytes] back into a parsed JSON-RPC envelope map. */
  private fun readResponses(outputBytes: ByteArray): List<Map<String, Any?>> {
    val reader = FrameReader(ByteArrayInputStream(outputBytes))
    val responses = mutableListOf<Map<String, Any?>>()
    while (true) {
      val frame = reader.readFrame() ?: break
      @Suppress("UNCHECKED_CAST")
      responses.add(anyAdapter.fromJson(frame) as Map<String, Any?>)
    }
    return responses
  }

  @Test
  fun `initialize request produces a result response naming the engine pin`() {
    val input = inputOf(requestFrame(1, "initialize"))
    val output = ByteArrayOutputStream()
    RpcServer(input, output).serve()

    val responses = readResponses(output.toByteArray())
    assertEquals(1, responses.size)
    val response = responses.single()
    assertNull(response["error"])
    @Suppress("UNCHECKED_CAST")
    val result = response["result"] as Map<String, Any?>
    assertTrue((result["pinName"] as String).contains("paparazzi"))
  }

  @Test
  fun `unknown method produces a JSON-RPC method-not-found error`() {
    val input = inputOf(requestFrame(1, "definitelyNotAMethod"))
    val output = ByteArrayOutputStream()
    RpcServer(input, output).serve()

    val responses = readResponses(output.toByteArray())
    assertEquals(1, responses.size)
    @Suppress("UNCHECKED_CAST")
    val error = responses.single()["error"] as Map<String, Any?>
    assertEquals(-32601.0, (error["code"] as Number).toDouble())
    assertTrue((error["message"] as String).contains("definitelyNotAMethod"))
  }

  @Test
  fun `stdin close before any request exits serve cleanly with no output`() {
    val input = ByteArrayInputStream(ByteArray(0))
    val output = ByteArrayOutputStream()
    // A hung serve() call would fail this test via the suite's default JUnit timeout.
    RpcServer(input, output).serve()
    assertEquals(0, output.toByteArray().size)
  }

  @Test
  fun `render request stub returns a structured error RenderResponse (T13 scope)`() {
    val input = inputOf(requestFrame(1, "render", """{"id":1,"docPath":"/a.xml","docKind":"layout","roots":[],"packageName":"p","config":{"themeName":"t","isProjectTheme":false,"night":false,"device":{"id":"phone","label":"Phone","widthDp":1,"heightDp":1,"defaultDensity":"xhdpi","sizeBucket":"normal"},"orientation":"portrait","density":"xhdpi","pixelScale":1},"timeoutMs":15000}"""))
    val output = ByteArrayOutputStream()
    RpcServer(input, output).serve()

    val response = readResponses(output.toByteArray()).single()
    assertNull(response["error"]) // this is a structured DTO-level error, not a protocol-level one
    @Suppress("UNCHECKED_CAST")
    val result = response["result"] as Map<String, Any?>
    assertEquals("error", result["status"])
    @Suppress("UNCHECKED_CAST")
    val domainError = result["error"] as Map<String, Any?>
    assertTrue((domainError["message"] as String).contains("not yet implemented"))
  }

  @Test
  fun `render-thread exception yields an error response and the next request still succeeds`() {
    val callCount = AtomicInteger(0)
    val overrides = mapOf<String, (String) -> String>(
      "render" to { _ ->
        if (callCount.getAndIncrement() == 0) {
          throw RuntimeException("boom")
        }
        """{"handled":true}"""
      },
    )
    val input = inputOf(requestFrame(1, "render"), requestFrame(2, "render"))
    val output = ByteArrayOutputStream()
    RpcServer(input, output, overrideHandlers = overrides).serve()

    val responses = readResponses(output.toByteArray()).associateBy { (it["id"] as Number).toInt() }
    assertEquals(2, responses.size)

    val first = responses.getValue(1)
    assertNotNull(first["error"])
    @Suppress("UNCHECKED_CAST")
    val firstError = first["error"] as Map<String, Any?>
    assertTrue((firstError["message"] as String).contains("boom"))

    val second = responses.getValue(2)
    assertNull(second["error"])
    assertEquals(mapOf("handled" to true), second["result"])
  }
}
