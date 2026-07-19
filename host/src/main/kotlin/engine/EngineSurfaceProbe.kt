package engine

import app.cash.paparazzi.internal.PaparazziCallback
import app.cash.paparazzi.internal.PaparazziLogger
import app.cash.paparazzi.internal.Renderer
import app.cash.paparazzi.internal.SessionParamsBuilder
import app.cash.paparazzi.internal.parsers.LayoutPullParser
import app.cash.paparazzi.internal.resources.AarSourceResourceRepository
import app.cash.paparazzi.internal.resources.AppResourceRepository
import app.cash.paparazzi.internal.resources.FrameworkResourceRepository

/**
 * Compile-time proof of AD-009: `-Xfriend-paths` grants the host access to Paparazzi 1.3.5's
 * Kotlin-`internal` machinery. Each reference below forces the Kotlin compiler to resolve an
 * `internal` type across the module boundary — WITHOUT the friend-paths flag on the compile
 * task this file does not compile, so a silent loss of the flag breaks the build (the M0
 * checklist item 1 gate).
 *
 * Every symbol here is inventoried in host/ENGINE_SURFACE.md.
 */
object EngineSurfaceProbe {
  /** The internal engine symbols the EngineAdapter design depends on (design §D2/#12). */
  val internalSymbols: List<Class<*>> = listOf(
    Renderer::class.java,                       // Renderer.prepare() sequence (split by adapter)
    SessionParamsBuilder::class.java,           // per-session SessionParams construction
    PaparazziCallback::class.java,              // view/resource loading + getParser
    PaparazziLogger::class.java,                // ILayoutLog/ILogger sink (LogBridge basis)
    LayoutPullParser::class.java,               // file-backed layout parsing
    FrameworkResourceRepository::class.java,    // framework res (built once)
    AppResourceRepository::class.java,          // app res (rebuildable for hot reload)
    AarSourceResourceRepository::class.java,    // androidx/Material AAR res
  )
}
