package engine

import android.view.View
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Environment
import app.cash.paparazzi.PaparazziSdk
import app.cash.paparazzi.internal.resources.AppResourceRepository
import com.android.ide.common.rendering.api.SessionParams.RenderingMode
import java.awt.image.BufferedImage
import java.io.File

/**
 * The AD-009 friend-paths surface. Splits Paparazzi's `Renderer.prepare()` into:
 *  - [initBridgeOnce]: one-time Bridge/native/font/ICU bootstrap (companion-guarded, per process);
 *  - [buildRepositories]: a rebuildable app-resource repository for hot reload.
 *
 * The engine holds process-global state in `PaparazziSdk`'s internal companion object; we reach
 * `sessionParamsBuilder` through friend-paths to swap in a freshly-built [AppResourceRepository]
 * without re-initialising the Bridge, then recreate the render session via `unsafeUpdateConfig`.
 */
class EngineAdapter(
  private val runtimeRoot: File,
  private val resourcesRoot: File,
  private val deviceConfig: DeviceConfig = DeviceConfig(),
  private val theme: String = "android:Theme.Material.NoActionBar.Fullscreen",
) {
  private var sdk: PaparazziSdk? = null
  private var lastImage: BufferedImage? = null
  private var dirty = false

  /** Milliseconds taken by the most recent app-repository rebuild (-1 before any rebuild). */
  var lastRebuildMillis: Long = -1L
    private set

  /** One-time Bridge init + first repository build from [env] (mirrors Renderer.prepare order). */
  fun initBridgeOnce(env: Environment) {
    check(sdk == null) { "initBridgeOnce already called on this adapter" }
    System.setProperty("paparazzi.layoutlib.runtime.root", runtimeRoot.absolutePath)
    System.setProperty("paparazzi.layoutlib.resources.root", resourcesRoot.absolutePath)
    val instance = PaparazziSdk(
      environment = env,
      deviceConfig = deviceConfig,
      theme = theme,
      renderingMode = RenderingMode.NORMAL,
      appCompatEnabled = false,
      useDeviceResolution = true,
      onNewFrame = { lastImage = it },
    )
    instance.setup()
    instance.prepare()
    sdk = instance
  }

  /** Mark the app repository dirty so the next [buildRepositories] rebuilds it (hot reload). */
  fun invalidate() {
    dirty = true
  }

  /** True if [invalidate] was called since the last rebuild. */
  fun isDirty(): Boolean = dirty

  /**
   * Rebuild the app-resource repository from [roots] (re-reading values dirs from disk) and recreate
   * the render session, WITHOUT re-initialising the Bridge. Returns the rebuild duration in ms.
   */
  fun buildRepositories(roots: List<File>): Long {
    checkNotNull(sdk) { "initBridgeOnce must be called first" }
    val start = System.nanoTime()
    val newAppRepo = AppResourceRepository.create(
      localResourceDirectories = roots,
      moduleResourceDirectories = emptyList(),
      libraryRepositories = emptyList(),
    )
    // friend-paths: swap the app repository into the process-global session builder ...
    PaparazziSdk.sessionParamsBuilder = PaparazziSdk.sessionParamsBuilder.copy(projectResources = newAppRepo)
    // ... then recreate the render session so the swap takes effect (Bridge stays up).
    sdk!!.unsafeUpdateConfig(deviceConfig = deviceConfig)
    dirty = false
    lastRebuildMillis = (System.nanoTime() - start) / 1_000_000L
    return lastRebuildMillis
  }

  /** Inflate a layout resource by numeric id in the current session. */
  fun inflate(layoutId: Int): View =
    checkNotNull(inflateOrNull(layoutId)) { "layout id $layoutId inflated to null" }

  /** Inflate without the non-null assertion (unknown roots/children may yield null). */
  fun inflateOrNull(layoutId: Int): View? = sdk!!.layoutInflater.inflate(layoutId, null)

  /** Resolve a resource id (name/type/package) via the engine's resources. */
  fun resourceId(name: String, type: String, packageName: String): Int =
    sdk!!.resources.getIdentifier(name, type, packageName)

  /** Render [view] and return the produced frame. */
  fun render(view: View): BufferedImage {
    sdk!!.snapshot(view)
    return checkNotNull(lastImage) { "snapshot produced no frame" }
  }

  fun teardown() {
    sdk?.teardown()
    sdk = null
  }

  companion object {
    /** Build a preview Environment rooted at [roots] with the given package (design §D3). */
    fun previewEnvironment(
      appTestDir: File,
      roots: List<File>,
      packageName: String = "com.inflate.preview",
    ): Environment = Environment(
      appTestDir = appTestDir.absolutePath,
      packageName = packageName,
      compileSdkVersion = 34,
      // Empty: there is no generated R class for arbitrary-file rendering (Q3). Resource ids are
      // generated dynamically by PaparazziCallback and resolved via Resources.getIdentifier.
      resourcePackageNames = emptyList(),
      localResourceDirs = roots.map { it.absolutePath },
      moduleResourceDirs = emptyList(),
      libraryResourceDirs = emptyList(),
      allModuleAssetDirs = emptyList(),
      libraryAssetDirs = emptyList(),
    )
  }
}
