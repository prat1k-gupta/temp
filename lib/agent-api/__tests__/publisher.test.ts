import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { listFlows } from "@/lib/agent-api/publisher"
import type { AgentContext } from "@/lib/agent-api/types"

function mockCtx(): AgentContext {
  return {
    apiKey: "whm_abc",
    account: {
      id: "acc_1",
      name: "Acme",
      phone_number: "+919876543210",
      connected_channels: ["whatsapp"],
    },
  }
}

describe("listFlows", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns the normalized flow list from fs-whatsapp", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "mf_1",
              name: "iPhone 11 Launch",
              created_at: "2026-04-15T11:42:08Z",
              updated_at: "2026-04-15T11:47:22Z",
              trigger_keywords: ["iphone11"],
              node_count: 6,
              latest_version: 3,
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const result = await listFlows(mockCtx(), 50)
    expect(result.total).toBe(1)
    expect(result.flows).toHaveLength(1)
    expect(result.flows[0]).toEqual({
      flow_id: "mf_1",
      name: "iPhone 11 Launch",
      trigger_keyword: "iphone11",
      node_count: 6,
      current_version: 3,
      magic_flow_url: expect.stringContaining("/flow/mf_1"),
      test_url: "https://wa.me/919876543210?text=iphone11",
      created_at: "2026-04-15T11:42:08Z",
      updated_at: "2026-04-15T11:47:22Z",
    })
  })

  it("forwards X-API-Key in the fetch headers", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ projects: [], total: 0 }), { status: 200 }),
    )
    await listFlows(mockCtx(), 10)
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("passes limit to fs-whatsapp as query param", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ projects: [], total: 0 }), { status: 200 }),
    )
    await listFlows(mockCtx(), 25)
    const [url] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("limit=25")
  })

  it("omits test_url when the account has no phone_number", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "mf_1",
              name: "Foo",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              trigger_keywords: ["bar"],
              node_count: 2,
              latest_version: 1,
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    )
    const ctx: AgentContext = { ...mockCtx(), account: { ...mockCtx().account, phone_number: undefined } }
    const result = await listFlows(ctx, 10)
    expect(result.flows[0].test_url).toBeUndefined()
  })

  it("returns empty array when fs-whatsapp has no projects for this org", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ projects: [], total: 0, page: 1, limit: 50 }), { status: 200 }),
    )
    const result = await listFlows(mockCtx(), 50)
    expect(result.flows).toEqual([])
    expect(result.total).toBe(0)
  })

  it("picks the first trigger_keyword when a project has multiple", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "mf_1",
              name: "Multi",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              trigger_keywords: ["alpha", "beta"],
              node_count: 3,
              latest_version: 1,
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    )
    const result = await listFlows(mockCtx(), 10)
    expect(result.flows[0].trigger_keyword).toBe("alpha")
  })

  it("throws internal_error on fs-whatsapp HTTP failure", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("nope", { status: 500 }))
    await expect(listFlows(mockCtx(), 10)).rejects.toMatchObject({ code: "internal_error" })
  })
})
