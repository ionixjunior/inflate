package engine

import android.view.View
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Environment
import app.cash.paparazzi.PaparazziSdk
import app.cash.paparazzi.internal.resources.AarSourceResourceRepository
import app.cash.paparazzi.internal.resources.AppResourceRepository
import app.cash.paparazzi.internal.resources.FrameworkResourceRepository
import com.android.ide.common.rendering.api.ResourceNamespace
import com.android.ide.common.rendering.api.SessionParams.RenderingMode
import com.android.ide.common.rendering.api.StyleResourceValue
import com.android.ide.common.resources.AbstractResourceRepository
import com.android.resources.ResourceType
import java.awt.image.BufferedImage
import java.io.File
import java.nio.file.Files

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
  /**
   * `res/` directories from the bundled androidx/Material AARs (design §D4). Built once into
   * immutable [AarSourceResourceRepository] library repositories and merged BELOW the project roots
   * in every session's [AppResourceRepository], so project resources override library resources of
   * the same name (RES-02) while `@style/Widget.Material3.*` etc. resolve from the bundle (LAY-05).
   */
  private val libraryResDirs: List<File> = emptyList(),
) {
  private var sdk: PaparazziSdk? = null
  private var lastImage: BufferedImage? = null
  private var dirty = false

  // --- T24 session cache (design §D5: cache size 1, keyed by ordered roots + package) ---
  /**
   * Overlay resource dir (`InitializeParams.overlayDir`) holding the preprocessed previewed file
   * under a unique name (Q3). Part of every session's `localResourceDirs`; priority-neutral because
   * the overlay file name never collides with a project resource. Null in tests that render a
   * project file directly.
   */
  var overlayDir: File? = null
  private var currentKey: SessionKey? = null
  private var currentAppRepo: AppResourceRepository? = null

  /** Whether the most recent [session] call rebuilt the app repository (vs reused the cached one). */
  var lastSessionRebuilt: Boolean = false
    private set

  /**
   * Incremented on every app-repository rebuild. Session-scoped caches (e.g. ThemeCatalog) key on
   * this so they refresh exactly when the app resources change (invalidation), not otherwise.
   */
  var sessionGeneration: Long = 0L
    private set

  private var frameworkStyleRepo: AbstractResourceRepository? = null

  /**
   * The bundled library resource repositories (design §D4). Built once from [libraryResDirs] and
   * reused for every session rebuild — "framework + AAR repositories immutable per process" (§D5).
   */
  private val libraryRepos: List<AarSourceResourceRepository> by lazy {
    libraryResDirs.filter { it.isDirectory }.map { resDir ->
      AarSourceResourceRepository.create(resDir.toPath(), resDir.parentFile?.name ?: resDir.name)
    }
  }

  private data class SessionKey(val rootPaths: List<String>, val packageName: String)

  /** Shadow res roots (per original path) holding canonical-lowercase symlinks to mis-cased type dirs. */
  private val shadowRoots = HashMap<String, File>()

  /**
   * Present [dir] to layoutlib with canonical (lowercase-type) resource-folder names so legacy
   * Xamarin capital-cased dirs (`Resources/Layout`, `Resources/Values`, …) are indexed — layoutlib's
   * folder-type parser is case-sensitive, while extension-side discovery is not (AD-001). Pure
   * lowercase roots are returned untouched (fast path; the working path and RES-02 are unaffected).
   * A root needing normalization gets a stable shadow directory of symlinks refreshed on each rebuild,
   * so live files (hot reload) are still read through the links.
   */
  private fun normalizeResRoot(dir: File): File {
    val entries = dir.listFiles() ?: return dir
    if (entries.none { it.isDirectory && it.name != canonicalFolderName(it.name) }) return dir
    val shadow = shadowRoots.getOrPut(dir.absolutePath) {
      Files.createTempDirectory("inflate-resnorm").toFile()
    }
    shadow.listFiles()?.forEach { it.delete() }
    for (entry in entries) {
      val linkName = if (entry.isDirectory) canonicalFolderName(entry.name) else entry.name
      val link = File(shadow, linkName)
      if (!link.exists()) Files.createSymbolicLink(link.toPath(), entry.toPath())
    }
    return shadow
  }

  /** Lowercase only the resource-type segment (before the first `-`), leaving qualifiers (e.g. `-rUS`). */
  private fun canonicalFolderName(name: String): String {
    val dash = name.indexOf('-')
    return if (dash < 0) name.lowercase() else name.substring(0, dash).lowercase() + name.substring(dash)
  }

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

  /**
   * Hot-reload invalidation (design §D5): mark the app repository dirty when any changed [paths]
   * lies under a current session root, so the next [session] rebuilds it. Previewed-file-only edits
   * are NOT passed here by the scheduler (file-backed resources are re-read per render), so this
   * conservatively rebuilds only when a real resource file under a root changed. Returns true if a
   * rebuild was scheduled. With no active session (or an empty list) it marks dirty defensively.
   */
  fun invalidate(paths: List<String>): Boolean {
    val roots = currentKey?.rootPaths
    val affected = when {
      roots == null -> paths.isNotEmpty()
      else -> paths.any { p ->
        val abs = File(p).absolutePath
        roots.any { root -> abs.startsWith(File(root).absolutePath) }
      }
    }
    if (affected) dirty = true
    return affected
  }

  /** True if [invalidate] was called since the last rebuild. */
  fun isDirty(): Boolean = dirty

  /**
   * Obtain the project session for [roots] + [packageName] (design §12/§D5). The session is cached
   * with size 1: the app-resource repository is rebuilt only when the (ordered roots, package) key
   * changes or [invalidate] marked it dirty; otherwise the live repository is reused (a
   * previewed-file-only edit re-runs the render without a rebuild). Config-only changes are applied
   * per render via [ProjectSession.render] (fresh `SessionParams` from the cached builder).
   *
   * Root priority follows RES-02 (containing source set highest): the Studio repositories give the
   * LAST directory passed to `AppResourceRepository.create` the highest priority, so the ordered
   * roots (highest first) plus the priority-neutral overlay are reversed before creation.
   */
  fun session(roots: List<File>, packageName: String): ProjectSession {
    checkNotNull(sdk) { "initBridgeOnce must be called first" }
    val key = SessionKey(roots.map { it.absolutePath }, packageName)
    val rebuild = currentKey != key || dirty || currentAppRepo == null
    if (rebuild) {
      val start = System.nanoTime()
      // localResourceDirs, highest-priority first: [overlay, root1, root2, ...]. Reverse so the
      // repository's last-wins ordering yields root1 > root2 > ... (overlay neutral: unique names).
      // Each dir is normalized so legacy Xamarin capital-cased type dirs (Resources/Layout, …) are
      // presented to layoutlib in canonical lowercase (RES-01 / P1-G AC1 / AD-001 / Q6) — layoutlib's
      // folder-type parsing is case-sensitive. Order (hence RES-02 priority) is preserved.
      val ordered = ((overlayDir?.let { listOf(it) } ?: emptyList()) + roots).map(::normalizeResRoot)
      val newAppRepo = AppResourceRepository.create(
        localResourceDirectories = ordered.reversed(),
        moduleResourceDirectories = emptyList(),
        libraryRepositories = libraryRepos,
      )
      PaparazziSdk.sessionParamsBuilder =
        PaparazziSdk.sessionParamsBuilder.copy(projectResources = newAppRepo)
      currentAppRepo = newAppRepo
      currentKey = key
      dirty = false
      // Activate the swapped repository now (recreate the render session) so resource-id resolution
      // reflects the new roots immediately, before the first render.
      sdk!!.unsafeUpdateConfig(deviceConfig = deviceConfig)
      lastRebuildMillis = (System.nanoTime() - start) / 1_000_000L
      sessionGeneration++
    }
    lastSessionRebuilt = rebuild
    return ProjectSession(roots, packageName, rebuild)
  }

  /**
   * A cached project session over a fixed set of resource roots. Rendering applies the requested
   * [DeviceConfig]/theme via `unsafeUpdateConfig` (fresh `SessionParams`, same cost profile the
   * design specifies) and snapshots the inflated layout — the app repository swapped in by
   * [session] becomes active on this call.
   */
  inner class ProjectSession internal constructor(
    val roots: List<File>,
    val packageName: String,
    /** True if [session] rebuilt the app repository to produce this handle. */
    val rebuilt: Boolean,
  ) {
    /** Resolve a resource id in this session's package namespace. */
    fun resourceId(name: String, type: String): Int = resourceId(name, type, packageName)

    /**
     * Render [layoutId] applying [deviceConfig] (defaults to the adapter's) and, when non-null,
     * [theme] (project-vs-android resolved by `withTheme` from its prefix).
     */
    fun render(
      layoutId: Int,
      deviceConfig: DeviceConfig? = null,
      theme: String? = null,
    ): BufferedImage {
      sdk!!.unsafeUpdateConfig(deviceConfig = deviceConfig ?: this@EngineAdapter.deviceConfig, theme = theme)
      // Install the theme-aware Factory2 on the freshly-recreated inflater (finding #6, T40) so
      // <Button> etc. inflate per the resolved theme's viewInflaterClass (MaterialButton under
      // Material themes) — Studio parity. No-op / framework-only when the theme sets no inflater.
      ThemeAwareFactory.install(sdk!!.context, sdk!!.layoutInflater)
      return render(inflate(layoutId))
    }
  }

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

  /**
   * Apply a device config + theme + [renderingMode] to the live render session (drawable rendering,
   * T44). `RenderingMode.SHRINK` gives a wrap-content canvas so an intrinsic-sized drawable snapshots
   * at its own size; `NORMAL` fills a fixed host-view canvas. Recreates the render session without
   * rebuilding the app repository (Bridge stays up).
   */
  fun configureRender(
    deviceConfig: DeviceConfig,
    theme: String?,
    renderingMode: com.android.ide.common.rendering.api.SessionParams.RenderingMode,
  ) {
    checkNotNull(sdk) { "initBridgeOnce must be called first" }
    sdk!!.unsafeUpdateConfig(deviceConfig = deviceConfig, theme = theme, renderingMode = renderingMode)
  }

  /** Load a themed drawable by id from the current session (drawable rendering, T44). */
  fun loadDrawable(id: Int): android.graphics.drawable.Drawable? = sdk!!.context.getDrawable(id)

  /** Load a themed color-state-list by id for color-swatch rendering (T44, DRW-06). */
  fun loadColorStateList(id: Int): android.content.res.ColorStateList? = sdk!!.context.getColorStateList(id)

  /** Display density (px per dp) of the current session, for dp→px canvas sizing (T44). */
  val displayDensity: Float get() = sdk!!.context.resources.displayMetrics.density

  /** Inflate a layout resource by numeric id in the current session. */
  fun inflate(layoutId: Int): View =
    checkNotNull(inflateOrNull(layoutId)) { "layout id $layoutId inflated to null" }

  /**
   * Inflate without the non-null assertion (unknown roots/children may yield null).
   *
   * LAY-08: inflates against a throwaway [android.widget.FrameLayout] parent with
   * `attachToRoot=false` — Studio's content-frame equivalent (`RenderSessionImpl.mContentRoot`).
   * This makes `LayoutInflater` generate the root element's own `LayoutParams` (width/height/
   * margins/gravity) instead of discarding them under a null parent; Paparazzi's single-arg
   * `addView` then preserves those pre-set params on the returned root view. The throwaway parent
   * never gains a child (attachToRoot=false), so `removeAllViews()` is a defensive no-op.
   */
  fun inflateOrNull(layoutId: Int): View? {
    val parent = android.widget.FrameLayout(sdk!!.context)
    try {
      return sdk!!.layoutInflater.inflate(layoutId, parent, false)
    } finally {
      parent.removeAllViews()
    }
  }

  /** Resolve a resource id (name/type/package) via the engine's resources. */
  fun resourceId(name: String, type: String, packageName: String): Int =
    sdk!!.resources.getIdentifier(name, type, packageName)

  /** The current render context (for building host-owned views / loading drawables). */
  val context: android.content.Context get() = sdk!!.context

  /** Render [view] and return the produced frame. */
  fun render(view: View): BufferedImage {
    sdk!!.snapshot(view)
    return checkNotNull(lastImage) { "snapshot produced no frame" }
  }

  /**
   * STYLE resources (name -> parent style name, or null) from the current app repository — project
   * styles plus any bundled library styles (RES_AUTO namespace). Feeds ThemeCatalog (T26).
   */
  fun appStyleParents(): Map<String, String?> =
    styleParents(currentAppRepo ?: error("no active session — call session() first"), ResourceNamespace.RES_AUTO)

  /** STYLE resources (name -> parent) from the framework repository (`android:` namespace). */
  fun frameworkStyleParents(): Map<String, String?> =
    styleParents(frameworkStyleRepository(), ResourceNamespace.ANDROID)

  /**
   * Whether a project resource `[typeName]/[name]` actually EXISTS in the current app repository.
   * Unlike [resourceId] (whose dynamic-id scheme, Q3, returns a fresh id for any name and so cannot
   * detect absence), this queries the repository directly — the basis for degradation (T27).
   */
  fun appResourceExists(typeName: String, name: String): Boolean {
    val type = RES_TYPE_BY_NAME[typeName] ?: return false
    val repo = currentAppRepo ?: return false
    return repo.getResources(ResourceNamespace.RES_AUTO, type, name).isNotEmpty()
  }

  /**
   * Whether the app-namespace (`res-auto`) attribute [name] is DEFINED by the project or any bundled
   * library (the app repository aggregates project roots + library repositories). Used by the
   * Material-attribute check (T41, P1-B AC4): an `app:` attribute that resolves here is honoured by
   * the bundled Material/androidx version; one that does not is ignored at inflation and warned about.
   */
  fun attrExists(name: String): Boolean {
    val repo = currentAppRepo ?: return false
    return repo.getResources(ResourceNamespace.RES_AUTO, ResourceType.ATTR, name).isNotEmpty()
  }

  private fun frameworkStyleRepository(): AbstractResourceRepository {
    frameworkStyleRepo?.let { return it }
    // Mirror Renderer.prepare's framework repo (default languages only). Built lazily since only
    // theme enumeration needs it; the render path uses PaparazziSdk's own framework repository.
    val repo = FrameworkResourceRepository.create(
      resourceDirectoryOrFile = File(resourcesRoot, "res").toPath(),
      languagesToLoad = emptySet(),
      useCompiled9Patches = false,
    )
    frameworkStyleRepo = repo
    return repo
  }

  private fun styleParents(repo: AbstractResourceRepository, namespace: ResourceNamespace): Map<String, String?> {
    val styles = repo.getResources(namespace, ResourceType.STYLE)
    val out = LinkedHashMap<String, String?>()
    for (name in styles.keySet()) {
      val item = styles.get(name).firstOrNull() ?: continue
      out[name] = (item.resourceValue as? StyleResourceValue)?.parentStyleName
    }
    return out
  }

  fun teardown() {
    sdk?.teardown()
    sdk = null
  }

  companion object {
    private val RES_TYPE_BY_NAME: Map<String, ResourceType> = mapOf(
      "color" to ResourceType.COLOR,
      "dimen" to ResourceType.DIMEN,
      "string" to ResourceType.STRING,
      "drawable" to ResourceType.DRAWABLE,
      "style" to ResourceType.STYLE,
      "layout" to ResourceType.LAYOUT,
    )

    /** Build a preview Environment rooted at [roots] with the given package (design §D3). */
    fun previewEnvironment(
      appTestDir: File,
      roots: List<File>,
      packageName: String = "com.inflate.preview",
      /**
       * Bundled androidx/Material AAR package names whose generated R classes ([RClassGenerator])
       * are on the classpath (T39, LAY-05). `PaparazziCallback.initResources` loads each package's
       * `R` and registers its ids → resource references so library styleables/attrs resolve. The
       * PROJECT package stays absent: there is no generated R for arbitrary-file rendering (Q3).
       */
      resourcePackageNames: List<String> = emptyList(),
    ): Environment = Environment(
      appTestDir = appTestDir.absolutePath,
      packageName = packageName,
      compileSdkVersion = 34,
      resourcePackageNames = resourcePackageNames,
      localResourceDirs = roots.map { it.absolutePath },
      moduleResourceDirs = emptyList(),
      libraryResourceDirs = emptyList(),
      allModuleAssetDirs = emptyList(),
      libraryAssetDirs = emptyList(),
    )
  }
}
