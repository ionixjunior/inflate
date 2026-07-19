plugins {
  alias(libs.plugins.kotlin.jvm)
  application
}

application {
  mainClass.set("MainKt")
}

kotlin {
  jvmToolchain(17)
}

// --- engineTest source set (design: integration tests needing cached layoutlib artifacts) ---
val engineTest: SourceSet by sourceSets.creating {
  compileClasspath += sourceSets.main.get().output
  runtimeClasspath += sourceSets.main.get().output
}

configurations {
  named("engineTestImplementation") { extendsFrom(configurations.testImplementation.get()) }
  named("engineTestRuntimeOnly") { extendsFrom(configurations.testRuntimeOnly.get()) }
}

dependencies {
  implementation(libs.paparazzi)
  // Google-Maven tools jars are provided on the runtime classpath from the engine cache;
  // compileOnly here keeps the exact pin (31.4.2) aligned for compilation (design §D2/D6).
  compileOnly(libs.tools.layoutlib.api)
  compileOnly(libs.tools.common)
  compileOnly(libs.tools.sdk.common)
  compileOnly(libs.tools.ninepatch)
  // T12: moshi (already on the Paparazzi classpath, design finding #9) + moshi-kotlin's
  // reflection-based adapter factory for the protocol DTOs (rpc/Dto.kt) — no kapt/KSP needed.
  implementation(libs.moshi)
  implementation(libs.moshi.kotlin)

  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")

  "engineTestImplementation"(platform(libs.junit.bom))
  "engineTestImplementation"(libs.junit.jupiter)
}

// --- AD-009: friend-paths access to Paparazzi 1.3.5 internal machinery ---
// Treat the pinned paparazzi jar as a "friend module" so its Kotlin `internal`
// symbols (Renderer, SessionParamsBuilder, PaparazziCallback, PaparazziLogger,
// LayoutPullParser, internal.resources.*) are usable from the host EngineAdapter.
// If this flag is silently dropped, EngineSurfaceProbe.kt fails to compile.
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
  val friendJars = configurations.named("compileClasspath").map { cfg ->
    cfg.filter { it.name.matches(Regex("""paparazzi-\d[\d.]*\.jar""")) }.asPath
  }
  compilerOptions {
    freeCompilerArgs.add(friendJars.map { "-Xfriend-paths=$it" })
  }
}

tasks.test {
  useJUnitPlatform()
}

// --- T3: dev-time engine artifact fetch (downloads ~170 MB into host/.engine-cache/) ---
tasks.register<JavaExec>("fetchEngine") {
  group = "engine"
  description = "Downloads pinned layoutlib/tools/androidx artifacts into host/.engine-cache/."
  classpath = sourceSets.main.get().runtimeClasspath
  mainClass.set("engine.EngineFetcherKt")
  args(layout.projectDirectory.dir(".engine-cache").asFile.absolutePath)
}

// --- T15: engine-manifest.json generation (design §D4/§D6/§Data Models, AD-011) ---
//
// Two phases, mirroring T3's fetchEngine/EngineFetcher split, because Gradle's dependency
// resolution API (Configuration, ResolvedArtifact) is only reachable from the build script
// itself — never from the project's own compiled main sourceSet — while we want the actual
// manifest-building logic (kind classification, SHA-256, URL construction, JSON schema) to be
// plain, testable Kotlin (manifest.ManifestGenerator, exercised directly by ManifestTaskTest with
// tiny fixtures, no live download):
//
//   Phase 1 (resolveEngineManifestArtifacts, below): resolves the pinned closure via a detached
//   Configuration and writes each artifact's raw facts to a TSV handoff file.
//   Phase 2 (generateEngineManifest, JavaExec): runs manifest.ManifestGeneratorMainKt on the
//   already-compiled main sourceSet classpath, which reads that TSV and writes engine-manifest.json.

// Top-level androidx/Material pins (design §D4) — MIRRORS EngineArtifacts.androidxAars
// (host/src/main/kotlin/engine/EngineArtifacts.kt). Build scripts can't import the project's own
// main sourceSet, so this small (9-entry) coordinate list is intentionally duplicated here; keep
// both lists in sync when the D4 pin table changes.
val manifestAndroidxNotations = listOf(
  "com.google.android.material:material:1.12.0",
  "androidx.appcompat:appcompat:1.7.0",
  "androidx.constraintlayout:constraintlayout:2.2.1",
  "androidx.core:core:1.13.1",
  "androidx.recyclerview:recyclerview:1.3.2",
  "androidx.cardview:cardview:1.0.0",
  "androidx.coordinatorlayout:coordinatorlayout:1.2.0",
  "androidx.fragment:fragment:1.8.5",
  "androidx.viewpager2:viewpager2:1.1.0",
)

// Layoutlib triple (both macOS arches) + tools jars (design §D6) — mirrors EngineArtifacts too.
val manifestFixedNotations = listOf(
  "com.android.tools.layoutlib:layoutlib:14.0.11",
  "com.android.tools.layoutlib:layoutlib-runtime:14.0.11:mac-arm@jar",
  "com.android.tools.layoutlib:layoutlib-runtime:14.0.11:mac@jar",
  "com.android.tools.layoutlib:layoutlib-resources:14.0.11",
  "com.android.tools.layoutlib:layoutlib-api:31.4.2",
  "com.android.tools:common:31.4.2",
  "com.android.tools:sdk-common:31.4.2",
  "com.android.tools:ninepatch:31.4.2",
)

val resolveEngineManifestArtifacts = tasks.register("resolveEngineManifestArtifacts") {
  group = "engine"
  description = "Phase 1 of generateEngineManifest: resolves the pinned dependency closure via " +
    "Gradle's Configuration API and writes a TSV handoff file for the Phase-2 JVM."

  val resolvedTsv = layout.buildDirectory.file("engineManifest/resolved-artifacts.tsv")
  outputs.file(resolvedTsv)

  doLast {
    val notations = (manifestFixedNotations + manifestAndroidxNotations).map { project.dependencies.create(it) }
    val config = configurations.detachedConfiguration(*notations.toTypedArray())
    val resolvedArtifacts = config.resolvedConfiguration.resolvedArtifacts

    val lines = resolvedArtifacts
      .filter { artifact ->
        val group = artifact.moduleVersion.id.group
        group == "com.android.tools.layoutlib" || group == "com.android.tools" ||
          group.startsWith("androidx.") || group == "com.google.android.material"
      }
      .map { artifact ->
        val id = artifact.moduleVersion.id
        listOf(
          id.group,
          artifact.name,
          id.version,
          artifact.classifier ?: "",
          artifact.extension ?: "jar",
          artifact.file.absolutePath,
        ).joinToString("\t")
      }

    val outFile = resolvedTsv.get().asFile
    outFile.parentFile.mkdirs()
    outFile.writeText(if (lines.isEmpty()) "" else lines.joinToString("\n") + "\n")
  }
}

tasks.register<JavaExec>("generateEngineManifest") {
  group = "engine"
  description = "Phase 2: builds extension/engine-manifest.json (sha256/url/kind/schema) from the " +
    "resolved artifact closure — committed to the repo, never hand-maintained (AD-011)."
  dependsOn(resolveEngineManifestArtifacts)
  classpath = sourceSets.main.get().runtimeClasspath
  mainClass.set("manifest.ManifestGeneratorMainKt")
  doFirst {
    val resolvedTsv = resolveEngineManifestArtifacts.get().outputs.files.singleFile
    val outputManifest = layout.projectDirectory.dir("../extension").file("engine-manifest.json").asFile
    args(resolvedTsv.absolutePath, outputManifest.absolutePath)
  }
}

val engineCacheDir = layout.projectDirectory.dir(".engine-cache")

val engineTestTask = tasks.register<Test>("engineTest") {
  description = "Runs engine integration tests against cached layoutlib artifacts."
  group = "verification"
  testClassesDirs = engineTest.output.classesDirs
  classpath = engineTest.runtimeClasspath
  useJUnitPlatform()
  shouldRunAfter(tasks.test)
  // engineTest is intentionally NOT wired into `check`/`build`: it needs the downloaded
  // engine cache (T3) and layoutlib native props, so it is invoked explicitly by gates.

  // Point layoutlib at the unzipped runtime (natives/fonts/ICU) and framework resources (T3).
  systemProperty("paparazzi.layoutlib.runtime.root", engineCacheDir.dir("layoutlib/runtime").asFile.absolutePath)
  systemProperty("paparazzi.layoutlib.resources.root", engineCacheDir.dir("layoutlib/resources").asFile.absolutePath)

  maxHeapSize = "2g"
  // Fresh JVM per test class: the engine holds process-global Bridge state, so class-level
  // isolation avoids cross-test session corruption during the M0 spikes.
  setForkEvery(1)
  // layoutlib + ByteBuddy reflect into JDK internals; JPMS opens required under JDK 17.
  jvmArgs(
    "--add-opens=java.base/java.lang=ALL-UNNAMED",
    "--add-opens=java.base/java.lang.reflect=ALL-UNNAMED",
    "--add-opens=java.base/java.util=ALL-UNNAMED",
    "--add-opens=java.base/java.io=ALL-UNNAMED",
    "--add-opens=java.base/java.net=ALL-UNNAMED",
    "--add-opens=java.base/java.nio=ALL-UNNAMED",
    "--add-opens=java.base/java.security=ALL-UNNAMED",
    "--add-opens=java.base/sun.util.calendar=ALL-UNNAMED",
    "--add-opens=java.desktop/sun.awt.image=ALL-UNNAMED",
    "--add-opens=java.desktop/java.awt=ALL-UNNAMED",
  )
}
