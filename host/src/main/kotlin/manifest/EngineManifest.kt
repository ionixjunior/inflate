package manifest

import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import engine.EngineArtifacts
import java.io.File
import java.security.MessageDigest

/** One entry in `engine-manifest.json` (design §Data Models, AD-011). */
@JsonClass(generateAdapter = false)
data class ManifestArtifact(
  val group: String,
  val name: String,
  val version: String,
  val classifier: String? = null,
  /** Transport-handling marker for `ArtifactManager` (T16) — NOT the file extension: `"unzip"` for
   * the layoutlib runtime/resources jars (which get unzipped into directories), `"aar"` for
   * androidx/Material archives (extracted into classes.jar + res/), `"jar"` for everything else. */
  val kind: String,
  val url: String,
  val sha256: String,
  val sizeBytes: Long,
)

/** `engine-manifest.json` (design §D4/§D6/§Data Models): `{ pinName, artifacts: [...] }`. */
@JsonClass(generateAdapter = false)
data class EngineManifest(
  val pinName: String,
  val artifacts: List<ManifestArtifact>,
)

/**
 * Plain (Gradle-API-free) description of one resolved artifact — constructed either from a real
 * resolved Gradle `Configuration` (in `build.gradle.kts`, the only place that API is reachable) or
 * from tiny synthetic fixtures in `ManifestTaskTest`. No knowledge of Gradle types here on purpose:
 * this is what keeps [ManifestGenerator] unit-testable without a live ~170 MB engine download.
 */
data class ResolvedArtifactInfo(
  val group: String,
  val name: String,
  val version: String,
  val classifier: String?,
  val extension: String,
  val file: File,
)

/**
 * Builds and writes `engine-manifest.json` (T15) from a list of already-resolved artifacts.
 * The Gradle task (`generateEngineManifest`, `host/build.gradle.kts`) resolves the pinned
 * layoutlib/tools/androidx-Material closure via Gradle's Configuration API — the actual dependency
 * *resolution* can only run inside the Gradle process itself — then hands the raw facts to a
 * spawned JVM (mirroring T3's `fetchEngine`/`EngineFetcher` split) that calls into this object,
 * which is what `ManifestTaskTest` exercises directly.
 */
object ManifestGenerator {
  const val PIN_NAME = "paparazzi-1.3.5+layoutlib-14.0.11"

  private val moshi: Moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()

  /** `"unzip"` for the layoutlib runtime/resources jars, `"aar"` for AAR archives, else `"jar"`. */
  fun classifyKind(name: String, extension: String): String = when {
    name == "layoutlib-runtime" || name == "layoutlib-resources" -> "unzip"
    extension == "aar" -> "aar"
    else -> "jar"
  }

  fun mavenUrl(entry: ResolvedArtifactInfo, baseUrl: String = EngineArtifacts.GOOGLE_MAVEN): String {
    val base = baseUrl.trimEnd('/')
    val groupPath = entry.group.replace('.', '/')
    val fileName = buildString {
      append(entry.name).append('-').append(entry.version)
      if (entry.classifier != null) append('-').append(entry.classifier)
      append('.').append(entry.extension)
    }
    return "$base/$groupPath/${entry.name}/${entry.version}/$fileName"
  }

  fun sha256Of(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buf = ByteArray(1 shl 16)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  fun buildManifest(
    entries: List<ResolvedArtifactInfo>,
    baseUrl: String = EngineArtifacts.GOOGLE_MAVEN,
    pinName: String = PIN_NAME,
  ): EngineManifest {
    val artifacts = entries.map { entry ->
      ManifestArtifact(
        group = entry.group,
        name = entry.name,
        version = entry.version,
        classifier = entry.classifier,
        kind = classifyKind(entry.name, entry.extension),
        url = mavenUrl(entry, baseUrl),
        sha256 = sha256Of(entry.file),
        sizeBytes = entry.file.length(),
      )
    }
    return EngineManifest(pinName, artifacts)
  }

  fun toJson(manifest: EngineManifest): String =
    moshi.adapter(EngineManifest::class.java).indent("  ").toJson(manifest)

  fun writeManifest(manifest: EngineManifest, outputFile: File) {
    outputFile.parentFile?.mkdirs()
    outputFile.writeText(toJson(manifest) + "\n")
  }
}
