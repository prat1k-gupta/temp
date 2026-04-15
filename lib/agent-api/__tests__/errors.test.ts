import { describe, it, expect } from "vitest"
import { AgentError } from "@/lib/agent-api/errors"

describe("AgentError", () => {
  it("constructs with code, message, and optional details", () => {
    const err = new AgentError("unauthorized", "Invalid API key")
    expect(err.code).toBe("unauthorized")
    expect(err.message).toBe("Invalid API key")
    expect(err.details).toBeUndefined()
  })

  it("stores details when provided", () => {
    const err = new AgentError("keyword_conflict", "Keyword in use", {
      existing_flow: { id: "mf_1", name: "Foo", magic_flow_url: "https://..." },
    })
    expect(err.details).toEqual({
      existing_flow: { id: "mf_1", name: "Foo", magic_flow_url: "https://..." },
    })
  })

  it("toHttpResponse returns a Response with correct status and body shape", async () => {
    const err = new AgentError("keyword_conflict", "Keyword in use", {
      existing_flow: { id: "mf_1", name: "Foo" },
    })
    const res = err.toHttpResponse()
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toContain("application/json")
    const body = await res.json()
    expect(body).toEqual({
      code: "keyword_conflict",
      message: "Keyword in use",
      existing_flow: { id: "mf_1", name: "Foo" },
    })
  })

  it("maps each error code to the correct HTTP status", () => {
    const cases: Array<[string, number]> = [
      ["missing_required_param", 400],
      ["invalid_param", 400],
      ["invalid_instruction", 400],
      ["invalid_trigger_keyword", 400],
      ["channel_not_connected", 400],
      ["no_account_configured", 400],
      ["unsupported_edit", 400],
      ["unauthorized", 401],
      ["flow_not_found", 404],
      ["node_not_found", 404],
      ["keyword_conflict", 409],
      ["rate_limited", 429],
      ["validation_failed", 500],
      ["internal_error", 500],
      ["publish_failed", 502],
    ]
    for (const [code, status] of cases) {
      const res = new AgentError(code as any, "msg").toHttpResponse()
      expect(res.status, `code=${code}`).toBe(status)
    }
  })

  it("toSSE returns a string with event: error\\ndata: {...}\\n\\n framing", () => {
    const err = new AgentError("validation_failed", "Bad flow", { errors: ["unreachable node"] })
    const framed = err.toSSE()
    expect(framed).toMatch(/^event: error\n/)
    expect(framed).toMatch(/^data: .+\n\n$/m)
    const dataLine = framed.split("\n").find((l) => l.startsWith("data: "))!
    const parsed = JSON.parse(dataLine.slice(6))
    expect(parsed).toEqual({
      code: "validation_failed",
      message: "Bad flow",
      errors: ["unreachable node"],
    })
  })

  it("fromUnknown wraps arbitrary errors as internal_error", () => {
    const wrapped = AgentError.fromUnknown(new Error("boom"))
    expect(wrapped).toBeInstanceOf(AgentError)
    expect(wrapped.code).toBe("internal_error")
    expect(wrapped.message).toContain("boom")
  })

  it("fromUnknown passes through existing AgentError instances unchanged", () => {
    const original = new AgentError("rate_limited", "Slow down", { retry_after_seconds: 30 })
    const wrapped = AgentError.fromUnknown(original)
    expect(wrapped).toBe(original) // same instance
  })
})
