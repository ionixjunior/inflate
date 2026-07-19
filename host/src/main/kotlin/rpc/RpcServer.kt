package rpc

import java.io.InputStream
import java.io.OutputStream
import java.io.PrintStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** JSON-RPC 2.0 request envelope (design §D5, docs/protocol.md §1-2). `id`/`params` are left as
 * `Any?` (moshi's built-in Object handling) since their shape depends on `method`. */
private data class JsonRpcRequestEnvelope(
  val jsonrpc: String? = null,
  val id: Any? = null,
  val method: String,
  val params: Any? = null,
)

private data class JsonRpcErrorBody(val code: Int, val message: String)

/** Methods that run on the single render-thread executor (design §D5: layoutlib is single-session,
 * so all engine-touching work is serialized there, isolated from the IO thread). */
private val RENDER_THREAD_METHODS = setOf("render", "listThemes", "invalidate", "warmup")

/**
 * LSP-framed JSON-RPC 2.0 server (T13; design §D5/§11; docs/protocol.md). [serve] runs the read
 * loop on the calling thread (the "IO thread"): it reads one frame at a time via [FrameReader],
 * handles `initialize`/`shutdown` synchronously, and dispatches `render`/`listThemes`/`invalidate`/
 * `warmup` onto a dedicated single-thread executor. A [Throwable] escaping a render-thread handler
 * is caught there and turned into a JSON-RPC error response for that request only — the executor,
 * and therefore all future requests, keep working (P1-I: a render-thread failure never wedges the
 * host).
 *
 * stdout hygiene (design §D5): [output] is reserved exclusively for protocol frames — this class
 * never writes anything else to it. All diagnostics go to [stderr].
 *
 * `render` is stubbed at this phase (T13) to always return a structurally valid `RenderResponse`
 * with `status: 'error'` (docs/protocol.md §2) — never a bare protocol error. `listThemes`,
 * `invalidate`, and `warmup` are no-ops returning their trivial success shape (`[]`/`{}`/`{}`)
 * since the extension (T17/T18) needs a normal acknowledgement from them before real engine wiring
 * lands in later phases (T24+); only `render` has engine-shaped work to stub.
 *
 * [overrideHandlers] lets callers (tests) replace a render-thread method's handler — used to
 * simulate an uncaught render-thread exception without needing a real engine.
 *
 * [backendFactory] (T35) wires the real engine: given no factory (unit tests), `render` returns the
 * structured not-implemented stub and `listThemes`/`invalidate` their trivial successes. Given a
 * factory, `initialize` builds a [RenderBackend] on the render thread (layoutlib is process-global
 * and single-session, so its Bridge init must run there, before any render), and thereafter
 * `render`/`listThemes`/`invalidate` route through it.
 */
class RpcServer(
  input: InputStream,
  output: OutputStream,
  private val stderr: PrintStream = System.err,
  overrideHandlers: Map<String, (String) -> String> = emptyMap(),
  private val backendFactory: ((InitializeParams) -> RenderBackend)? = null,
) {
  private val moshi = ProtocolMoshi.moshi
  private val anyAdapter = moshi.adapter(Any::class.java)
  private val envelopeAdapter = moshi.adapter(JsonRpcRequestEnvelope::class.java)
  private val errorBodyAdapter = moshi.adapter(JsonRpcErrorBody::class.java)
  private val initializeParamsAdapter = moshi.adapter(InitializeParams::class.java)
  private val renderRequestAdapter = moshi.adapter(RenderRequest::class.java)
  private val renderResponseAdapter = moshi.adapter(RenderResponse::class.java)
  private val listThemesParamsAdapter = moshi.adapter(ListThemesParams::class.java)
  private val invalidateParamsAdapter = moshi.adapter(InvalidateParams::class.java)
  private val themeListAdapter = moshi.adapter<List<ThemeInfo>>(
    com.squareup.moshi.Types.newParameterizedType(List::class.java, ThemeInfo::class.java),
  )
  private val reader = FrameReader(input)
  private val writer = FrameWriter(output)
  private val writeLock = Any()
  private val renderExecutor: ExecutorService =
    Executors.newSingleThreadExecutor { r -> Thread(r, "inflate-render").apply { isDaemon = true } }

  @Volatile private var stopRequested = false

  /** The engine backend, built on `initialize` when a [backendFactory] is supplied (T35). */
  @Volatile private var backend: RenderBackend? = null

  private val handlers: Map<String, (String) -> String> = defaultHandlers() + overrideHandlers

  /** Runs the read loop until stdin closes or a `shutdown` request is processed. Blocks the caller. */
  fun serve() {
    try {
      while (!stopRequested) {
        val frame = try {
          reader.readFrame()
        } catch (e: Exception) {
          stderr.println("[rpc] framing error, closing connection: ${e.message}")
          break
        }
        if (frame == null) break // peer closed stdin (design §D5: "self-terminates if stdin closes")
        dispatch(frame)
      }
    } finally {
      renderExecutor.shutdown()
      renderExecutor.awaitTermination(5, TimeUnit.SECONDS)
    }
  }

  private fun dispatch(frame: String) {
    val envelope = try {
      envelopeAdapter.fromJson(frame)
    } catch (e: Exception) {
      stderr.println("[rpc] malformed request ignored: ${e.message}")
      return
    } ?: return

    val id = envelope.id
    val paramsJson = envelope.params?.let { anyAdapter.toJson(it) } ?: "{}"

    when (envelope.method) {
      "initialize" ->
        if (backendFactory != null) {
          renderExecutor.execute { buildBackend(id, paramsJson) }
        } else {
          respondRaw(id, DEFAULT_INITIALIZE_RESULT)
        }
      "shutdown" -> {
        respondRaw(id, "{}")
        stopRequested = true
      }
      in RENDER_THREAD_METHODS -> renderExecutor.execute { runOnRenderThread(id, envelope.method, paramsJson) }
      else -> respondError(id, -32601, "Method not found: ${envelope.method}")
    }
  }

  private fun runOnRenderThread(id: Any?, method: String, paramsJson: String) {
    try {
      val resultJson = handlers.getValue(method).invoke(paramsJson)
      respondRaw(id, resultJson)
    } catch (t: Throwable) {
      stderr.println("[rpc] render-thread exception in '$method': ${t.message}")
      respondError(id, -32000, "internal error in '$method': ${t.message}")
    }
  }

  private fun respondRaw(id: Any?, resultJson: String) {
    val json = """{"jsonrpc":"2.0","id":${idJson(id)},"result":$resultJson}"""
    synchronized(writeLock) { writer.writeFrame(json) }
  }

  private fun respondError(id: Any?, code: Int, message: String) {
    val errorJson = errorBodyAdapter.toJson(JsonRpcErrorBody(code, message))
    val json = """{"jsonrpc":"2.0","id":${idJson(id)},"error":$errorJson}"""
    synchronized(writeLock) { writer.writeFrame(json) }
  }

  /** Normalizes a parsed JSON-RPC id (String, whole-number Long/Double, or null) back to JSON text. */
  private fun idJson(id: Any?): String = when (id) {
    null -> "null"
    is String -> moshi.adapter(String::class.java).toJson(id)
    is Number -> {
      val d = id.toDouble()
      if (!d.isInfinite() && !d.isNaN() && d == Math.floor(d)) id.toLong().toString() else d.toString()
    }
    else -> "null"
  }

  /** Build the engine backend on the render thread (see class doc), then ack `initialize`. */
  private fun buildBackend(id: Any?, paramsJson: String) {
    try {
      val params = initializeParamsAdapter.fromJson(paramsJson)
        ?: error("initialize params missing or unparseable")
      backend = backendFactory!!.invoke(params)
      respondRaw(id, DEFAULT_INITIALIZE_RESULT)
    } catch (t: Throwable) {
      stderr.println("[rpc] initialize failed: ${t.message}")
      respondError(id, -32000, "initialize failed: ${t.message}")
    }
  }

  private fun defaultHandlers(): Map<String, (String) -> String> = mapOf(
    "render" to ::renderDispatch,
    "listThemes" to ::listThemesDispatch,
    "invalidate" to ::invalidateDispatch,
    "warmup" to { _: String -> "{}" },
  )

  /** Route `render` through the engine backend when present; otherwise the T13 not-implemented stub. */
  private fun renderDispatch(paramsJson: String): String {
    val b = backend ?: return defaultRenderStub(paramsJson)
    val request = renderRequestAdapter.fromJson(paramsJson) ?: error("render params missing")
    return renderResponseAdapter.toJson(b.render(request))
  }

  private fun listThemesDispatch(paramsJson: String): String {
    val b = backend ?: return "[]"
    val params = listThemesParamsAdapter.fromJson(paramsJson) ?: error("listThemes params missing")
    return themeListAdapter.toJson(b.listThemes(params.roots, params.packageName))
  }

  private fun invalidateDispatch(paramsJson: String): String {
    val b = backend ?: return "{}"
    val params = invalidateParamsAdapter.fromJson(paramsJson) ?: InvalidateParams()
    return """{"rebuildScheduled":${b.invalidate(params.paths)}}"""
  }

  private fun defaultRenderStub(paramsJson: String): String {
    val requestId = try {
      moshi.adapter(RenderRequest::class.java).fromJson(paramsJson)?.id ?: 0
    } catch (e: Exception) {
      0
    }
    val response = RenderResponse(
      id = requestId,
      status = RenderStatus.error,
      warnings = emptyList(),
      error = RenderError(message = "method not yet implemented: render"),
      dependencies = emptyList(),
      timings = RenderTimings(prepareMs = 0, inflateMs = 0, renderMs = 0, totalMs = 0),
      sessionRebuilt = false,
    )
    return moshi.adapter(RenderResponse::class.java).toJson(response)
  }

  companion object {
    private const val DEFAULT_INITIALIZE_RESULT =
      """{"pinName":"paparazzi-1.3.5+layoutlib-14.0.11","capabilities":[]}"""
  }
}
