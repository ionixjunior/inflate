package rpc

import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.StandardCharsets

/** Thrown when a frame's header block is missing or has no parseable `Content-Length` (design §D5). */
class FramingException(message: String) : IOException(message)

/**
 * Reads LSP-style `Content-Length: N\r\n\r\n<json-utf8>` frames from [input] (design §D5, AD-010).
 *
 * Tolerant of:
 *  - **fragmented reads** — a single OS read may return only part of the header or body; every
 *    read here loops until either the terminator or the full declared body length is obtained;
 *  - **back-to-back frames** — each [readFrame] call consumes exactly the header + declared body
 *    byte count and nothing more, leaving the stream positioned at the very next frame's header.
 *
 * A malformed header block (no `Content-Length`, or a non-numeric value) throws [FramingException]
 * rather than guessing a length. Reaching EOF cleanly *before any byte of a new frame arrives*
 * returns `null` (the normal "peer closed stdin" signal); EOF mid-frame is a hard [EOFException].
 */
class FrameReader(private val input: InputStream) {

  fun readFrame(): String? {
    val headerBytes = readHeaderBlock() ?: return null
    val headerText = String(headerBytes, StandardCharsets.US_ASCII)
    val contentLength = parseContentLength(headerText)
    val body = ByteArray(contentLength)
    var read = 0
    while (read < contentLength) {
      val n = input.read(body, read, contentLength - read)
      if (n < 0) throw EOFException("stream closed after $read/$contentLength body bytes")
      read += n
    }
    return String(body, StandardCharsets.UTF_8)
  }

  /** Reads bytes up to (but not including) the `\r\n\r\n` terminator; null if EOF precedes any byte. */
  private fun readHeaderBlock(): ByteArray? {
    val buffer = ByteArrayOutputStream()
    var sawFirstByte = false
    // Rolling window of the last 4 bytes, to detect \r\n\r\n without rescanning the whole buffer.
    var b0 = -1
    var b1 = -1
    var b2 = -1
    var b3 = -1
    while (true) {
      val b = input.read()
      if (b < 0) {
        if (sawFirstByte) throw EOFException("stream closed mid-header") else return null
      }
      sawFirstByte = true
      buffer.write(b)
      b0 = b1; b1 = b2; b2 = b3; b3 = b
      if (b0 == '\r'.code && b1 == '\n'.code && b2 == '\r'.code && b3 == '\n'.code) {
        val all = buffer.toByteArray()
        return all.copyOfRange(0, all.size - 4)
      }
    }
  }

  private fun parseContentLength(headerText: String): Int {
    for (line in headerText.split("\r\n")) {
      if (line.isEmpty()) continue
      val idx = line.indexOf(':')
      if (idx <= 0) continue
      val name = line.substring(0, idx).trim()
      val value = line.substring(idx + 1).trim()
      if (name.equals("Content-Length", ignoreCase = true)) {
        return value.toIntOrNull() ?: throw FramingException("malformed Content-Length value: '$value'")
      }
    }
    throw FramingException("missing Content-Length header in: ${headerText.replace("\r\n", "\\r\\n")}")
  }
}

/**
 * Writes LSP-style frames to [output] (design §D5). Not internally synchronized — callers sharing
 * one [FrameWriter] across threads (e.g. [RpcServer]) must serialize calls themselves so two frames
 * are never interleaved.
 */
class FrameWriter(private val output: OutputStream) {
  fun writeFrame(json: String) {
    val body = json.toByteArray(StandardCharsets.UTF_8)
    val header = "Content-Length: ${body.size}\r\n\r\n".toByteArray(StandardCharsets.US_ASCII)
    output.write(header)
    output.write(body)
    output.flush()
  }
}
