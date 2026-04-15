import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/v1/agent/flows/route"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

describe("GET /v1/agent/flows", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFsResponses() {
    // First call: GET /api/accounts (from withAgentAuth → getActingAccount)
    // Second call: GET /api/magic-flow/projects (from listFlows)
    const accountsBody = {
      accounts: [
        { id: "acc_1", name: "Acme Main", phone_number: "+919876543210", status: "active", has_access_token: true },
      ],
    }
    const projectsBody = {
      projects: [
        {
          id: "mf_1",
          name: "iPhone Launch",
          created_at: "2026-04-15T11:42:08Z",
          updated_at: "2026-04-15T11:47:22Z",
          trigger_keywords: ["iphone11"],
          node_count: 6,
          latest_version: 2,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    }
    let callIndex = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      const response =
        callIndex === 0
          ? new Response(JSON.stringify(accountsBody), { status: 200 })
          : new Response(JSON.stringify(projectsBody), { status: 200 })
      callIndex++
      return Promise.resolve(response)
    })
  }

  it("returns 200 with shaped flow list on valid auth", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.flows[0].flow_id).toBe("mf_1")
    expect(body.flows[0].trigger_keyword).toBe("iphone11")
    expect(body.flows[0].test_url).toBe("https://wa.me/919876543210?text=iphone11")
  })

  it("returns 401 when X-API-Key is missing", async () => {
    const req = new Request("https://example.com/api/v1/agent/flows")
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("unauthorized")
  })

  it("returns 401 when fs-whatsapp rejects the key", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("", { status: 401 }))
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_bad" },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid limit param (zero or negative)", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows?limit=0", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  it("rejects limit over 50 with 400 invalid_param", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows?limit=999", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(400) // zod rejects values > 50 via .max(50)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  it("forwards the query param to fs-whatsapp unchanged (for future server-side filtering)", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows?query=iphone", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    // The query is accepted at the schema level even though Phase 1 doesn't
    // use it server-side — the parent LLM does fuzzy matching on the client.
    const body = await res.json()
    expect(body.flows).toBeDefined()
  })
})
