package engine

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * T3 unit coverage: Google-Maven URL/coordinate construction across the classifier/arch matrix
 * (design §D6/§Q4/§D4). Pure logic — no network. A wrong URL here silently breaks fetchEngine
 * and every downstream engineTest, so each coordinate is pinned to its exact expected value.
 */
class EngineArtifactsTest {

  private val base = EngineArtifacts.GOOGLE_MAVEN

  @Test
  fun `runtime classifier is per-arch`() {
    assertEquals("mac-arm", EngineArtifacts.runtimeClassifier(HostArch.MAC_ARM))
    assertEquals("mac", EngineArtifacts.runtimeClassifier(HostArch.MAC_X64))
  }

  @Test
  fun `os_arch maps to HostArch`() {
    assertEquals(HostArch.MAC_ARM, EngineArtifacts.detectArch("aarch64"))
    assertEquals(HostArch.MAC_ARM, EngineArtifacts.detectArch("arm64"))
    assertEquals(HostArch.MAC_X64, EngineArtifacts.detectArch("x86_64"))
    assertEquals(HostArch.MAC_X64, EngineArtifacts.detectArch("amd64"))
  }

  @Test
  fun `layoutlib jar url is exact`() {
    val jar = EngineArtifacts.layoutlibTriple(HostArch.MAC_ARM).first { it.name == "layoutlib" }
    assertEquals(
      "$base/com/android/tools/layoutlib/layoutlib/14.0.11/layoutlib-14.0.11.jar",
      jar.url(),
    )
    assertEquals(false, jar.unzip)
  }

  @Test
  fun `layoutlib-runtime url carries the arch classifier and is unzipped`() {
    val arm = EngineArtifacts.layoutlibTriple(HostArch.MAC_ARM).first { it.name == "layoutlib-runtime" }
    assertEquals("layoutlib-runtime-14.0.11-mac-arm.jar", arm.fileName)
    assertEquals(
      "$base/com/android/tools/layoutlib/layoutlib-runtime/14.0.11/layoutlib-runtime-14.0.11-mac-arm.jar",
      arm.url(),
    )
    assertTrue(arm.unzip)

    val x64 = EngineArtifacts.layoutlibTriple(HostArch.MAC_X64).first { it.name == "layoutlib-runtime" }
    assertEquals("layoutlib-runtime-14.0.11-mac.jar", x64.fileName)
    assertTrue(x64.url().endsWith("/layoutlib-runtime-14.0.11-mac.jar"))
  }

  @Test
  fun `layoutlib-resources url is exact and unzipped`() {
    val res = EngineArtifacts.layoutlibTriple(HostArch.MAC_ARM).first { it.name == "layoutlib-resources" }
    assertEquals(
      "$base/com/android/tools/layoutlib/layoutlib-resources/14.0.11/layoutlib-resources-14.0.11.jar",
      res.url(),
    )
    assertTrue(res.unzip)
  }

  @Test
  fun `tools jars use the pinned 31_4_2 coordinates`() {
    val tools = EngineArtifacts.toolsJars().associateBy { it.name }
    assertEquals(
      "$base/com/android/tools/layoutlib/layoutlib-api/31.4.2/layoutlib-api-31.4.2.jar",
      tools.getValue("layoutlib-api").url(),
    )
    assertEquals(
      "$base/com/android/tools/common/31.4.2/common-31.4.2.jar",
      tools.getValue("common").url(),
    )
    assertEquals(
      "$base/com/android/tools/ninepatch/31.4.2/ninepatch-31.4.2.jar",
      tools.getValue("ninepatch").url(),
    )
  }

  @Test
  fun `androidx and material aar urls resolve group dots to slashes`() {
    val byName = EngineArtifacts.androidxAars.associateBy { it.name }
    assertEquals(
      "$base/com/google/android/material/material/1.12.0/material-1.12.0.aar",
      byName.getValue("material").url(),
    )
    assertEquals(
      "$base/androidx/appcompat/appcompat/1.7.0/appcompat-1.7.0.aar",
      byName.getValue("appcompat").url(),
    )
    assertEquals(
      "$base/androidx/constraintlayout/constraintlayout/2.2.1/constraintlayout-2.2.1.aar",
      byName.getValue("constraintlayout").url(),
    )
    assertTrue(EngineArtifacts.androidxAars.all { it.extension == "aar" })
  }

  @Test
  fun `full set includes the layoutlib triple, four tools jars, and nine aars`() {
    val all = EngineArtifacts.all(HostArch.MAC_ARM)
    assertEquals(3 + 4 + 9, all.size)
    // exactly one runtime, with the requested arch classifier
    val runtimes = all.filter { it.name == "layoutlib-runtime" }
    assertEquals(1, runtimes.size)
    assertEquals("mac-arm", runtimes.single().classifier)
  }
}
