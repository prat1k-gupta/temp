import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { withAgentAuth } from "@/lib/agent-api/auth"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"
import type { AgentContext } from "@/lib/agent-api/types"

describe("withAgentAuth", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockAccountsOk() {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            accounts: [{ id: "a", name: "n", phone_number: "+91999", status: "active", has_access_token: true }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
  }

  it("returns 401 when X-API-Key header is missing", async () => {
    const handler = vi.fn()
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows")
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("unauthorized")
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 401 when X-API-Key has wrong prefix", async () => {
    const handler = vi.fn()
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "sk-wrong-prefix" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("calls the handler with AgentContext on valid auth", async () => {
    mockAccountsOk()
    const handler = vi.fn(async (ctx: AgentContext) => new Response(JSON.stringify({ got: ctx.account.id })))
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await wrapped(req)
    expect(handler).toHaveBeenCalledOnce()
    const [ctx] = handler.mock.calls[0] as unknown as [AgentContext, Request]
    expect(ctx.apiKey).toBe("whm_abc")
    expect(ctx.account.id).toBe("a")
    expect(ctx.account.connected_channels).toEqual(["whatsapp"])
    expect(res.status).toBe(200)
  })

  it("returns 401 when fs-whatsapp validates the key as invalid", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("", { status: 401 }))
    const handler = vi.fn()
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_bad" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 429 when rate limit is exceeded on the cheap bucket", async () => {
    mockAccountsOk()
    const handler = vi.fn(async () => new Response("ok"))
    const wrapped = withAgentAuth(handler, "cheap")
    const makeReq = () =>
      new Request("https://example.com/api/v1/agent/flows", { headers: { "x-api-key": "whm_abc" } })

    // Exhaust the cheap bucket (120/min)
    for (let i = 0; i < 120; i++) await wrapped(makeReq())
    const res = await wrapped(makeReq())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe("rate_limited")
    expect(body.retry_after_seconds).toBeGreaterThan(0)
  })

  it("catches errors thrown by the handler and returns them as HTTP errors", async () => {
    mockAccountsOk()
    const { AgentError } = await import("@/lib/agent-api/errors")
    const handler = vi.fn(async () => {
      throw new AgentError("flow_not_found", "No such flow")
    })
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe("flow_not_found")
  })

  it("wraps non-AgentError thrown values as internal_error", async () => {
    mockAccountsOk()
    const handler = vi.fn(async () => {
      throw new Error("boom")
    })
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe("internal_error")
  })
})
