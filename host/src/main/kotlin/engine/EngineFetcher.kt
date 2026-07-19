package engine

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/**
 * Dev-time engine artifact fetcher (T3). Downloads the pinned Google-Maven artifacts into
 * `host/.engine-cache/`, printing measured size + SHA-256 per artifact (Q4 verification), and
 * unzips the layoutlib runtime/resources. Re-runs are a no-op: an artifact whose `.sha256`
 * sidecar still matches its bytes is skipped. Feeds the M0 spikes and later engineTest runs.
 *
 * Invoked via the `fetchEngine` Gradle task. Uses JDK stdlib only (no extra deps).
 */
object EngineFetcher {

  data class FetchResult(val artifact: EngineArtifact, val sizeBytes: Long, val sha256: String, val downloaded: Boolean)

  /** Layout of the populated cache — consumed by engineTest classpath/prop assembly (T4/T5). */
  class CachePaths(root: File) {
    val downloadDir = File(root, "download")
    val runtimeRoot = File(root, "layoutlib/runtime")
    val resourcesRoot = File(root, "layoutlib/resources")
  }

  fun fetchAll(cacheRoot: File, arch: HostArch = EngineArtifacts.detectArch()): List<FetchResult> {
    val paths = CachePaths(cacheRoot)
    paths.downloadDir.mkdirs()
    val results = EngineArtifacts.all(arch).map { artifact ->
      val file = File(paths.downloadDir, artifact.fileName)
      val result = ensureDownloaded(artifact, file)
      if (artifact.unzip) {
        val dest = when (artifact.name) {
          "layoutlib-runtime" -> paths.runtimeRoot
          "layoutlib-resources" -> paths.resourcesRoot
          else -> File(cacheRoot, "unzip/${artifact.name}")
        }
        unzipIfNeeded(file, dest)
      }
      result
    }
    return results
  }

  private fun ensureDownloaded(artifact: EngineArtifact, file: File): FetchResult {
    val sidecar = File(file.parentFile, "${file.name}.sha256")
    if (file.exists() && sidecar.exists()) {
      val recorded = sidecar.readText().trim()
      val actual = sha256Of(file)
      if (recorded == actual) {
        return FetchResult(artifact, file.length(), actual, downloaded = false)
      }
    }
    val (size, sha) = download(artifact.url(), file)
    sidecar.writeText(sha)
    return FetchResult(artifact, size, sha, downloaded = true)
  }

  private fun download(url: String, dest: File): Pair<Long, String> {
    val tmp = File(dest.parentFile, "${dest.name}.part")
    val digest = MessageDigest.getInstance("SHA-256")
    var total = 0L
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.instanceFollowRedirects = true
    conn.connectTimeout = 30_000
    conn.readTimeout = 120_000
    try {
      val code = conn.responseCode
      check(code == 200) { "HTTP $code fetching $url" }
      conn.inputStream.use { input ->
        tmp.outputStream().use { out ->
          val buf = ByteArray(1 shl 16)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            digest.update(buf, 0, n)
            total += n
          }
        }
      }
    } finally {
      conn.disconnect()
    }
    if (dest.exists()) dest.delete()
    check(tmp.renameTo(dest)) { "could not move ${tmp.name} into place" }
    return total to digest.digest().toHex()
  }

  private fun sha256Of(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buf = ByteArray(1 shl 16)
      while (true) {
        val n = input.read(buf)
        if (n < 0) break
        digest.update(buf, 0, n)
      }
    }
    return digest.digest().toHex()
  }

  private fun unzipIfNeeded(jar: File, dest: File) {
    val marker = File(dest, ".unzipped")
    if (marker.exists()) return
    if (dest.exists()) dest.deleteRecursively()
    dest.mkdirs()
    val destCanonical = dest.canonicalFile
    ZipInputStream(jar.inputStream().buffered()).use { zin ->
      while (true) {
        val entry = zin.nextEntry ?: break
        val outFile = File(dest, entry.name).canonicalFile
        // zip-slip guard
        check(outFile.path.startsWith(destCanonical.path + File.separator) || outFile == destCanonical) {
          "zip entry escapes destination: ${entry.name}"
        }
        if (entry.isDirectory) {
          outFile.mkdirs()
        } else {
          outFile.parentFile.mkdirs()
          outFile.outputStream().use { zin.copyTo(it) }
        }
      }
    }
    marker.writeText("ok")
  }

  private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}

private fun humanSize(bytes: Long): String {
  val mb = bytes / (1024.0 * 1024.0)
  return "%.1f MB".format(mb)
}

/** Entry point for the `fetchEngine` Gradle task. args[0] = cache dir (default ./.engine-cache). */
fun main(args: Array<String>) {
  val cacheRoot = File(if (args.isNotEmpty()) args[0] else ".engine-cache").absoluteFile
  val arch = EngineArtifacts.detectArch()
  println("Fetching pinned engine artifacts ($arch) into ${cacheRoot.path}")
  val results = EngineFetcher.fetchAll(cacheRoot, arch)
  println()
  println("%-46s %10s %-8s %s".format("artifact", "size", "state", "sha256"))
  var total = 0L
  results.forEach { r ->
    total += r.sizeBytes
    println(
      "%-46s %10s %-8s %s".format(
        r.artifact.fileName,
        humanSize(r.sizeBytes),
        if (r.downloaded) "fetched" else "cached",
        r.sha256,
      ),
    )
  }
  println()
  println("Total: ${humanSize(total)} across ${results.size} artifacts (Q4 estimate ~165-175 MB for one arch)")
}
