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

val engineTestTask = tasks.register<Test>("engineTest") {
  description = "Runs engine integration tests against cached layoutlib artifacts."
  group = "verification"
  testClassesDirs = engineTest.output.classesDirs
  classpath = engineTest.runtimeClasspath
  useJUnitPlatform()
  shouldRunAfter(tasks.test)
  // engineTest is intentionally NOT wired into `check`/`build`: it needs the downloaded
  // engine cache (T3) and layoutlib native props, so it is invoked explicitly by gates.
}
