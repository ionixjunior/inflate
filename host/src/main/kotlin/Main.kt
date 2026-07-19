import engine.EngineAdapter
import java.io.BufferedInputStream
import java.io.File
import rpc.InitializeParams
import rpc.RenderBackend
import rpc.RenderRouting
import rpc.RpcServer

/**
 * Inflate render host entry point (T13/T35). Wires the LSP-framed [RpcServer] over stdio and, on
 * `initialize`, builds the engine-backed [RenderRouting] from the paths the extension supplies.
 * stdout is reserved exclusively for protocol frames (design §D5) — nothing else may print to it;
 * `System.in` is wrapped in a [BufferedInputStream] purely for read efficiency (framing itself
 * tolerates arbitrarily fragmented reads either way, per [rpc.FrameReader]).
 */
fun main() {
  val server = RpcServer(
    input = BufferedInputStream(System.`in`),
    output = System.out,
    backendFactory = ::buildBackend,
  )
  server.serve()
}

/**
 * Construct the layoutlib-backed render backend from [params] (T35). Bridge init runs on the render
 * thread (RpcServer guarantees this) with empty initial roots — the real roots arrive per render via
 * [EngineAdapter.session]. The overlay resource dir is `<overlayDir>/res`, where the Preprocessor
 * writes each previewed file's overlay.
 */
private fun buildBackend(params: InitializeParams): RenderBackend {
  val runtimeRoot = File(params.layoutlibRuntimeRoot)
  val resourcesRoot = File(params.layoutlibResourcesRoot)
  val overlayBaseDir = File(params.overlayDir)
  val outputDir = File(params.outputDir).apply { mkdirs() }

  // Bundled androidx/Material AAR res/ dirs → library resource repositories, and their package names
  // → resourcePackageNames so PaparazziCallback.initResources registers the generated R ids (T39,
  // LAY-05/RES-02). classpathJars (incl. each AAR's classes.jar) are assembled launcher-side.
  val adapter = EngineAdapter(
    runtimeRoot = runtimeRoot,
    resourcesRoot = resourcesRoot,
    libraryResDirs = params.libraryResDirs.map(::File),
  )
  adapter.initBridgeOnce(
    EngineAdapter.previewEnvironment(
      appTestDir = outputDir,
      roots = emptyList(),
      resourcePackageNames = params.libraryPackages,
    ),
  )
  adapter.overlayDir = File(overlayBaseDir, "res")
  return RenderRouting(adapter, outputDir = outputDir, overlayBaseDir = overlayBaseDir)
}
