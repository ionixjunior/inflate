package engine

import com.android.ide.common.symbols.IdProvider
import com.android.ide.common.symbols.RGeneration
import com.android.ide.common.symbols.Symbol
import com.android.ide.common.symbols.SymbolIo
import com.android.ide.common.symbols.SymbolTable
import com.android.ide.common.symbols.mergeAndRenumberSymbols
import java.io.File
import java.util.jar.JarEntry
import java.util.jar.JarOutputStream
import javax.tools.ToolProvider

/**
 * Generates and compiles the `R` classes for the bundled androidx/Material AARs (T39, LAY-05).
 *
 * The AAR view classes reference their package's `R$styleable` / `R$style` / `R$attr` in bytecode
 * (e.g. `MaterialButton.<clinit>` reads `com.google.android.material.R$style`), but AARs ship no
 * compiled `R` classes — only an `R.txt` symbol list with placeholder (`0x0`) ids. Without them the
 * classes throw `NoClassDefFoundError` on inflation. AGP normally generates these at app-build time;
 * we have no build system (AD-001), so we run AGP's own symbol machinery (bundled in
 * `com.android.tools:sdk-common`) ourselves:
 *
 *  1. Read every AAR `R.txt` into a per-library [SymbolTable] (structure only — ids discarded).
 *  2. [mergeAndRenumberSymbols] assigns ONE consistent id per resource across all libraries (the
 *     same shared id space AGP builds), so a styleable array in one library and the attr field it
 *     references in another agree.
 *  3. [RGeneration.generateRForLibraries] emits each library's `R.java` using those shared ids.
 *  4. Compile the sources with the JDK compiler and pack the classes into one jar.
 *
 * The jar joins the engine classpath and every package is listed in `resourcePackageNames`, so
 * `PaparazziCallback.initResources` reads the fields back and maps each id → resource reference —
 * making library-resource resolution (LAY-05, LAY-06) work under the dynamic-id scheme (Q3).
 */
object RClassGenerator {

  const val MAIN_PACKAGE = "com.inflate.preview"

  /**
   * Generate + compile R classes for every `<package>.txt` R.txt file in [rTxtDir] into [outJar].
   * Returns the list of package names for which an R class was produced (feeds `resourcePackageNames`).
   */
  fun generate(rTxtDir: File, workDir: File, outJar: File): List<String> {
    val rTxtFiles = rTxtDir.listFiles { f -> f.isFile && f.extension == "txt" }?.sortedBy { it.name }
      ?: emptyList()
    require(rTxtFiles.isNotEmpty()) { "no R.txt files found under $rTxtDir" }

    val libraryTables: List<SymbolTable> = rTxtFiles.map { f ->
      val packageName = f.name.removeSuffix(".txt")
      SymbolIo.readFromAaptNoValues(f, packageName)
    }

    // Empty main table: we own no app resources.
    val emptyMain = SymbolTable.builder().tablePackage(MAIN_PACKAGE).build()
    // Platform (android:) attr table. Library styleables reference framework attrs (e.g.
    // `android:textAppearance`) by name; `mergeAndRenumberSymbols` substitutes each such slot with
    // the id from this table (and writes 0 when it is absent). An EMPTY table therefore zeroed every
    // framework-attr slot in every generated styleable array — so at render time
    // `obtainStyledAttributes(...).getResourceId(android:textAppearance, -1)` read 0 and returned -1,
    // tripping Material's `ThemeEnforcement.checkTextAppearance` (Chip/ExtendedFAB/BottomNavigationView
    // degraded; widget tints fell back to the magenta unresolved-color placeholder). We ship no
    // Android SDK (AD-006), but the real framework ids are already baked into the AAR R.txt styleable
    // arrays (aapt2 emitted them against the AAR's compileSdk); reconstruct the platform table from
    // them so each android: slot keeps its canonical framework id, which layoutlib resolves natively.
    val platform = platformAttrSymbols(rTxtFiles)
    val merged = mergeAndRenumberSymbols(MAIN_PACKAGE, emptyMain, libraryTables, platform, IdProvider.sequential())

    val srcDir = File(workDir, "src").apply { deleteRecursively(); mkdirs() }
    RGeneration.generateRForLibraries(merged, libraryTables, srcDir, /* finalIds = */ false)

    val classesDir = File(workDir, "classes").apply { deleteRecursively(); mkdirs() }
    compile(srcDir, classesDir)
    packJar(classesDir, outJar)

    return libraryTables.map { it.tablePackage }
  }

  /** `android:`/`android_` prefix length ("android:" and "android_" are both 8 chars). */
  private const val ANDROID_PREFIX_LEN = 8

  /**
   * Reconstruct the framework (`android:`) ATTR symbol table from the framework ids that aapt2 baked
   * into the AAR R.txt styleable arrays. For every styleable child named `android:<attr>` /
   * `android_<attr>`, the id at the child's array index is the canonical framework attr id; collect
   * them (first non-zero wins — they are globally fixed) into an `android`-package [SymbolTable] that
   * feeds [mergeAndRenumberSymbols] so framework-attr slots keep their real ids instead of 0.
   */
  private fun platformAttrSymbols(rTxtFiles: List<File>): SymbolTable {
    val byName = LinkedHashMap<String, Int>()
    for (f in rTxtFiles) {
      val pkg = f.name.removeSuffix(".txt")
      val table = SymbolIo.readFromAapt(f, pkg)
      for (symbol in table.symbols.values()) {
        if (symbol !is Symbol.StyleableSymbol) continue
        val children = symbol.children
        val values = symbol.values
        for (i in children.indices) {
          val child = children[i]
          if (!child.startsWith("android:") && !child.startsWith("android_")) continue
          val id = values.getOrNull(i) ?: continue
          if (id == 0) continue
          val name = child.substring(ANDROID_PREFIX_LEN)
          byName.putIfAbsent(name, id)
        }
      }
    }
    val builder = SymbolTable.builder().tablePackage("android")
    for ((name, id) in byName) builder.add(Symbol.attributeSymbol(name, id, false))
    return builder.build()
  }

  private fun compile(srcDir: File, classesDir: File) {
    val sources = srcDir.walkTopDown().filter { it.isFile && it.extension == "java" }.map { it.absolutePath }.toList()
    if (sources.isEmpty()) return
    val compiler = ToolProvider.getSystemJavaCompiler()
      ?: error("no system Java compiler available (JDK, not JRE, is required)")
    val args = mutableListOf("-d", classesDir.absolutePath, "-nowarn", "-proc:none")
    args += sources
    val rc = compiler.run(null, null, System.err, *args.toTypedArray())
    check(rc == 0) { "R class compilation failed (javac exit $rc)" }
  }

  private fun packJar(classesDir: File, outJar: File) {
    outJar.parentFile?.mkdirs()
    JarOutputStream(outJar.outputStream().buffered()).use { jar ->
      classesDir.walkTopDown().filter { it.isFile }.forEach { file ->
        val entryName = classesDir.toPath().relativize(file.toPath()).toString().replace(File.separatorChar, '/')
        jar.putNextEntry(JarEntry(entryName))
        file.inputStream().use { it.copyTo(jar) }
        jar.closeEntry()
      }
    }
  }
}

/** Entry point for the `generateEngineTestRClasses` Gradle task. args: rTxtDir workDir outJar packagesOut. */
fun main(args: Array<String>) {
  require(args.size >= 4) { "usage: <rTxtDir> <workDir> <outJar> <packagesOut>" }
  val packages = RClassGenerator.generate(File(args[0]), File(args[1]), File(args[2]))
  File(args[3]).writeText(packages.joinToString("\n"))
  System.err.println("Generated R classes for ${packages.size} packages into ${args[2]}")
}
