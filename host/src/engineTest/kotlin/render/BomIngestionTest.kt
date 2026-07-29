package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import rpc.Density
import rpc.DevicePreset
import rpc.DocKind
import rpc.Orientation
import rpc.PreviewConfig
import rpc.RenderRequest
import rpc.RenderRouting
import rpc.RenderStatus
import rpc.SizeBucket
import java.io.File
import java.nio.file.Files

/**
 * DF-5 (HOST-05) — a leading UTF-8 BOM must not break render ingestion. `bom_twin.xml`
 * (fixtures/galleries/framework/res/layout/) is `bom_plain.xml`'s exact bytes with one leading
 * `EF BB BF` BOM prepended. Every BOM fixture carries an in-test byte-integrity guard so a future
 * editor/formatter pass can't silently neutralize this regression coverage (DF-5 escape analysis).
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BomIngestionTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/framework")
    require(src.isDirectory) { "framework gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-bom-gallery").toFile()
    src.copyRecursively(proj, overwrite = true)
    res = File(proj, "res")
    val overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile()
    val outputDir = Files.createTempDirectory("inflate-out").toFile()

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(appTestDir = proj, roots = listOf(res), packageName = pkg),
    )
    routing = RenderRouting(adapter, outputDir = outputDir, overlayBaseDir = overlayBaseDir)
  }

  private fun config(): PreviewConfig = PreviewConfig(
    themeName = "android:Theme.Material.NoActionBar",
    isProjectTheme = false,
    night = false,
    device = DevicePreset("test", "Test", 200, 300, "mdpi", SizeBucket.normal),
    orientation = Orientation.portrait,
    density = Density.mdpi,
    pixelScale = 1,
    drawable = null,
  )

  private fun request(docName: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(res, "layout/$docName.xml").absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(res.absolutePath),
    packageName = pkg,
    config = config(),
    timeoutMs = 15000,
  )

  /** Asserts [name].xml on disk still starts with the UTF-8 BOM (`EF BB BF`) it was authored with. */
  private fun assertBomFixture(name: String) {
    val bytes = File(res, "layout/$name.xml").readBytes()
    assertTrue(
      bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte(),
      "$name.xml must start with the UTF-8 BOM (EF BB BF); got ${bytes.take(3)}",
    )
  }

  @Test
  fun `BOM'd twin renders ok with a PNG byte-identical to its BOM-less twin (AC1)`() {
    assertBomFixture("bom_twin")

    val plain = routing.render(request("bom_plain"))
    assertEquals(RenderStatus.ok, plain.status, "the BOM-less twin must render; error=${plain.error?.message}")

    val bom = routing.render(request("bom_twin"))
    assertEquals(
      RenderStatus.ok, bom.status,
      "a BOM'd file must render ok, not the 'PI must not start with xml' artifact; error=${bom.error?.message}",
    )

    assertNotNull(plain.pngPath)
    assertNotNull(bom.pngPath)
    val plainBytes = File(plain.pngPath!!).readBytes()
    val bomBytes = File(bom.pngPath!!).readBytes()
    assertTrue(plainBytes.contentEquals(bomBytes), "BOM'd and BOM-less renders must produce byte-identical PNGs")
  }
}
