package rpc

import com.squareup.moshi.JsonDataException
import com.squareup.moshi.Types
import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T12 unit coverage: the shared protocol fixtures (JSON files under `docs/protocol/fixtures`, authored in
 * T10) round-trip through the moshi DTOs byte-equivalently (modulo key order and the one
 * documented unknown-field-tolerance probe), and the deliberately-invalid fixtures are rejected
 * naming the missing field — mirroring `extension/src/protocol.test.ts` (T11) on the other side of
 * the protocol (design §Data Models, AD-010).
 */
class DtoTest {

  private val moshi = ProtocolMoshi.moshi
  // moshi's built-in `Any` adapter maps JSON objects -> Map<String, Any?> and JSON arrays ->
  // List<Any?>, so it works as a canonical comparator for both the object-shaped and
  // array-shaped fixtures (theme-info-list.json / device-presets.json) alike.
  private val anyAdapter = moshi.adapter(Any::class.java)

  /** Fixtures live at the repo root; Gradle test tasks run with the module dir (`host/`) as cwd. */
  private fun fixture(relativePath: String): String =
    File("../docs/protocol/fixtures", relativePath).readText()

  private fun canonical(json: String): Any? = anyAdapter.fromJson(json)

  @Suppress("UNCHECKED_CAST")
  private fun stripKeys(value: Any?, ignoreKeys: Set<String>): Any? =
    if (value is Map<*, *> && ignoreKeys.isNotEmpty()) {
      (value as Map<String, Any?>).filterKeys { it !in ignoreKeys }
    } else {
      value
    }

  /** Parses [json] with [adapterFor], re-serializes it, and asserts the two canonical forms match
   * modulo any keys in [ignoreKeys] (used only for the one fixture with an intentional unknown
   * field probing tolerance — that field is never expected to survive a round trip). */
  private fun <T> assertRoundTrips(json: String, adapterFor: (String) -> T, toJson: (T) -> String, ignoreKeys: Set<String> = emptySet()) {
    val parsed = adapterFor(json)
    val reserialized = toJson(parsed)
    val original = stripKeys(canonical(json), ignoreKeys)
    val roundTripped = canonical(reserialized)
    assertEquals(original, roundTripped)
  }

  @Test
  fun `render-request round-trips and tolerates the unknown _extra field`() {
    val adapter = moshi.adapter(RenderRequest::class.java)
    val json = fixture("render-request.json")
    val request = adapter.fromJson(json)!!
    assertEquals(42, request.id)
    assertEquals(DocKind.layout, request.docKind)
    assertEquals("com.example.app", request.packageName)
    assertEquals("phone", request.config.device.id)
    assertEquals(listOf(DrawableState.pressed), request.config.drawable?.states)
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) }, ignoreKeys = setOf("_extra"))
  }

  @Test
  fun `render-response-ok round-trips as the ok variant`() {
    val adapter = moshi.adapter(RenderResponse::class.java)
    val json = fixture("render-response-ok.json")
    val response = adapter.fromJson(json)!!
    assertEquals(RenderStatus.ok, response.status)
    assertEquals(
      "/Users/dev/.config/Code/User/globalStorage/inflate/session/win-1/renders/42.png",
      response.pngPath,
    )
    assertEquals(false, response.sessionRebuilt)
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) })
  }

  @Test
  fun `render-response-error round-trips as the error variant with no pngPath`() {
    val adapter = moshi.adapter(RenderResponse::class.java)
    val json = fixture("render-response-error.json")
    val response = adapter.fromJson(json)!!
    assertEquals(RenderStatus.error, response.status)
    assertEquals(null, response.pngPath)
    assertEquals("method not yet implemented: render", response.error?.message)
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) })
  }

  @Test
  fun `render-response-warnings round-trips with all 6 warning kinds`() {
    val adapter = moshi.adapter(RenderResponse::class.java)
    val json = fixture("render-response-warnings.json")
    val response = adapter.fromJson(json)!!
    assertEquals(
      listOf(
        WarningKind.unresolvedRef,
        WarningKind.substitutedClass,
        WarningKind.bindingReplaced,
        WarningKind.levelDefault,
        WarningKind.notice,
        WarningKind.materialAttrMissing,
      ),
      response.warnings.map { it.kind },
    )
    assertEquals(true, response.canvasCapped)
    assertEquals(MatchedStateItem(2, listOf("state_pressed")), response.matchedStateItem)
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) })
  }

  @Test
  fun `initialize-params round-trips`() {
    val adapter = moshi.adapter(InitializeParams::class.java)
    val json = fixture("initialize-params.json")
    val params = adapter.fromJson(json)!!
    assertEquals(34, params.compileSdkVersion)
    assertEquals(LogLevel.info, params.logLevel)
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) })
  }

  @Test
  fun `theme-info-list round-trips with one entry per source`() {
    val adapter = moshi.adapter<List<ThemeInfo>>(Types.newParameterizedType(List::class.java, ThemeInfo::class.java))
    val json = fixture("theme-info-list.json")
    val themes = adapter.fromJson(json)!!
    assertEquals(
      listOf(ThemeSource.project, ThemeSource.material, ThemeSource.appcompat, ThemeSource.platform),
      themes.map { it.source },
    )
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) })
  }

  @Test
  fun `device-presets round-trips with the 5 required built-ins`() {
    val adapter = moshi.adapter<List<DevicePreset>>(Types.newParameterizedType(List::class.java, DevicePreset::class.java))
    val json = fixture("device-presets.json")
    val presets = adapter.fromJson(json)!!
    assertEquals(listOf("smallPhone", "phone", "largePhone", "tablet7", "tablet10"), presets.map { it.id })
    assertRoundTrips(json, { adapter.fromJson(it)!! }, { adapter.toJson(it) })
  }

  @Test
  fun `invalid render-request missing id is rejected naming the field`() {
    val adapter = moshi.adapter(RenderRequest::class.java)
    val json = fixture("invalid/render-request-missing-id.json")
    val ex = assertThrows(JsonDataException::class.java) { adapter.fromJson(json) }
    assertTrue(ex.message?.contains("id") == true, "expected the error to name the missing 'id' field, was: ${ex.message}")
  }

  @Test
  fun `invalid render-response missing status is rejected naming the field`() {
    val adapter = moshi.adapter(RenderResponse::class.java)
    val json = fixture("invalid/render-response-missing-status.json")
    val ex = assertThrows(JsonDataException::class.java) { adapter.fromJson(json) }
    assertTrue(ex.message?.contains("status") == true, "expected the error to name the missing 'status' field, was: ${ex.message}")
  }
}
