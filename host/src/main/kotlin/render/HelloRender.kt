package render

import engine.EngineAdapter
import out.PngWriter
import java.io.File

/**
 * Minimal end-to-end render path (M0 checklist item 3, host half): resolve a layout resource by
 * generated name, inflate it in the EngineAdapter session, snapshot, and write the PNG.
 */
class HelloRender(
  private val adapter: EngineAdapter,
  private val pngWriter: PngWriter,
) {
  data class Result(val png: File, val width: Int, val height: Int)

  fun render(
    docKey: String,
    renderId: Long,
    layoutName: String,
    packageName: String = "com.inflate.preview",
  ): Result {
    val layoutId = adapter.resourceId(layoutName, "layout", packageName)
    require(layoutId != 0) { "layout '$layoutName' did not resolve to a resource id" }
    val view = adapter.inflate(layoutId)
    val image = adapter.render(view)
    val png = pngWriter.write(docKey, renderId, image)
    return Result(png, image.width, image.height)
  }
}
