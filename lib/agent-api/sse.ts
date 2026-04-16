import { AgentError } from "./errors"

/**
 * SSE writer for agent API streaming endpoints. Wraps a ReadableStream's
 * controller and exposes three event types: `progress`, `result`, `error`,
 * plus a `heartbeat` to keep proxies from timing out.
 *
 * Usage:
 *   const { readable, writer } = SSEWriter.create()
 *   // ... call writer.progress(...), writer.result(...) ...
 *   writer.close()
 *   return new Response(readable, { headers: { "content-type": "text/event-stream" }})
 */
export class SSEWriter {
  private readonly encoder = new TextEncoder()
  private closed = false

  private constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  /** Factory that pairs a stream + writer. */
  static create(): { readable: ReadableStream<Uint8Array>; writer: SSEWriter } {
    let writer!: SSEWriter
    const readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        writer = new SSEWriter(controller)
      },
    })
    return { readable, writer }
  }

  /** Emit a progress event. `phase` is a short machine-readable string; `message` is human-readable. */
  progress(phase: string, message: string, extra?: Record<string, unknown>): void {
    if (this.closed) return
    const payload = { phase, message, ...(extra ?? {}) }
    this.writeFrame("progress", JSON.stringify(payload))
  }

  /** Emit the final result event. The stream should be closed after this. */
  result(payload: Record<string, unknown>): void {
    if (this.closed) return
    this.writeFrame("result", JSON.stringify(payload))
  }

  /** Emit an error event from an AgentError. Terminal — close the stream after. */
  error(err: AgentError): void {
    if (this.closed) return
    // Reuse AgentError's toSSE() to keep the framing in one place.
    this.enqueue(err.toSSE())
  }

  /** Emit an SSE comment line as a heartbeat. Proxies stop buffering long streams if they see any bytes. */
  heartbeat(): void {
    if (this.closed) return
    this.enqueue(": ping\n\n")
  }

  /** Close the underlying stream. Safe to call multiple times. */
  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.controller.close()
    } catch {
      // Already closed — swallow.
    }
  }

  private writeFrame(eventType: string, data: string): void {
    this.enqueue(`event: ${eventType}\ndata: ${data}\n\n`)
  }

  private enqueue(raw: string): void {
    try {
      this.controller.enqueue(this.encoder.encode(raw))
    } catch {
      // Controller may have been closed externally (client abort) — swallow.
    }
  }
}
