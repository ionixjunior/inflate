package engine

import android.content.Context
import android.util.AttributeSet
import android.view.LayoutInflater
import android.view.View
import java.lang.reflect.Method

/**
 * Theme-aware `LayoutInflater.Factory2` for Studio-parity Material/AppCompat inflation (design
 * finding #6, T40, LAY-05/LAY-06).
 *
 * Paparazzi's `PaparazziSdk.initializeAppCompatIfPresent()` hardcodes `AppCompatViewInflater`, which
 * downgrades `<Button>` to `AppCompatButton` even under a Material theme — Android Studio instead
 * honours the theme's `viewInflaterClass` (`MaterialComponentsViewInflater` → `MaterialButton`). The
 * EngineAdapter runs with `appCompatEnabled = false` so Paparazzi installs nothing, and this factory
 * is installed per render (after the render session is recreated, so a fresh inflater each time):
 *
 *  1. Read `viewInflaterClass` from the **resolved theme** via the appcompat `AppCompatTheme`
 *     styleable (the exact path `AppCompatDelegateImpl` uses), so it reflects theme inheritance.
 *  2. If a class name is present, reflectively instantiate it and delegate to its
 *     `createView(View, String, Context, AttributeSet, boolean, boolean, boolean, boolean)` — the
 *     same 8-arg signature Paparazzi/AppCompat use.
 *  3. If that class is set but cannot be loaded, fall back to `AppCompatViewInflater` — never fail the
 *     render.
 *  4. If NO `viewInflaterClass` is set (e.g. a platform `android:` theme), install nothing, so
 *     framework views inflate as their framework classes.
 */
object ThemeAwareFactory {

  const val APPCOMPAT_VIEW_INFLATER = "androidx.appcompat.app.AppCompatViewInflater"

  /**
   * Install the theme-aware factory on [inflater] for the currently-resolved theme in [context].
   * No-op if a factory is already installed (LayoutInflater forbids replacing it).
   */
  fun install(context: Context, inflater: LayoutInflater) {
    if (inflater.factory2 != null || inflater.factory != null) return
    // No viewInflaterClass on the theme (platform themes) → leave framework inflation untouched.
    val themeInflaterClass = resolveViewInflaterClassName(context) ?: return
    val delegate = createInflater(themeInflaterClass)
      ?: createInflater(APPCOMPAT_VIEW_INFLATER) // set-but-unloadable → AppCompat fallback
      ?: return // AppCompat absent too → render framework-only rather than fail
    inflater.factory2 = DelegatingFactory2(delegate)
  }

  /** Resolve `viewInflaterClass` from the active theme via the appcompat `AppCompatTheme` styleable. */
  private fun resolveViewInflaterClassName(context: Context): String? = try {
    val styleable = Class.forName("androidx.appcompat.R\$styleable")
    val attrs = styleable.getField("AppCompatTheme").get(null) as IntArray
    val index = styleable.getField("AppCompatTheme_viewInflaterClass").getInt(null)
    val typed = context.obtainStyledAttributes(attrs)
    try {
      typed.getString(index)?.takeIf { it.isNotBlank() }
    } finally {
      typed.recycle()
    }
  } catch (e: Throwable) {
    null
  }

  private fun createInflater(className: String?): ViewInflaterDelegate? {
    if (className.isNullOrBlank()) return null
    return try {
      val clazz = Class.forName(className)
      val instance = clazz.getConstructor().newInstance()
      // createView(...) is declared `protected` on AppCompatViewInflater; subclasses like
      // MaterialComponentsViewInflater inherit it (they override createButton/createTextView instead),
      // so getDeclaredMethod on `clazz` alone misses it — walk the hierarchy.
      val createView = findCreateView(clazz)
        ?.apply { isAccessible = true }
        ?: return null
      ViewInflaterDelegate(instance, createView)
    } catch (e: Throwable) {
      null
    }
  }

  private fun findCreateView(start: Class<*>): Method? {
    var c: Class<*>? = start
    while (c != null && c != Any::class.java) {
      try {
        return c.getDeclaredMethod(
          "createView",
          View::class.java,
          String::class.java,
          Context::class.java,
          AttributeSet::class.java,
          Boolean::class.javaPrimitiveType,
          Boolean::class.javaPrimitiveType,
          Boolean::class.javaPrimitiveType,
          Boolean::class.javaPrimitiveType,
        )
      } catch (e: NoSuchMethodException) {
        c = c.superclass
      }
    }
    return null
  }

  private class ViewInflaterDelegate(private val instance: Any, private val createView: Method) {
    fun create(parent: View?, name: String, context: Context, attrs: AttributeSet): View? =
      createView.invoke(instance, parent, name, context, attrs, true, true, true, true) as View?
  }

  private class DelegatingFactory2(private val delegate: ViewInflaterDelegate) : LayoutInflater.Factory2 {
    override fun onCreateView(parent: View?, name: String, context: Context, attrs: AttributeSet): View? =
      try {
        delegate.create(parent, name, context, attrs)
      } catch (e: Throwable) {
        null // any per-view failure → let the base inflater create the framework view
      }

    override fun onCreateView(name: String, context: Context, attrs: AttributeSet): View? =
      onCreateView(null, name, context, attrs)
  }
}
