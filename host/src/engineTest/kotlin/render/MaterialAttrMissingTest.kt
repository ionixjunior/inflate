package render

import engine.EngineAdapter
import engine.EngineArtifacts
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
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
import rpc.WarningKind
import java.io.File
import java.nio.file.Files

/**
 * T41 (P1-B AC4): a layout referencing a Material attribute the bundled version does not define
 * renders successfully with the attribute ignored, and emits a `materialAttrMissing` warning naming
 * the attribute and the bundled Material version. Driven through the real [RenderRouting] path so the
 * warning is observed on the [rpc.RenderResponse], not a bespoke helper.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class MaterialAttrMissingTest {

  private val pkg = "com.inflate.preview"
  private lateinit var res: File
  private lateinit var routing: RenderRouting
  private var idSeq = 0

  @BeforeAll
  fun setUp() {
    val src = File(EngineTestSupport.fixturesRoot(), "galleries/material")
    require(src.isDirectory) { "material gallery fixtures missing at $src" }
    val proj = Files.createTempDirectory("inflate-material-attr").toFile()
    src.copyRecursively(proj, overwrite = true)
    res = File(proj, "res")
    val overlayBaseDir = Files.createTempDirectory("inflate-overlay").toFile()
    val outputDir = Files.createTempDirectory("inflate-out").toFile()

    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      libraryResDirs = EngineTestSupport.libResDirs(),
    )
    adapter.initBridgeOnce(
      EngineAdapter.previewEnvironment(
        appTestDir = proj,
        roots = listOf(res),
        packageName = pkg,
        resourcePackageNames = EngineTestSupport.rPackages(),
      ),
    )
    routing = RenderRouting(adapter, outputDir = outputDir, overlayBaseDir = overlayBaseDir)
  }

  private fun request(docName: String): RenderRequest = RenderRequest(
    id = ++idSeq,
    docPath = File(res, "layout/$docName.xml").absolutePath,
    docKind = DocKind.layout,
    inlineContent = null,
    roots = listOf(res.absolutePath),
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

  @Test
  fun `unknown Material attribute renders with a materialAttrMissing warning naming attr and version`() {
    val r = routing.render(request("material_attr_missing"))

    assertEquals(RenderStatus.ok, r.status, "render must succeed with the unknown attr ignored; error=${r.error?.message}")

    val attrWarnings = r.warnings.filter { it.kind == WarningKind.materialAttrMissing }
    assertEquals(
      1, attrWarnings.size,
      "exactly one materialAttrMissing warning (only app:madeUpMaterialAttr is undefined); got ${r.warnings}",
    )
    val w = attrWarnings.single()
    assertEquals("madeUpMaterialAttr", w.detail, "the warning must name the offending attribute")
    assertTrue(
      w.message.contains("madeUpMaterialAttr") && w.message.contains(EngineArtifacts.MATERIAL_VERSION),
      "the warning must name the attribute and the bundled Material version (${EngineArtifacts.MATERIAL_VERSION}); got '${w.message}'",
    )
    // A real bundled attribute (app:cornerRadius) must NOT be flagged.
    assertTrue(
      attrWarnings.none { it.detail == "cornerRadius" },
      "app:cornerRadius is defined by Material ${EngineArtifacts.MATERIAL_VERSION} and must not warn",
    )
  }
}
