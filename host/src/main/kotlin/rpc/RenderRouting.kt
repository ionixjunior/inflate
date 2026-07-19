package rpc

import engine.EngineAdapter
import out.PngWriter
import render.LayoutRenderer
import themes.ThemeCatalog
import java.io.File

/**
 * The engine-backed implementation of the render/listThemes/invalidate RPCs (T35, design §11/§D5).
 * [RpcServer] holds a [RenderBackend]; before T35 it had only stubs, so `render` returned a
 * not-implemented error and `listThemes`/`invalidate` returned trivial successes. Once the host is
 * `initialize`d with real engine paths, [RpcServer] builds a [RenderRouting] and routes for real.
 */
interface RenderBackend {
  /** Execute a render, mapping every failure into a structured [RenderResponse] (never throws). */
  fun render(request: RenderRequest): RenderResponse

  /** Enumerate the themes available to the session over [roots]/[packageName] (CFG-04, LAY-06). */
  fun listThemes(roots: List<String>, packageName: String): List<ThemeInfo>

  /** Mark changed dependency [paths] dirty; returns whether a repository rebuild was scheduled. */
  fun invalidate(paths: List<String>): Boolean
}

/**
 * Routes each `render` by [RenderRequest.docKind]: layouts go to [LayoutRenderer]; other kinds
 * (drawable/nine-patch/color) return a structured error until Phase 8 (T44+). `listThemes` drives
 * the [ThemeCatalog] over the requested session; `invalidate` forwards to the [EngineAdapter].
 */
class RenderRouting(
  private val adapter: EngineAdapter,
  outputDir: File,
  overlayBaseDir: File,
) : RenderBackend {

  private val layoutRenderer = LayoutRenderer(adapter, PngWriter(outputDir), overlayBaseDir)
  private val themeCatalog = ThemeCatalog(adapter)

  override fun render(request: RenderRequest): RenderResponse = when (request.docKind) {
    DocKind.layout -> layoutRenderer.render(request)
    else -> RenderResponse(
      id = request.id,
      status = RenderStatus.error,
      warnings = emptyList(),
      error = RenderError(message = "rendering docKind=${request.docKind} is not implemented yet (Phase 8)"),
      dependencies = emptyList(),
      timings = RenderTimings(0, 0, 0, 0),
      sessionRebuilt = false,
    )
  }

  override fun listThemes(roots: List<String>, packageName: String): List<ThemeInfo> {
    adapter.session(roots.map(::File), packageName)
    return themeCatalog.list()
  }

  override fun invalidate(paths: List<String>): Boolean = adapter.invalidate(paths)
}
