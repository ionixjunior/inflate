package engine

import java.io.File
import java.nio.file.Files

/** Shared helpers for engineTest integration tests (cache roots + writable fixture copies). */
object EngineTestSupport {

  /** layoutlib runtime root (unzipped natives/fonts/ICU), from the engineTest task system prop. */
  fun runtimeRoot(): File = File(
    System.getProperty("paparazzi.layoutlib.runtime.root")
      ?: error("paparazzi.layoutlib.runtime.root not set — run ./gradlew fetchEngine first"),
  ).also { require(it.isDirectory) { "runtime root missing: $it (run ./gradlew fetchEngine)" } }

  /** layoutlib framework resources root (unzipped res/), from the engineTest task system prop. */
  fun resourcesRoot(): File = File(
    System.getProperty("paparazzi.layoutlib.resources.root")
      ?: error("paparazzi.layoutlib.resources.root not set — run ./gradlew fetchEngine first"),
  ).also { require(it.isDirectory) { "resources root missing: $it (run ./gradlew fetchEngine)" } }

  /**
   * Copy a classpath fixture `"$name/res"` into a fresh writable temp dir and return the copied
   * `res` directory, so tests can edit resource files on disk (hot-reload scenarios).
   */
  fun copyFixtureRes(name: String): File {
    val url = EngineTestSupport::class.java.classLoader.getResource("$name/res")
      ?: error("fixture resource '$name/res' not found on the engineTest classpath")
    val source = File(url.toURI())
    val dest = Files.createTempDirectory("inflate-fixture-$name").toFile()
    val destRes = File(dest, "res")
    source.copyRecursively(destRes, overwrite = true)
    return destRes
  }

  /** Repo-level `fixtures/` dir (engineTest working dir is `host/`, so fixtures live at `../fixtures`). */
  fun fixturesRoot(): File {
    val candidates = listOf(
      File(System.getProperty("user.dir"), "../fixtures"),
      File("../fixtures"),
      File("fixtures"),
    )
    return candidates.map { it.absoluteFile.normalize() }.firstOrNull { it.isDirectory }
      ?: error("fixtures dir not found (user.dir=${System.getProperty("user.dir")})")
  }

  /** Copy a repo fixture tree (e.g. `"gradle-sample"`) into a fresh writable temp dir; return it. */
  fun copyFixtureTree(name: String): File {
    val src = File(fixturesRoot(), name)
    require(src.isDirectory) { "fixture tree '$name' missing at $src" }
    val dest = Files.createTempDirectory("inflate-tree-$name").toFile()
    src.copyRecursively(dest, overwrite = true)
    return dest
  }

  /**
   * `res/` dirs of the bundled androidx/Material AAR closure, extracted by the `prepareEngineTestLibs`
   * Gradle task (T39) and located via the `inflate.engineTest.libResRoot` system property. These feed
   * [EngineAdapter]'s library resource repositories so `@style/Widget.Material3.*` etc. resolve.
   */
  fun libResDirs(): List<File> {
    val root = File(System.getProperty("inflate.engineTest.libResRoot") ?: return emptyList())
    if (!root.isDirectory) return emptyList()
    return root.listFiles()?.sorted()?.mapNotNull { File(it, "res").takeIf(File::isDirectory) } ?: emptyList()
  }

  /** Declared package names of the bundled AAR closure (from the `prepareEngineTestLibs` task). */
  fun libPackages(): List<String> {
    val f = File(System.getProperty("inflate.engineTest.libPackages") ?: return emptyList())
    return if (f.isFile) f.readLines().map(String::trim).filter(String::isNotEmpty) else emptyList()
  }

  /**
   * Package names for which R classes were generated + compiled (`generateEngineTestRClasses`, T39).
   * These feed `resourcePackageNames` so `PaparazziCallback.initResources` registers library ids.
   */
  fun rPackages(): List<String> {
    val f = File(System.getProperty("inflate.engineTest.rPackages") ?: return emptyList())
    return if (f.isFile) f.readLines().map(String::trim).filter(String::isNotEmpty) else emptyList()
  }

  /** Center-pixel ARGB of an image (used to assert a rendered color). */
  fun centerArgb(image: java.awt.image.BufferedImage): Int =
    image.getRGB(image.width / 2, image.height / 2)

  fun red(argb: Int) = (argb shr 16) and 0xFF
  fun green(argb: Int) = (argb shr 8) and 0xFF
  fun blue(argb: Int) = argb and 0xFF
  fun alpha(argb: Int) = (argb shr 24) and 0xFF
}
