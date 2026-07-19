package render

import android.content.Context
import android.widget.ImageView

/**
 * Host-owned view for drawable state injection (design Q2 / DRW-03/07). Merges a caller-supplied
 * state set into its drawable state so a `StateListDrawable`/`ripple` shows an arbitrary state
 * (e.g. pressed, checked) even for states the view would not naturally enter.
 */
class StateImageView(context: Context) : ImageView(context) {

  private var injectedState: IntArray = IntArray(0)

  /** Set the extra states to merge (e.g. [android.R.attr.state_pressed]) and refresh. */
  fun setInjectedState(state: IntArray) {
    injectedState = state
    refreshDrawableState()
  }

  override fun onCreateDrawableState(extraSpace: Int): IntArray {
    val base = super.onCreateDrawableState(extraSpace + injectedState.size)
    return mergeDrawableStates(base, injectedState)
  }
}
