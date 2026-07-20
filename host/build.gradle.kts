plugins {
  alias(libs.plugins.kotlin.jvm)
  application
  alias(libs.plugins.shadow)
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
  // T38b: ASM class rename to synthesise the framework "delegate" classes (android.os.Build etc.)
  // that layoutlib renames to _Original_* but does not ship — see FrameworkDelegateGenerator.
  implementation(libs.asm)
  implementation(libs.asm.commons)

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

// --- T39: bundled androidx/Material library artifacts for engineTest ---
// Real Material rendering (P1-B, LAY-05) needs the AAR classes on the engine classpath and their
// res/ dirs available as library resource repositories. This mirrors, for the in-JVM engineTest,
// what `ArtifactManager` does per-user on the extension side: resolve the D4 closure, then extract
// each AAR's `classes.jar` (→ engine classpath) and `res/` (→ library repositories), plus each
// AAR's declared package name (→ generated R classes / resourcePackageNames).
val engineTestLibs: Configuration by configurations.creating { isTransitive = true }
dependencies {
  manifestAndroidxNotations.forEach { engineTestLibs(it) }
}

val engineTestLibsDir = layout.buildDirectory.dir("engineTestLibs")

val prepareEngineTestLibs = tasks.register("prepareEngineTestLibs") {
  group = "engine"
  description = "Extracts the androidx/Material AAR closure (classes.jar + res/ + package names) " +
    "for the engineTest classpath and library resource repositories (T39)."
  val libFiles = engineTestLibs
  val outProvider = engineTestLibsDir
  inputs.files(libFiles)
  outputs.dir(outProvider)
  doLast {
    val out = outProvider.get().asFile
    out.deleteRecursively()
    val jarsDir = out.resolve("jars").apply { mkdirs() }
    val resDir = out.resolve("res").apply { mkdirs() }
    val rtxtDir = out.resolve("rtxt").apply { mkdirs() }
    val pkgs = linkedSetOf<String>()
    libFiles.files.forEach { f ->
      when (f.extension) {
        "jar" -> f.copyTo(jarsDir.resolve(f.name), overwrite = true)
        "aar" -> {
          val base = f.nameWithoutExtension
          val tmp = out.resolve("unzip/$base").apply { mkdirs() }
          project.copy {
            from(project.zipTree(f))
            into(tmp)
          }
          tmp.resolve("classes.jar").takeIf { it.exists() }
            ?.copyTo(jarsDir.resolve("$base-classes.jar"), overwrite = true)
          tmp.resolve("res").takeIf { it.isDirectory }
            ?.copyRecursively(resDir.resolve(base).resolve("res"), overwrite = true)
          val pkg = tmp.resolve("AndroidManifest.xml").takeIf { it.exists() }?.let { m ->
            Regex("""package\s*=\s*"([^"]+)"""").find(m.readText())?.groupValues?.get(1)
          }
          if (pkg != null) {
            pkgs.add(pkg)
            // R.txt keyed by package, for the R-class generator (T39). No R.txt ⇒ resource-only AAR.
            tmp.resolve("R.txt").takeIf { it.isFile }?.copyTo(rtxtDir.resolve("$pkg.txt"), overwrite = true)
          }
        }
      }
    }
    out.resolve("packages.txt").writeText(pkgs.joinToString("\n"))
  }
}

// AGP symbol machinery (sdk-common) + transitives (guava, kotlin-stdlib) for the R-class generator.
val rClassTools: Configuration by configurations.creating
dependencies {
  rClassTools(libs.tools.sdk.common)
  rClassTools(libs.tools.common)
  rClassTools(libs.tools.layoutlib.api)
}

val engineTestRClassesJar = engineTestLibsDir.map { it.file("R-classes.jar") }
val engineTestRPackagesFile = engineTestLibsDir.map { it.file("r-packages.txt") }

val generateEngineTestRClasses = tasks.register<JavaExec>("generateEngineTestRClasses") {
  group = "engine"
  description = "Generates + compiles R classes for the bundled AAR closure so real Material/androidx " +
    "view classes inflate under the dynamic-id scheme (T39)."
  dependsOn(prepareEngineTestLibs)
  classpath = sourceSets.main.get().output + rClassTools
  mainClass.set("engine.RClassGeneratorKt")
  inputs.dir(engineTestLibsDir.map { it.dir("rtxt") })
  outputs.file(engineTestRClassesJar)
  outputs.file(engineTestRPackagesFile)
  doFirst {
    args(
      engineTestLibsDir.get().dir("rtxt").asFile.absolutePath,
      engineTestLibsDir.get().dir("rgen").asFile.absolutePath,
      engineTestRClassesJar.get().asFile.absolutePath,
      engineTestRPackagesFile.get().asFile.absolutePath,
    )
  }
}

// --- T38b: framework-delegate classes (android.os.Build etc.) synthesised from layoutlib ---
// layoutlib renames six framework classes to _Original_* and expects the canonical names to be
// resolvable separately (from the mockable android.jar in a normal Android unit test). Inflate ships
// no Android SDK (AD-006), so FrameworkDelegateGenerator ASM-renames those _Original_* classes back to
// their canonical names into a jar that joins the engine classpath — otherwise library views whose
// constructors read android.os.Build$VERSION.SDK_INT (e.g. MaterialButton) fail with NoClassDefFoundError.
val layoutlibClasses: Configuration by configurations.creating { isTransitive = false }
dependencies {
  layoutlibClasses("com.android.tools.layoutlib:layoutlib:${libs.versions.layoutlib.get()}")
}

val frameworkDelegatesJar = engineTestLibsDir.map { it.file("framework-delegates.jar") }

val generateFrameworkDelegates = tasks.register<JavaExec>("generateFrameworkDelegates") {
  group = "engine"
  description = "Synthesises the android.os.Build etc. framework delegate classes layoutlib omits, " +
    "by ASM-renaming its _Original_* classes to canonical names (T38b, AD-014)."
  classpath = sourceSets.main.get().output + configurations.runtimeClasspath.get()
  mainClass.set("engine.FrameworkDelegateGeneratorKt")
  val layoutlibJar = layoutlibClasses
  inputs.files(layoutlibJar)
  outputs.file(frameworkDelegatesJar)
  doFirst {
    args(layoutlibJar.singleFile.absolutePath, frameworkDelegatesJar.get().asFile.absolutePath)
  }
}

val engineTestTask = tasks.register<Test>("engineTest") {
  dependsOn(prepareEngineTestLibs, generateEngineTestRClasses, generateFrameworkDelegates)
  description = "Runs engine integration tests against cached layoutlib artifacts."
  group = "verification"
  testClassesDirs = engineTest.output.classesDirs
  classpath = engineTest.runtimeClasspath
  // AAR/JAR classes + generated R classes from the bundled androidx/Material closure join the engine
  // classpath so real Material widgets inflate (no MockView) — res dirs / package lists reach the
  // test via props.
  classpath += fileTree(engineTestLibsDir) { include("jars/*.jar") }
  classpath += files(engineTestRClassesJar)
  // Framework delegates (android.os.Build etc.) so library view constructors resolve them (T38b).
  classpath += files(frameworkDelegatesJar)
  systemProperty("inflate.engineTest.libResRoot", engineTestLibsDir.get().dir("res").asFile.absolutePath)
  systemProperty("inflate.engineTest.libPackages", engineTestLibsDir.get().file("packages.txt").asFile.absolutePath)
  systemProperty("inflate.engineTest.rPackages", engineTestRPackagesFile.get().asFile.absolutePath)
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

// The JPMS opens engineTest passes as jvmArgs — mirrored verbatim for any standalone real-host
// spawn (T54 corpus runner, T57 perf, T58 chaos) so those spawns need not re-derive the list.
val standaloneHostJvmOpens = listOf(
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

// --- T54/T57/T58: real-host classpath assembly for standalone (non-engineTest) JVM spawns ---
//
// engineTest already assembles a working real-host classpath (main output + runtime deps +
// AAR classes.jar + generated R classes + framework-delegates.jar) plus the layoutlib runtime/
// resources system props and JPMS --add-opens. The corpus runner, perf harness, and chaos suite all
// need to spawn the SAME real host standalone, over the real LSP protocol, so this task dumps that
// exact assembly to a JSON file rather than re-deriving it — "reuse, don't reinvent" (batch brief).
val corpusClasspathFile = layout.buildDirectory.file("corpus/host-launch.json")

val writeCorpusClasspath = tasks.register("writeCorpusClasspath") {
  group = "engine"
  description = "Writes the assembled standalone real-host classpath + launch config as JSON, for " +
    "corpus/perf/chaos runners that spawn MainKt directly (T54/T57/T58)."
  dependsOn(prepareEngineTestLibs, generateEngineTestRClasses, generateFrameworkDelegates)

  val mainRuntimeCp = sourceSets.main.get().runtimeClasspath
  val mainClassesDirs = sourceSets.main.get().output.classesDirs
  val mainResourcesDir = sourceSets.main.get().output.resourcesDir
  val libsDir = engineTestLibsDir
  val rClassesJarProvider = engineTestRClassesJar
  val delegatesJarProvider = frameworkDelegatesJar
  val outFile = corpusClasspathFile
  val runtimeRoot = engineCacheDir.dir("layoutlib/runtime").asFile
  val resourcesRoot = engineCacheDir.dir("layoutlib/resources").asFile
  val jvmOpens = standaloneHostJvmOpens

  inputs.files(mainRuntimeCp)
  outputs.file(outFile)

  doLast {
    fun jsonStr(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    fun jsonArr(items: List<String>) = items.joinToString(",", "[", "]") { jsonStr(it) }

    val jars = mutableListOf<String>()
    jars += mainClassesDirs.map { it.absolutePath }
    mainResourcesDir?.let { jars += it.absolutePath }
    jars += mainRuntimeCp.files.map { it.absolutePath }
    jars += fileTree(libsDir) { include("jars/*.jar") }.files.map { it.absolutePath }
    jars += rClassesJarProvider.get().asFile.absolutePath
    jars += delegatesJarProvider.get().asFile.absolutePath

    val libResRoot = libsDir.get().dir("res").asFile
    val libraryResDirs = (libResRoot.listFiles { f -> f.isDirectory } ?: emptyArray())
      .map { it.resolve("res") }
      .filter { it.isDirectory }
      .map { it.absolutePath }
    val libraryPackages = linkedSetOf<String>()
    libsDir.get().file("packages.txt").asFile.takeIf { it.isFile }
      ?.readLines()?.filter { it.isNotBlank() }?.let { libraryPackages.addAll(it) }
    engineTestRPackagesFile.get().asFile.takeIf { it.isFile }
      ?.readLines()?.filter { it.isNotBlank() }?.let { libraryPackages.addAll(it) }

    val json = buildString {
      append("{\n")
      append("  \"classpath\": ${jsonArr(jars)},\n")
      append("  \"jvmArgs\": ${jsonArr(jvmOpens)},\n")
      append("  \"layoutlibRuntimeRoot\": ${jsonStr(runtimeRoot.absolutePath)},\n")
      append("  \"layoutlibResourcesRoot\": ${jsonStr(resourcesRoot.absolutePath)},\n")
      append("  \"libraryResDirs\": ${jsonArr(libraryResDirs)},\n")
      append("  \"libraryPackages\": ${jsonArr(libraryPackages.toList())}\n")
      append("}\n")
    }
    val f = outFile.get().asFile
    f.parentFile.mkdirs()
    f.writeText(json)
  }
}

// --- T60: host fat-jar for the shipped VSIX (AD-011) ---
//
// The fat jar bundles our code + Paparazzi + every Maven-Central-hosted transitive (moshi, asm,
// kotlin stdlib, guava, bytebuddy, kxml2, jna, bouncycastle, jaxb, protobuf, gson, and the rest of
// Paparazzi's own dependency graph) so the VSIX needs no further Maven-Central network access ever.
// It deliberately EXCLUDES the exact Google-Maven artifacts ArtifactManager downloads per-user into
// the versioned cache (layoutlib + layoutlib-api + common + sdk-common + ninepatch — the coordinates
// in EngineArtifacts.kt's fixed pin table) so those ~140 MB of natives/resources are never duplicated
// into the ~25-40 MB VSIX; they join the classpath at runtime from the download cache instead (see
// `extension/src/host.ts`'s `buildJavaCommand` / `extension/src/artifacts.ts`'s `resolvePaths`).
// The `application` plugin's own distribution tasks (a plain non-fat run-script zip/tar) are never
// used — we only added `application` for its `mainClass` wiring, which `shadowJar` reads
// automatically. Left enabled, they race `shadowJar` over the same `build/libs/` output directory
// (a Gradle task-validation failure: "uses this output... without declaring a dependency"); disabling
// them is simpler and more correct than adding artificial ordering to tasks we don't want to run.
tasks.named("distTar") { enabled = false }
tasks.named("distZip") { enabled = false }
tasks.named("startScripts") { enabled = false }
// Shadow's own application-plugin integration registers an equivalent set of "run the fat jar via a
// start script + its own dist zip/tar" tasks — same story, same fix (we only ever run `shadowJar`
// then copy the jar ourselves, per docs/release-checklist.md).
tasks.named("startShadowScripts") { enabled = false }
tasks.named("shadowDistTar") { enabled = false }
tasks.named("shadowDistZip") { enabled = false }

tasks.shadowJar {
  archiveFileName.set("inflate-host.jar")
  // mainClass mirrors the `application` block automatically (shadow's application-plugin integration).
  dependencies {
    exclude(dependency("com.android.tools.layoutlib:layoutlib:.*"))
    exclude(dependency("com.android.tools.layoutlib:layoutlib-api:.*"))
    exclude(dependency("com.android.tools:common:.*"))
    exclude(dependency("com.android.tools:sdk-common:.*"))
    exclude(dependency("com.android.tools:ninepatch:.*"))
    // Android Studio's own usage-analytics protobuf message schema (~2800 classes, ~7.7 MB) — pure
    // data-class definitions for a UsageTracker our narrow EngineAdapter usage never invokes. Unlike
    // `minimize()` (see note below), excluding this ONE specific, well-understood artifact wholesale
    // is deterministic and safe: nothing in the render path constructs or reflects on analytics protos.
    exclude(dependency("com.android.tools.analytics-library:protos:.*"))
  }
  // AD-004: v1 is macOS-only — JNA's Windows-specific platform bindings (bundled inside jna-platform,
  // which also carries the macOS bindings EngineAdapter/layoutlib actually use) are dead weight.
  exclude("com/sun/jna/platform/win32/**")
  // SPEC_DEVIATION (T60, AD-011 size estimate): `minimize()` was also tried, to shrink further toward
  // AD-011's ~25-40 MB estimate, but its static reachability analysis broke the REAL engine twice in
  // a row when smoke-tested end to end — first stripping kotlin-reflect (moshi-kotlin's Kotlin
  // adapter needs it reflectively: `KotlinReflectionNotSupportedError`), then (even after excluding
  // that) stripping `gnu.trove.THashMap` (needed by the bundled tools/layoutlib-adjacent code paths).
  // Each fix surfaced a NEW missing class rather than converging, which is exactly the whack-a-mole
  // risk minimize()'s docs warn about for reflection-heavy dependency graphs (Kotlin reflection,
  // ServiceLoader-based layoutlib providers). Shipping an unverified minimized jar risks a broken
  // render host in production, which is a far worse outcome than a smaller VSIX — so minimize() is
  // NOT used; only the specific, well-understood exclusions above (downloaded-separately Google-Maven
  // coordinates, analytics protos, Windows-only JNA bindings) are applied. Real measured size: ~40 MB
  // (see docs/release-checklist.md) — smoke-tested end to end (real corpus renders) after every change.
}

// Convenience alias matching the naming used elsewhere in this file's engine-* tasks.
tasks.register("buildHostFatJar") {
  group = "engine"
  description = "Builds the host fat-jar (T60, AD-011) embedded in the VSIX at extension/host.jar."
  dependsOn(tasks.shadowJar)
}
