package manifest

import java.io.File
import java.security.MessageDigest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

/**
 * T15 unit coverage for `manifest.ManifestGenerator` — the Gradle-API-free half of
 * `generateEngineManifest` (design §D4/§D6/§Data Models, AD-011). Uses tiny synthetic fixture
 * files (a few bytes each), never the real ~170 MB engine download, per the batch's explicit
 * guidance: this validates the manifest SCHEMA and pin-matrix COMPLETENESS, not a live resolve.
 */
class ManifestTaskTest {

  @TempDir
  lateinit var tempDir: File

  private fun fixtureFile(name: String, content: String): File {
    val f = File(tempDir, name)
    f.writeText(content)
    return f
  }

  private fun sha256Manually(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  @Test
  fun `classifyKind marks layoutlib runtime and resources as unzip, aar extension as aar, else jar`() {
    assertEquals("unzip", ManifestGenerator.classifyKind("layoutlib-runtime", "jar"))
    assertEquals("unzip", ManifestGenerator.classifyKind("layoutlib-resources", "jar"))
    assertEquals("aar", ManifestGenerator.classifyKind("material", "aar"))
    assertEquals("jar", ManifestGenerator.classifyKind("layoutlib", "jar"))
    assertEquals("jar", ManifestGenerator.classifyKind("annotation", "jar"))
  }

  @Test
  fun `mavenUrl builds the standard Maven layout path, with and without a classifier`() {
    val plain = ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib", "14.0.11", null, "jar", File("x"))
    assertEquals(
      "https://dl.google.com/dl/android/maven2/com/android/tools/layoutlib/layoutlib/14.0.11/layoutlib-14.0.11.jar",
      ManifestGenerator.mavenUrl(plain),
    )
    val classified = ResolvedArtifactInfo(
      "com.android.tools.layoutlib", "layoutlib-runtime", "14.0.11", "mac-arm", "jar", File("x"),
    )
    assertEquals(
      "https://dl.google.com/dl/android/maven2/com/android/tools/layoutlib/layoutlib-runtime/14.0.11/layoutlib-runtime-14.0.11-mac-arm.jar",
      ManifestGenerator.mavenUrl(classified),
    )
  }

  @Test
  fun `buildManifest computes real sha256 and size from the given file`() {
    val content = "tiny-fixture-bytes-not-the-real-170mb-engine"
    val file = fixtureFile("layoutlib-14.0.11.jar", content)
    val entry = ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib", "14.0.11", null, "jar", file)

    val manifest = ManifestGenerator.buildManifest(listOf(entry))

    assertEquals(ManifestGenerator.PIN_NAME, manifest.pinName)
    val artifact = manifest.artifacts.single()
    assertEquals(sha256Manually(content.toByteArray()), artifact.sha256)
    assertEquals(content.toByteArray().size.toLong(), artifact.sizeBytes)
    assertEquals("jar", artifact.kind)
  }

  @Test
  fun `manifest contains every D6 pin-matrix artifact by group and name`() {
    val entries = listOf(
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib", "14.0.11", null, "jar", fixtureFile("a", "a")),
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib-runtime", "14.0.11", "mac-arm", "jar", fixtureFile("b", "b")),
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib-runtime", "14.0.11", "mac", "jar", fixtureFile("c", "c")),
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib-resources", "14.0.11", null, "jar", fixtureFile("d", "d")),
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib-api", "31.4.2", null, "jar", fixtureFile("e", "e")),
      ResolvedArtifactInfo("com.android.tools", "common", "31.4.2", null, "jar", fixtureFile("f", "f")),
      ResolvedArtifactInfo("com.android.tools", "sdk-common", "31.4.2", null, "jar", fixtureFile("g", "g")),
      ResolvedArtifactInfo("com.android.tools", "ninepatch", "31.4.2", null, "jar", fixtureFile("h", "h")),
      ResolvedArtifactInfo("com.google.android.material", "material", "1.12.0", null, "aar", fixtureFile("i", "i")),
      ResolvedArtifactInfo("androidx.appcompat", "appcompat", "1.7.0", null, "aar", fixtureFile("j", "j")),
      ResolvedArtifactInfo("androidx.constraintlayout", "constraintlayout", "2.2.1", null, "aar", fixtureFile("k", "k")),
      ResolvedArtifactInfo("androidx.core", "core", "1.13.1", null, "aar", fixtureFile("l", "l")),
      ResolvedArtifactInfo("androidx.recyclerview", "recyclerview", "1.3.2", null, "aar", fixtureFile("m", "m")),
      ResolvedArtifactInfo("androidx.cardview", "cardview", "1.0.0", null, "aar", fixtureFile("n", "n")),
      ResolvedArtifactInfo("androidx.coordinatorlayout", "coordinatorlayout", "1.2.0", null, "aar", fixtureFile("o", "o")),
      ResolvedArtifactInfo("androidx.fragment", "fragment", "1.8.5", null, "aar", fixtureFile("p", "p")),
      ResolvedArtifactInfo("androidx.viewpager2", "viewpager2", "1.1.0", null, "aar", fixtureFile("q", "q")),
      // a transitive that isn't one of the 9 top-level pins, proving the closure isn't limited to them
      ResolvedArtifactInfo("androidx.annotation", "annotation", "1.7.1", null, "jar", fixtureFile("r", "r")),
    )

    val manifest = ManifestGenerator.buildManifest(entries)

    val requiredPins = listOf(
      "com.android.tools.layoutlib" to "layoutlib",
      "com.android.tools.layoutlib" to "layoutlib-resources",
      "com.android.tools.layoutlib" to "layoutlib-api",
      "com.android.tools" to "common",
      "com.android.tools" to "sdk-common",
      "com.android.tools" to "ninepatch",
      "com.google.android.material" to "material",
      "androidx.appcompat" to "appcompat",
      "androidx.constraintlayout" to "constraintlayout",
      "androidx.core" to "core",
      "androidx.recyclerview" to "recyclerview",
      "androidx.cardview" to "cardview",
      "androidx.coordinatorlayout" to "coordinatorlayout",
      "androidx.fragment" to "fragment",
      "androidx.viewpager2" to "viewpager2",
    )
    for ((group, name) in requiredPins) {
      val found = manifest.artifacts.find { it.group == group && it.name == name }
      assertNotNull(found, "expected pin $group:$name to be present in the manifest")
    }
    // The transitive-closure artifact (not a top-level pin) must also be present — the manifest
    // isn't limited to the 9 top-level androidx/Material coordinates (design §D4).
    assertNotNull(manifest.artifacts.find { it.group == "androidx.annotation" && it.name == "annotation" })
    assertEquals(entries.size, manifest.artifacts.size)
  }

  @Test
  fun `per-arch layoutlib-runtime entries are both present and distinguished by classifier`() {
    val entries = listOf(
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib-runtime", "14.0.11", "mac-arm", "jar", fixtureFile("arm", "arm-bytes")),
      ResolvedArtifactInfo("com.android.tools.layoutlib", "layoutlib-runtime", "14.0.11", "mac", "jar", fixtureFile("x64", "x64-bytes")),
    )
    val manifest = ManifestGenerator.buildManifest(entries)
    val runtimes = manifest.artifacts.filter { it.name == "layoutlib-runtime" }
    assertEquals(2, runtimes.size)
    assertEquals(setOf("mac-arm", "mac"), runtimes.map { it.classifier }.toSet())
    runtimes.forEach { assertEquals("unzip", it.kind) }
    // distinct URLs and hashes per arch (they must never collide)
    assertEquals(2, runtimes.map { it.url }.toSet().size)
    assertEquals(2, runtimes.map { it.sha256 }.toSet().size)
  }

  @Test
  fun `toJson round-trips through moshi (manifest schema is well-formed)`() {
    val entry = ResolvedArtifactInfo("androidx.core", "core", "1.13.1", null, "aar", fixtureFile("core.aar", "core-bytes"))
    val manifest = ManifestGenerator.buildManifest(listOf(entry))
    val json = ManifestGenerator.toJson(manifest)
    assertTrue(json.contains("\"pinName\""))
    assertTrue(json.contains("\"sha256\""))

    val moshi = com.squareup.moshi.Moshi.Builder()
      .addLast(com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory())
      .build()
    val parsed = moshi.adapter(EngineManifest::class.java).fromJson(json)
    assertEquals(manifest, parsed)
  }

  @Test
  fun `writeManifest writes valid parseable JSON to disk`() {
    val entry = ResolvedArtifactInfo("androidx.core", "core", "1.13.1", null, "aar", fixtureFile("core.aar", "core-bytes"))
    val manifest = ManifestGenerator.buildManifest(listOf(entry))
    val outFile = File(tempDir, "nested/engine-manifest.json")

    ManifestGenerator.writeManifest(manifest, outFile)

    assertTrue(outFile.exists())
    val moshi = com.squareup.moshi.Moshi.Builder()
      .addLast(com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory())
      .build()
    val reparsed = moshi.adapter(EngineManifest::class.java).fromJson(outFile.readText())
    assertEquals(manifest, reparsed)
  }
}
