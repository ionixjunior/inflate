package engine

import org.objectweb.asm.ClassReader
import org.objectweb.asm.ClassWriter
import org.objectweb.asm.commons.ClassRemapper
import org.objectweb.asm.commons.Remapper
import java.io.File
import java.util.jar.JarEntry
import java.util.jar.JarFile
import java.util.jar.JarOutputStream

/**
 * Synthesises the framework "delegate" classes that layoutlib expects but does not ship (T38b, AD-014).
 *
 * ## The gap
 * layoutlib's `layoutlib_create` transform renames six framework classes to `_Original_*`
 * (`android.os.Build`, `android.os.ServiceManager`, `android.view.SurfaceView`,
 * `android.view.WindowManagerImpl`, `android.view.textservice.TextServicesManager`,
 * `android.webkit.WebView`) and expects the *canonical* names (`android.os.Build`, …) to be resolvable
 * separately. In a normal Android unit-test run those canonical classes come from the mockable
 * `android.jar` that the Android Gradle Plugin puts on the test runtime classpath — that is how
 * Paparazzi's own androidx/Material tests resolve `android.os.Build`. Inflate ships **no Android SDK**
 * (AD-006), so those six classes are simply absent, and any library view whose `<clinit>`/constructor
 * reads `android.os.Build$VERSION.SDK_INT` (e.g. `MaterialButton`) fails to inflate with
 * `NoClassDefFoundError: android/os/Build$VERSION` → BridgeInflater substitutes a MockView.
 *
 * Framework widgets (`TextView`, `LinearLayout`) escape this because their impls live in layoutlib
 * under their real names and never force-resolve `android.os.Build`; and Paparazzi's own
 * `Renderer.configureBuildProperties()` / `forcePlatformSdkVersion()` *silently return* when
 * `android.os.Build` is not loadable, so nothing flagged the gap until real Material inflation.
 *
 * ## The fix
 * Reconstruct the six canonical classes from layoutlib's own `_Original_*` copies — which ARE the real
 * framework implementations — by a byte-faithful ASM class rename (`/_Original_` → `/`). This is
 * strictly more faithful than hand-written stubs: every field, nested class and method the real
 * framework class has is preserved. Paparazzi's `configureBuildProperties()` already triggers
 * `_Original_Build`'s `<clinit>` to copy values across, so a byte-identical `Build.<clinit>` is proven
 * safe under the Bridge. The rename cannot collide: layoutlib ships only `_Original_*`, never the
 * canonical names, so the produced jar adds classes rather than shadowing any.
 *
 * The produced jar joins the engine classpath so `Class.forName("android.os.Build")` — issued by
 * library view constructors on the app classloader — resolves.
 */
object FrameworkDelegateGenerator {

  /** Internal-name marker layoutlib uses for its renamed framework originals. */
  private const val ORIGINAL_MARKER = "/_Original_"

  /** Strips layoutlib's `_Original_` prefix from any type it renamed, leaving all others untouched. */
  private object StripOriginalRemapper : Remapper() {
    override fun map(internalName: String): String =
      if (internalName.contains(ORIGINAL_MARKER)) internalName.replace(ORIGINAL_MARKER, "/") else internalName
  }

  /**
   * Read [layoutlibJar], rename every `_Original_*` framework class (and its nested classes) to its
   * canonical name, and write the results into [outJar]. Returns the canonical internal names produced.
   */
  fun generate(layoutlibJar: File, outJar: File): List<String> {
    require(layoutlibJar.isFile) { "layoutlib jar not found: $layoutlibJar" }
    val produced = mutableListOf<String>()
    outJar.parentFile?.mkdirs()
    JarFile(layoutlibJar).use { jar ->
      JarOutputStream(outJar.outputStream().buffered()).use { out ->
        val entries = jar.entries()
        while (entries.hasMoreElements()) {
          val entry = entries.nextElement()
          if (!entry.name.endsWith(".class") || !entry.name.contains("_Original_")) continue
          val original = jar.getInputStream(entry).use { it.readBytes() }
          val reader = ClassReader(original)
          // COMPUTE_MAXS only: a pure rename never changes stack/local layout, and we must not force
          // frame recomputation (which would require loading referenced framework types).
          val writer = ClassWriter(ClassWriter.COMPUTE_MAXS)
          reader.accept(ClassRemapper(writer, StripOriginalRemapper), 0)
          val newInternalName = entry.name.removeSuffix(".class").replace("_Original_", "")
          out.putNextEntry(JarEntry("$newInternalName.class"))
          out.write(writer.toByteArray())
          out.closeEntry()
          produced += newInternalName
        }
      }
    }
    check(produced.isNotEmpty()) {
      "no _Original_* framework classes found in $layoutlibJar — layoutlib pin changed? (AD-008/AD-014)"
    }
    return produced
  }
}

/** Entry point for the `generateFrameworkDelegates` Gradle task. args: layoutlibJar outJar. */
fun main(args: Array<String>) {
  require(args.size >= 2) { "usage: <layoutlibJar> <outJar>" }
  val produced = FrameworkDelegateGenerator.generate(File(args[0]), File(args[1]))
  System.err.println("Generated ${produced.size} framework delegate classes into ${args[1]}")
}
