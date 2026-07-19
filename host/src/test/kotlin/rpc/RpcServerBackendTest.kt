package rpc

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T35 wiring item 4 (RPC lifecycle): with a [RenderBackend] factory supplied, `initialize` builds
 * the backend and `render`/`listThemes`/`invalidate` route through it (they returned stubs before).
 * A fake backend keeps this in the fast `test` gate — real render fidelity is covered engine-side.
 */
class RpcServerBackendTest {

  private val moshi = ProtocolMoshi.moshi
  private val anyAdapter = moshi.adapter(Any::class.java)

  private class FakeBackend : RenderBackend {
    var lastRequest: RenderRequest? = null
    var invalidatedPaths: List<String>? = null
    override fun render(request: RenderRequest): RenderResponse {
      lastRequest = request
      return RenderResponse(
        id = request.id,
        status = RenderStatus.ok,
        pngPath = "/out/${request.id}.png",
        imageWidth = 100,
        imageHeight = 200,
        warnings = emptyList(),
        error = null,
        dependencies = listOf("/dep/colors.xml"),
        timings = RenderTimings(1, 2, 3, 6),
        sessionRebuilt = true,
      )
    }

    override fun listThemes(roots: List<String>, packageName: String): List<ThemeInfo> =
      listOf(ThemeInfo(name = "AppTheme", isProjectTheme = true, source = ThemeSource.project))

    override fun invalidate(paths: List<String>): Boolean {
      invalidatedPaths = paths
      return paths.isNotEmpty()
    }
  }

  private fun frameBytes(json: String): ByteArray {
    val body = json.toByteArray(Charsets.UTF_8)
    return "Content-Length: ${body.size}\r\n\r\n".toByteArray(Charsets.US_ASCII) + body
  }

  private fun inputOf(vararg jsons: String): ByteArrayInputStream {
    val out = ByteArrayOutputStream()
    jsons.forEach { out.write(frameBytes(it)) }
    return ByteArrayInputStream(out.toByteArray())
  }

  private fun requestFrame(id: Int, method: String, params: String): String =
    """{"jsonrpc":"2.0","id":$id,"method":"$method","params":$params}"""

  private fun readResponses(bytes: ByteArray): Map<Int, Map<String, Any?>> {
    val reader = FrameReader(ByteArrayInputStream(bytes))
    val out = HashMap<Int, Map<String, Any?>>()
    while (true) {
      val frame = reader.readFrame() ?: break
      @Suppress("UNCHECKED_CAST")
      val env = anyAdapter.fromJson(frame) as Map<String, Any?>
      out[(env["id"] as Number).toInt()] = env
    }
    return out
  }

  private val initParams =
    """{"layoutlibRuntimeRoot":"/rt","layoutlibResourcesRoot":"/res","classpathNote":"assembled-by-launcher","libraryResDirs":[],"libraryPackages":[],"outputDir":"/out","overlayDir":"/ov","compileSdkVersion":34,"logLevel":"info"}"""

  private val renderParams =
    """{"id":7,"docPath":"/a.xml","docKind":"layout","roots":["/r"],"packageName":"pkg","config":{"themeName":"t","isProjectTheme":false,"night":false,"device":{"id":"phone","label":"Phone","widthDp":100,"heightDp":200,"defaultDensity":"mdpi","sizeBucket":"normal"},"orientation":"portrait","density":"mdpi","pixelScale":1},"timeoutMs":15000}"""

  @Test
  fun `render routes through the backend once initialized`() {
    val fake = FakeBackend()
    val output = ByteArrayOutputStream()
    RpcServer(
      inputOf(requestFrame(1, "initialize", initParams), requestFrame(2, "render", renderParams)),
      output,
      backendFactory = { fake },
    ).serve()

    val responses = readResponses(output.toByteArray())
    // initialize acked
    @Suppress("UNCHECKED_CAST")
    val initResult = responses.getValue(1)["result"] as Map<String, Any?>
    assertTrue((initResult["pinName"] as String).contains("paparazzi"))
    // render routed to the fake backend
    assertEquals(7, fake.lastRequest?.id)
    @Suppress("UNCHECKED_CAST")
    val renderResult = responses.getValue(2)["result"] as Map<String, Any?>
    assertNull(responses.getValue(2)["error"])
    assertEquals("ok", renderResult["status"])
    assertEquals("/out/7.png", renderResult["pngPath"])
  }

  @Test
  fun `listThemes and invalidate route through the backend`() {
    val fake = FakeBackend()
    val output = ByteArrayOutputStream()
    RpcServer(
      inputOf(
        requestFrame(1, "initialize", initParams),
        requestFrame(2, "listThemes", """{"roots":["/r"],"packageName":"pkg"}"""),
        requestFrame(3, "invalidate", """{"paths":["/r/values/colors.xml"]}"""),
      ),
      output,
      backendFactory = { fake },
    ).serve()

    val responses = readResponses(output.toByteArray())
    @Suppress("UNCHECKED_CAST")
    val themes = responses.getValue(2)["result"] as List<Map<String, Any?>>
    assertEquals("AppTheme", themes.single()["name"])
    assertEquals(listOf("/r/values/colors.xml"), fake.invalidatedPaths)
    @Suppress("UNCHECKED_CAST")
    val invResult = responses.getValue(3)["result"] as Map<String, Any?>
    assertEquals(true, invResult["rebuildScheduled"])
  }
}
