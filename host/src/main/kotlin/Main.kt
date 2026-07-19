import java.io.BufferedInputStream
import rpc.RpcServer

/**
 * Inflate render host entry point (T13). Wires the LSP-framed [RpcServer] over stdio.
 * stdout is reserved exclusively for protocol frames (design §D5) — nothing else may print to it;
 * `System.in` is wrapped in a [BufferedInputStream] purely for read efficiency (framing itself
 * tolerates arbitrarily fragmented reads either way, per [rpc.FrameReader]).
 */
fun main() {
  val server = RpcServer(
    input = BufferedInputStream(System.`in`),
    output = System.out,
  )
  server.serve()
}
