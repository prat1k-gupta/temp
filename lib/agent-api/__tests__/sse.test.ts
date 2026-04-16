import { describe, it, expect } from "vitest"
import { SSEWriter } from "@/lib/agent-api/sse"
import { AgentError } from "@/lib/agent-api/errors"

/**
 * Helper: consume a ReadableStream<Uint8Array> to a single decoded string.
 */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
}

describe("SSEWriter", () => {
  it("progress emits `event: progress\\ndata: {...}\\n\\n` framing", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.progress("generating", "Creating nodes", { nodes_created: 2, nodes_total: 6 })
    writer.close()
    const text = await readAll(readable)
    expect(text).toContain("event: progress\n")
    expect(text).toContain("\n\n")
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
    const parsed = JSON.parse(dataLine.slice(6))
    expect(parsed).toEqual({
      phase: "generating",
      message: "Creating nodes",
      nodes_created: 2,
      nodes_total: 6,
    })
  })

  it("result emits a single result event then closes naturally", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.result({ flow_id: "mf_1", version: 2 })
    writer.close()
    const text = await readAll(readable)
    expect(text).toMatch(/event: result\n/)
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
    expect(JSON.parse(dataLine.slice(6))).toEqual({ flow_id: "mf_1", version: 2 })
  })

  it("error emits an SSE error event formatted from AgentError", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.error(new AgentError("validation_failed", "Bad flow", { errors: ["x"] }))
    writer.close()
    const text = await readAll(readable)
    expect(text).toContain("event: error\n")
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
    expect(JSON.parse(dataLine.slice(6))).toEqual({
      code: "validation_failed",
      message: "Bad flow",
      errors: ["x"],
    })
  })

  it("heartbeat emits an SSE comment line (prefixed with `:`)", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.heartbeat()
    writer.close()
    const text = await readAll(readable)
    expect(text).toContain(": ping\n\n")
  })

  it("multiple events in order are all flushed", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.progress("a", "first")
    writer.progress("b", "second")
    writer.result({ done: true })
    writer.close()
    const text = await readAll(readable)
    const events = text.split("\n\n").filter((e) => e.trim())
    expect(events.length).toBe(3)
    expect(events[0]).toContain("event: progress")
    expect(events[1]).toContain("event: progress")
    expect(events[2]).toContain("event: result")
  })

  it("close is idempotent — calling twice does not throw", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.progress("a", "m")
    writer.close()
    expect(() => writer.close()).not.toThrow()
    await readAll(readable)
  })

  it("writes after close are silently ignored (does not throw)", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.close()
    expect(() => writer.progress("x", "y")).not.toThrow()
    await readAll(readable)
  })
})
