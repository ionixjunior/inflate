package render

import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import rpc.Density
import rpc.DevicePreset
import rpc.DocKind
import rpc.DrawableConfig
import rpc.Orientation
import rpc.PreviewConfig
import rpc.RenderRequest
import rpc.RenderRouting
import rpc.RenderStatus
import rpc.SizeBucket
import rpc.WarningKind
import java.io.File
import java.nio.file.Files

/**
 * DF-5 (HOST-05) — a leading UTF-8 BOM must not break render ingestion. Every "twin" fixture pair
 * referenced below is byte-identical content, one plain and one with a leading `EF BB BF` BOM
 * prepended (under fixtures/galleries). Every BOM fixture carries an in-test byte-integrity guard
 * so a future editor/formatter pass can't silently neutralize this regression coverage (DF-5
 * escape analysis).
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BomIngestionTest {

  private val pkg = "com.inflate.preview"

  private lateinit var frameworkRes: File
  private lateinit var materialRes: File
  private lateinit var drawableRes: File

  // A single Bridge instance is process-global (engineTest forks per class, but not per method) —
  // layoutlib throws "Acquiring different scenes from same thread without releases" if a second
  // EngineAdapter.initBridgeOnce runs in the same JVM fork. One shared adapter/routing serves every
  // gallery below; each request supplies its own gallery's `roots`, which `session()` rebuilds for.
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    frameworkRes = copyGallery("framework", "inflate-bom-framework")
    materialRes = copyGallery("material", "inflate-bom-material")
    drawableRes = copyGallery("drawables", "inflate-bom-drawables")

    val overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile()
    val outputDir = Files.createTempDirectory("inflate-out").toFile()

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      libraryResDirs = EngineTestSupport.libResDirs(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(
        appTestDir = materialRes.parentFile,
        roots = listOf(materialRes),
        packageName = pkg,
        resourcePackageNames = EngineTestSupport.rPackages(),
      ),
    )
    routing = RenderRouting(adapter, outputDir = outputDir, overlayBaseDir = overlayBaseDir)
  }

  private fun copyGallery(name: String, tempPrefix: String): File {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/$name")
    require(src.isDirectory) { "$name gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory(tempPrefix).toFile()
    src.copyRecursively(proj, overwrite = true)
    return File(proj, "res")
  }

  private fun layoutConfig(): PreviewConfig = PreviewConfig(
    themeName = "android:Theme.Material.NoActionBar",
    isProjectTheme = false,
    night = false,
    device = DevicePreset("test", "Test", 200, 300, "mdpi", SizeBucket.normal),
    orientation = Orientation.portrait,
    density = Density.mdpi,
    pixelScale = 1,
    drawable = null,
  )

  private fun frameworkRequest(docName: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(frameworkRes, "layout/$docName.xml").absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(frameworkRes.absolutePath),
    packageName = pkg,
    config = layoutConfig(),
    timeoutMs = 15000,
  )

  private fun materialRequest(docName: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(materialRes, "layout/$docName.xml").absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(materialRes.absolutePath),
    packageName = pkg,
    config = PreviewConfig(
      themeName = "Theme.Material3.DayNight",
      isProjectTheme = false,
      night = false,
      device = DevicePreset("test", "Test", 400, 800, "mdpi", SizeBucket.normal),
      orientation = Orientation.portrait,
      density = Density.mdpi,
      pixelScale = 1,
      drawable = null,
    ),
    timeoutMs = 15000,
  )

  private fun drawableRequest(name: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(drawableRes, "drawable/$name.xml").absolutePath,
    docKind = DocKind.drawableXml,
    inlineContent = null,
    roots = listOf(drawableRes.absolutePath),
    packageName = pkg,
    config = PreviewConfig(
      themeName = "android:Theme.Material.NoActionBar",
      isProjectTheme = false,
      night = false,
      device = DevicePreset("test", "Test", 400, 800, "mdpi", SizeBucket.normal),
      orientation = Orientation.portrait,
      density = Density.mdpi,
      pixelScale = 1,
      drawable = DrawableConfig(states = emptyList(), sizeDp = null),
    ),
    timeoutMs = 15000,
  )

  /** Asserts [dir]/[name].xml on disk still starts with the UTF-8 BOM (`EF BB BF`) it was authored with. */
  private fun assertBomFixture(res: File, dir: String, name: String) {
    val bytes = File(res, "$dir/$name.xml").readBytes()
    assertTrue(
      bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte(),
      "$name.xml must start with the UTF-8 BOM (EF BB BF); got ${bytes.take(3)}",
    )
  }

  private fun assertBomLayoutFixture(name: String) = assertBomFixture(frameworkRes, "layout", name)

  @Test
  fun `BOM'd twin renders ok with a PNG byte-identical to its BOM-less twin (AC1)`() {
    assertBomLayoutFixture("bom_twin")

    val plain = routing.render(frameworkRequest("bom_plain"))
    assertEquals(RenderStatus.ok, plain.status, "the BOM-less twin must render; error=${plain.error?.message}")

    val bom = routing.render(frameworkRequest("bom_twin"))
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

  @Test
  fun `a BOM'd file with a genuine syntax error surfaces the real error, not the PI artifact (AC2)`() {
    assertBomLayoutFixture("bom_error")

    val r = routing.render(frameworkRequest("bom_error"))
    assertEquals(RenderStatus.error, r.status, "a genuine syntax error must still fail the render")
    val error = r.error!!
    assertFalse(
      error.message.contains("PI must not start with xml"),
      "the BOM must not mask the real error behind the PI artifact; message=${error.message}",
    )
    assertEquals(
      7, error.line,
      "the reported line must be kxml2's real offending-tag line (line 7, the LinearLayout start " +
        "tag's closing '>' — mirrors PreprocessorCoreTest's convention), not line 1; " +
        "message=${error.message}",
    )
  }

  @Test
  fun `a BOM'd include target renders with its content present, cycle-walk unaffected (AC3)`() {
    assertBomLayoutFixture("bom_included")

    val r = routing.render(frameworkRequest("bom_include_host"))
    assertEquals(
      RenderStatus.ok, r.status,
      "a BOM'd include target must not fail the host render; error=${r.error?.message}",
    )
    val includedPath = File(frameworkRes, "layout/bom_included.xml").absolutePath
    assertTrue(
      r.dependencies.contains(includedPath),
      "the BOM'd include target must be tracked as a render dependency; dependencies=${r.dependencies}",
    )
    assertTrue(
      r.warnings.none { it.kind == WarningKind.notice && it.message.contains("cycle") },
      "a BOM'd include target must not be misidentified as a cycle; warnings=${r.warnings}",
    )
  }

  @Test
  fun `unknown Material attribute warning is identical for a BOM'd layout and its BOM-less twin (AC5)`() {
    assertBomFixture(materialRes, "layout", "bom_unknown_attr_twin")

    val plain = routing.render(materialRequest("bom_unknown_attr_plain"))
    val bom = routing.render(materialRequest("bom_unknown_attr_twin"))

    assertEquals(RenderStatus.ok, plain.status, "the BOM-less twin must render; error=${plain.error?.message}")
    assertEquals(
      RenderStatus.ok, bom.status,
      "the BOM'd twin must render ok (a malformed-XML catch must not silently swallow this warning); " +
        "error=${bom.error?.message}",
    )

    val plainWarnings = plain.warnings.filter { it.kind == WarningKind.materialAttrMissing }
    val bomWarnings = bom.warnings.filter { it.kind == WarningKind.materialAttrMissing }
    assertEquals(1, plainWarnings.size, "exactly one materialAttrMissing warning expected; got ${plain.warnings}")
    assertEquals(1, bomWarnings.size, "the BOM'd twin must emit the same warning; got ${bom.warnings}")
    assertEquals(plainWarnings.single().detail, bomWarnings.single().detail, "the flagged attribute must match")
    assertEquals(plainWarnings.single().message, bomWarnings.single().message, "the warning message must match")
  }

  @Test
  fun `BOM'd shape drawable renders ok, byte-identical to its BOM-less twin (AC1 drawable leg)`() {
    assertBomFixture(drawableRes, "drawable", "bom_shape_twin")

    val plain = routing.render(drawableRequest("bom_shape_plain"))
    val bom = routing.render(drawableRequest("bom_shape_twin"))

    assertEquals(RenderStatus.ok, plain.status, "the BOM-less drawable twin must render; error=${plain.error?.message}")
    assertEquals(
      RenderStatus.ok, bom.status,
      "a BOM'd drawable must render ok, not the PI artifact; error=${bom.error?.message}",
    )
    assertNotNull(plain.pngPath)
    assertNotNull(bom.pngPath)
    val plainBytes = File(plain.pngPath!!).readBytes()
    val bomBytes = File(bom.pngPath!!).readBytes()
    assertTrue(plainBytes.contentEquals(bomBytes), "BOM'd and BOM-less drawable renders must be byte-identical")
  }

  @Test
  fun `a BOM-only file errors accurately, not with the PI artifact (edge case)`() {
    assertBomLayoutFixture("bom_only")

    val r = routing.render(frameworkRequest("bom_only"))
    assertEquals(RenderStatus.error, r.status, "an empty (BOM-only) document must fail the render")
    val error = r.error!!
    assertFalse(
      error.message.contains("PI must not start with xml"),
      "an empty document's error must be its own, not the BOM PI artifact; message=${error.message}",
    )
  }
}
