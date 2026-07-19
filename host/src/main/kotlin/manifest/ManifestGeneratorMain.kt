package manifest

import java.io.File

/**
 * Phase-2 entry point for the `generateEngineManifest` Gradle task (T15). Phase 1
 * (`host/build.gradle.kts`, task `resolveEngineManifestArtifacts`) resolves the pinned dependency
 * closure using Gradle's own `Configuration` API — the only place that API is reachable from — and
 * writes each artifact's raw facts as one tab-separated line (`group\tname\tversion\tclassifier\t
 * extension\tabsoluteFilePath`) to [args][0]. This `main()` runs in a spawned JVM on the
 * already-compiled main sourceSet's classpath (mirroring T3's `fetchEngine`/`EngineFetcher` split)
 * so the actual manifest-building logic stays in testable, Gradle-API-free Kotlin
 * ([ManifestGenerator]) rather than inline script code.
 */
fun main(args: Array<String>) {
  require(args.size == 2) { "usage: <resolvedArtifactsTsvPath> <outputManifestJsonPath>" }
  val (tsvPath, outputPath) = args

  val entries = File(tsvPath).readLines()
    .filter { it.isNotBlank() }
    .map { line ->
      val parts = line.split('\t')
      check(parts.size == 6) { "malformed resolved-artifact line (expected 6 tab-separated fields): $line" }
      ResolvedArtifactInfo(
        group = parts[0],
        name = parts[1],
        version = parts[2],
        classifier = parts[3].ifEmpty { null },
        extension = parts[4],
        file = File(parts[5]),
      )
    }

  val manifest = ManifestGenerator.buildManifest(entries)
  val outFile = File(outputPath)
  ManifestGenerator.writeManifest(manifest, outFile)
  println("Wrote engine manifest with ${entries.size} artifacts to ${outFile.absolutePath}")
}
