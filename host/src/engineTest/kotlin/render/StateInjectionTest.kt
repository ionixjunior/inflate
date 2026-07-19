package render

import android.graphics.drawable.StateListDrawable
import android.widget.FrameLayout
import app.cash.paparazzi.DeviceConfig
import com.android.resources.Density
import engine.EngineAdapter
import engine.EngineTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * M0 checklist item 5 (Q2 gate). Injects state sets into a host-owned view wrapping a 4-item
 * selector and proves each state renders a visibly different image, with StateListDrawable
 * .findStateDrawableIndex reporting the correct matched item. Fallback if injection fails:
 * re-inflate the selector per state (design Q2 scope fallback).
 */
class StateInjectionTest {

  private data class Case(val name: String, val extra: IntArray, val enabled: Boolean, val expectedIndex: Int)

  @Test
  fun `each injected state renders differently with the correct matched item index`() {
    val res = EngineTestSupport.copyFixtureRes("selector")
    val adapter = EngineAdapter(
      runtimeRoot = EngineTestSupport.runtimeRoot(),
      resourcesRoot = EngineTestSupport.resourcesRoot(),
      deviceConfig = DeviceConfig(screenWidth = 100, screenHeight = 100, xdpi = 160, ydpi = 160, density = Density.MEDIUM),
    )
    adapter.initBridgeOnce(EngineAdapter.previewEnvironment(appTestDir = res.parentFile, roots = listOf(res)))
    adapter.buildRepositories(listOf(res))

    val drawableId = adapter.resourceId("sel", "drawable", "com.inflate.preview")
    assertTrue(drawableId != 0, "sel.xml should resolve to a drawable id")

    val pressed = android.R.attr.state_pressed
    val checked = android.R.attr.state_checked

    // Selector item order: 0=pressed(red) 1=checked(green) 2=disabled(gray) 3=default(blue).
    val cases = listOf(
      Case("default", intArrayOf(), enabled = true, expectedIndex = 3),
      Case("pressed", intArrayOf(pressed), enabled = true, expectedIndex = 0),
      Case("checked", intArrayOf(checked), enabled = true, expectedIndex = 1),
      Case("disabled", intArrayOf(), enabled = false, expectedIndex = 2),
    )

    val centerColors = mutableMapOf<String, Int>()
    for (case in cases) {
      val drawable = adapter.context.getDrawable(drawableId) as StateListDrawable
      val view = StateImageView(adapter.context)
      view.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
      view.background = drawable
      view.isEnabled = case.enabled
      view.setInjectedState(case.extra)

      val image = adapter.render(view)
      centerColors[case.name] = image.getRGB(image.width / 2, image.height / 2)

      // Matched item for the view's actual drawable state must be the expected selector item.
      val matched = drawable.findStateDrawableIndex(view.drawableState)
      assertEquals(case.expectedIndex, matched, "matched item index for state '${case.name}'")
    }

    // At least 3 states must be pairwise-different images (Q2 acceptance).
    assertTrue(
      centerColors.values.toSet().size >= 3,
      "expected >=3 distinct rendered states but got $centerColors",
    )
  }
}
