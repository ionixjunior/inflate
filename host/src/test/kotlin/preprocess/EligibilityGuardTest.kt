package preprocess

import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

/**
 * T33 guard: the host-side [Eligibility] constants must be value-identical to the shared source of
 * truth `shared/eligibility.json`. The extension's `classifier.test.ts` runs the mirror-image guard,
 * so the TS `ELIGIBILITY`, this Kotlin object, and the JSON never drift apart silently.
 */
class EligibilityGuardTest {

  private fun sharedJson(): File {
    val candidates = listOf(
      File(System.getProperty("user.dir"), "../shared/eligibility.json"),
      File("../shared/eligibility.json"),
      File("shared/eligibility.json"),
    )
    return candidates.map { it.absoluteFile.normalize() }.firstOrNull { it.isFile }
      ?: error("shared/eligibility.json not found (user.dir=${System.getProperty("user.dir")})")
  }

  @Test
  fun `Eligibility constants match shared eligibility json exactly`() {
    val moshi = Moshi.Builder().build()
    val type = Types.newParameterizedType(
      Map::class.java, String::class.java,
      Types.newParameterizedType(List::class.java, String::class.java),
    )
    val adapter = moshi.adapter<Map<String, List<String>>>(type)
    val shared = adapter.fromJson(sharedJson().readText()) ?: error("could not parse shared/eligibility.json")

    assertEquals(shared["resourceTypeDirs"], Eligibility.resourceTypeDirs, "resourceTypeDirs drifted")
    assertEquals(shared["layoutTypeDirs"], Eligibility.layoutTypeDirs, "layoutTypeDirs drifted")
    assertEquals(shared["drawableTypeDirs"], Eligibility.drawableTypeDirs, "drawableTypeDirs drifted")
    assertEquals(shared["colorTypeDirs"], Eligibility.colorTypeDirs, "colorTypeDirs drifted")
    assertEquals(shared["drawableRootElements"], Eligibility.drawableRootElements, "drawableRootElements drifted")
    assertEquals(shared["eligibleExtensions"], Eligibility.eligibleExtensions, "eligibleExtensions drifted")

    // No unexpected extra keys in the JSON that the Kotlin mirror does not cover.
    assertEquals(
      setOf(
        "resourceTypeDirs", "layoutTypeDirs", "drawableTypeDirs",
        "colorTypeDirs", "drawableRootElements", "eligibleExtensions",
      ),
      shared.keys,
      "shared/eligibility.json has keys the Kotlin mirror does not cover",
    )
  }
}
