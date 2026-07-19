package rpc

import engine.EngineAdapter
import out.PngWriter
import render.DrawableRenderer
import render.LayoutRenderer
import render.NinePatchRenderer
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
 * Routes each `render` by [RenderRequest.docKind]: layouts go to [LayoutRenderer]; drawable and color
 * documents go to [DrawableRenderer]; nine-patch (`.9.png`) goes to [NinePatchRenderer]. `listThemes`
 * drives the [ThemeCatalog] over the requested session; `invalidate` forwards to the [EngineAdapter].
 */
class RenderRouting(
  private val adapter: EngineAdapter,
  outputDir: File,
  overlayBaseDir: File,
) : RenderBackend {

  private val pngWriter = PngWriter(outputDir)
  private val layoutRenderer = LayoutRenderer(adapter, pngWriter, overlayBaseDir)
  private val drawableRenderer = DrawableRenderer(adapter, pngWriter, overlayBaseDir)
  private val ninePatchRenderer = NinePatchRenderer(pngWriter)
  private val themeCatalog = ThemeCatalog(adapter)

  override fun render(request: RenderRequest): RenderResponse = when (request.docKind) {
    DocKind.layout -> layoutRenderer.render(request)
    DocKind.drawableXml, DocKind.color -> drawableRenderer.render(request)
    DocKind.ninePatch -> ninePatchRenderer.render(request)
  }

  override fun listThemes(roots: List<String>, packageName: String): List<ThemeInfo> {
    adapter.session(roots.map(::File), packageName)
    return themeCatalog.list()
  }

  override fun invalidate(paths: List<String>): Boolean = adapter.invalidate(paths)
}
