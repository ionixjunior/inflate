package engine

/** Host OS + CPU architecture — selects the layoutlib-runtime native classifier. */
enum class HostArch { MAC_ARM, MAC_X64, WINDOWS_X64, LINUX_X64 }

/**
 * A single pinned Google-Maven artifact in the engine download set (design §D6/§Q4).
 * Pure coordinate/URL logic — no I/O — so it is fully unit-testable (T3).
 */
data class EngineArtifact(
  val group: String,
  val name: String,
  val version: String,
  val classifier: String? = null,
  val extension: String,
  /** Whether the artifact is unzipped into the cache (runtime/resources) vs kept as a file. */
  val unzip: Boolean = false,
) {
  /** Maven file name, e.g. `layoutlib-runtime-14.0.11-mac-arm.jar`. */
  val fileName: String = buildString {
    append(name).append('-').append(version)
    if (classifier != null) append('-').append(classifier)
    append('.').append(extension)
  }

  /** Full Google-Maven download URL for this artifact under [baseUrl]. */
  fun url(baseUrl: String = EngineArtifacts.GOOGLE_MAVEN): String {
    val base = baseUrl.trimEnd('/')
    val groupPath = group.replace('.', '/')
    return "$base/$groupPath/$name/$version/$fileName"
  }
}

/**
 * The pinned v1 engine artifact set and its Google-Maven coordinates (design §D6, §Q4, §D4).
 * The layoutlib triple moves as one matrix; androidx/Material top-level pins per §D4.
 */
object EngineArtifacts {
  const val GOOGLE_MAVEN = "https://dl.google.com/dl/android/maven2"

  const val LAYOUTLIB_VERSION = "14.0.11"
  const val TOOLS_VERSION = "31.4.2"

  /** Bundled Material pin (design §D4); named in the P1-B AC4 `materialAttrMissing` warning (T41). */
  const val MATERIAL_VERSION = "1.12.0"

  /** Native classifier for the layoutlib-runtime jar. */
  fun runtimeClassifier(arch: HostArch): String = when (arch) {
    HostArch.MAC_ARM -> "mac-arm"
    HostArch.MAC_X64 -> "mac"
    HostArch.WINDOWS_X64 -> "win"
    HostArch.LINUX_X64 -> "linux"
  }

  /** Map the JVM `os.arch` + `os.name` values onto a [HostArch]. Google publishes Windows and Linux
   * natives for x86_64 only, so those platforms always map to their x64 classifier. */
  fun detectArch(
    osArch: String = System.getProperty("os.arch").orEmpty(),
    osName: String = System.getProperty("os.name").orEmpty(),
  ): HostArch = when {
    osName.startsWith("Windows", ignoreCase = true) -> HostArch.WINDOWS_X64
    osName.startsWith("Linux", ignoreCase = true) -> HostArch.LINUX_X64
    osArch.equals("aarch64", ignoreCase = true) || osArch.contains("arm", ignoreCase = true) -> HostArch.MAC_ARM
    else -> HostArch.MAC_X64
  }

  /** layoutlib jar (bridge+framework classes) + per-arch runtime (natives) + framework resources. */
  fun layoutlibTriple(arch: HostArch, version: String = LAYOUTLIB_VERSION): List<EngineArtifact> = listOf(
    EngineArtifact("com.android.tools.layoutlib", "layoutlib", version, extension = "jar"),
    EngineArtifact(
      "com.android.tools.layoutlib", "layoutlib-runtime", version,
      classifier = runtimeClassifier(arch), extension = "jar", unzip = true,
    ),
    EngineArtifact("com.android.tools.layoutlib", "layoutlib-resources", version, extension = "jar", unzip = true),
  )

  /** `com.android.tools:{layoutlib-api,common,sdk-common,ninepatch}` — Google-Maven-hosted (AD-011). */
  fun toolsJars(version: String = TOOLS_VERSION): List<EngineArtifact> = listOf(
    EngineArtifact("com.android.tools.layoutlib", "layoutlib-api", version, extension = "jar"),
    EngineArtifact("com.android.tools", "common", version, extension = "jar"),
    EngineArtifact("com.android.tools", "sdk-common", version, extension = "jar"),
    EngineArtifact("com.android.tools", "ninepatch", version, extension = "jar"),
  )

  /** Top-level androidx/Material AAR pins (design §D4). Full transitive closure is resolved in T15. */
  val androidxAars: List<EngineArtifact> = listOf(
    EngineArtifact("com.google.android.material", "material", MATERIAL_VERSION, extension = "aar"),
    EngineArtifact("androidx.appcompat", "appcompat", "1.7.0", extension = "aar"),
    EngineArtifact("androidx.constraintlayout", "constraintlayout", "2.2.1", extension = "aar"),
    EngineArtifact("androidx.core", "core", "1.13.1", extension = "aar"),
    EngineArtifact("androidx.recyclerview", "recyclerview", "1.3.2", extension = "aar"),
    EngineArtifact("androidx.cardview", "cardview", "1.0.0", extension = "aar"),
    EngineArtifact("androidx.coordinatorlayout", "coordinatorlayout", "1.2.0", extension = "aar"),
    EngineArtifact("androidx.fragment", "fragment", "1.8.5", extension = "aar"),
    EngineArtifact("androidx.viewpager2", "viewpager2", "1.1.0", extension = "aar"),
  )

  /** The complete download set for one OS/arch. */
  fun all(arch: HostArch): List<EngineArtifact> =
    layoutlibTriple(arch) + toolsJars() + androidxAars
}
