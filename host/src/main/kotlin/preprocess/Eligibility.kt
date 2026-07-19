package preprocess

/**
 * Shared eligibility constants (T33, design component #2, UX-01) — the host-side mirror of
 * `shared/eligibility.json` and the extension's `classifier.ts` `ELIGIBILITY`. These are the single
 * source of truth for which resource-type directories and drawable root elements are previewable.
 *
 * The guard test (`EligibilityGuardTest`) asserts every list here is value-identical to
 * `shared/eligibility.json`; the extension has a matching guard, so all three stay in lock-step and
 * any drift fails a build gate.
 */
object Eligibility {
  val resourceTypeDirs: List<String> = listOf(
    "anim",
    "animator",
    "color",
    "drawable",
    "font",
    "interpolator",
    "layout",
    "menu",
    "mipmap",
    "navigation",
    "raw",
    "transition",
    "values",
    "xml",
  )

  val layoutTypeDirs: List<String> = listOf("layout")

  val drawableTypeDirs: List<String> = listOf("drawable", "mipmap")

  val colorTypeDirs: List<String> = listOf("color")

  val drawableRootElements: List<String> = listOf(
    "adaptive-icon",
    "animated-selector",
    "animated-vector",
    "animation-list",
    "bitmap",
    "clip",
    "inset",
    "layer-list",
    "level-list",
    "ripple",
    "rotate",
    "scale",
    "selector",
    "shape",
    "transition",
    "vector",
  )

  val eligibleExtensions: List<String> = listOf(".9.png", ".axml", ".xml")
}
