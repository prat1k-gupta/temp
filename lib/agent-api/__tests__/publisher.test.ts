import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  listFlows,
  createProject,
  deleteProject,
  createVersion,
  publishVersion,
  publishRuntimeFlow,
  checkKeywordConflict,
} from "@/lib/agent-api/publisher"
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
          status: "success",
          data: {
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
          },
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
      new Response(JSON.stringify({ status: "success", data: { projects: [], total: 0 } }), { status: 200 }),
    )
    await listFlows(mockCtx(), 10)
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("passes limit to fs-whatsapp as query param", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ status: "success", data: { projects: [], total: 0 } }), { status: 200 }),
    )
    await listFlows(mockCtx(), 25)
    const [url] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("limit=25")
  })

  it("omits test_url when the account has no phone_number", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
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
          },
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
      new Response(
        JSON.stringify({ status: "success", data: { projects: [], total: 0, page: 1, limit: 50 } }),
        { status: 200 },
      ),
    )
    const result = await listFlows(mockCtx(), 50)
    expect(result.flows).toEqual([])
    expect(result.total).toBe(0)
  })

  it("picks the first trigger_keyword when a project has multiple", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
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
          },
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

describe("createProject", () => {
  const originalFetch = global.fetch

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs to /api/magic-flow/projects and returns the project ID", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            project: { id: "proj_1", name: "Test Flow", platform: "whatsapp" },
            latest_version: { id: "v_1", version_number: 1 },
          },
        }),
        { status: 200 },
      ),
    )
    const result = await createProject(mockCtx(), { name: "Test Flow", platform: "whatsapp" })
    expect(result).toEqual({ id: "proj_1" })

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("/api/magic-flow/projects")
    expect(init.method).toBe("POST")
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
    const body = JSON.parse(init.body)
    expect(body.name).toBe("Test Flow")
    expect(body.platform).toBe("whatsapp")
  })

  it("includes trigger_keywords when provided", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { project: { id: "p1" }, latest_version: {} } }),
        { status: 200 },
      ),
    )
    await createProject(mockCtx(), {
      name: "Test",
      platform: "whatsapp",
      triggerKeywords: ["hello"],
      triggerMatchType: "exact",
    })
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.trigger_keywords).toEqual(["hello"])
    expect(body.trigger_match_type).toBe("exact")
  })

  it("throws internal_error on non-2xx response", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("error", { status: 500 }))
    await expect(
      createProject(mockCtx(), { name: "Test", platform: "whatsapp" }),
    ).rejects.toMatchObject({ code: "internal_error" })
  })

  it("throws internal_error on network failure", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(
      createProject(mockCtx(), { name: "Test", platform: "whatsapp" }),
    ).rejects.toMatchObject({ code: "internal_error" })
  })
})

describe("deleteProject", () => {
  const originalFetch = global.fetch

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it("DELETEs /api/magic-flow/projects/{id} and returns void", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { message: "Project deleted" } }),
        { status: 200 },
      ),
    )
    await expect(deleteProject(mockCtx(), "proj_1")).resolves.toBeUndefined()

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("/api/magic-flow/projects/proj_1")
    expect(init.method).toBe("DELETE")
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("throws internal_error on non-2xx response", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("error", { status: 404 }))
    await expect(deleteProject(mockCtx(), "proj_1")).rejects.toMatchObject({
      code: "internal_error",
    })
  })

  it("throws internal_error on network failure", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(deleteProject(mockCtx(), "proj_1")).rejects.toMatchObject({
      code: "internal_error",
    })
  })
})

describe("createVersion", () => {
  const originalFetch = global.fetch

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs to the correct URL and returns id and version_number from envelope", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            version: { id: "ver_1", version_number: 2, name: "Agent API edit" },
          },
        }),
        { status: 200 },
      ),
    )
    const result = await createVersion(mockCtx(), "proj_1", [{ id: "n1" }], [{ id: "e1" }], { summary: "test" })
    expect(result).toEqual({ id: "ver_1", version_number: 2 })

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("/api/magic-flow/projects/proj_1/versions")
    expect(init.method).toBe("POST")
  })

  it("forwards X-API-Key in the fetch headers", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { version: { id: "v1", version_number: 1 } } }),
        { status: 200 },
      ),
    )
    await createVersion(mockCtx(), "proj_1", [], [], {})
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("passes nodes, edges, changes and platform in the request body", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { version: { id: "v1", version_number: 1 } } }),
        { status: 200 },
      ),
    )
    const nodes = [{ id: "n1", type: "message" }]
    const edges = [{ id: "e1", source: "n1", target: "n2" }]
    const changes = { added: 1 }
    await createVersion(mockCtx(), "proj_1", nodes, edges, changes)
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.nodes).toEqual(nodes)
    expect(body.edges).toEqual(edges)
    expect(body.changes).toEqual(changes)
    expect(body.platform).toBe("whatsapp")
    expect(body.name).toBe("Agent API edit")
  })

  it("uses empty object for changes when not provided", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { version: { id: "v1", version_number: 1 } } }),
        { status: 200 },
      ),
    )
    await createVersion(mockCtx(), "proj_1", [], [])
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.changes).toEqual({})
  })

  it("throws internal_error on non-2xx response", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("error", { status: 500 }))
    await expect(
      createVersion(mockCtx(), "proj_1", [], []),
    ).rejects.toMatchObject({ code: "internal_error" })
  })

  it("throws internal_error on network failure", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(
      createVersion(mockCtx(), "proj_1", [], []),
    ).rejects.toMatchObject({ code: "internal_error" })
  })
})

describe("publishVersion", () => {
  const originalFetch = global.fetch

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs to projects/{projectId}/versions/{versionId}/publish and returns void", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { version: { id: "ver_1", version_number: 2 } } }),
        { status: 200 },
      ),
    )
    await expect(publishVersion(mockCtx(), "proj_1", "ver_1")).resolves.toBeUndefined()

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("/api/magic-flow/projects/proj_1/versions/ver_1/publish")
    expect(init.method).toBe("POST")
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("throws internal_error on non-2xx response", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("error", { status: 422 }))
    await expect(
      publishVersion(mockCtx(), "proj_1", "ver_1"),
    ).rejects.toMatchObject({ code: "internal_error" })
  })
})

describe("publishRuntimeFlow", () => {
  const originalFetch = global.fetch

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs to /api/chatbot/flows when no existingRuntimeFlowId is given", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { id: "rtf_1", flow_slug: "iphone11" } }),
        { status: 200 },
      ),
    )
    const result = await publishRuntimeFlow(mockCtx(), {
      flowData: { name: "iPhone 11" },
      triggerKeywords: ["iphone11"],
      triggerMatchType: "exact",
    })
    expect(result).toEqual({ runtimeFlowId: "rtf_1" })

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("/api/chatbot/flows")
    expect(init.method).toBe("POST")
  })

  it("PUTs to /api/chatbot/flows/{id} when existingRuntimeFlowId is given", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { id: "rtf_99", flow_slug: "iphone11" } }),
        { status: 200 },
      ),
    )
    await publishRuntimeFlow(mockCtx(), {
      flowData: { name: "iPhone 11" },
      triggerKeywords: ["iphone11"],
      triggerMatchType: "exact",
      existingRuntimeFlowId: "rtf_99",
    })

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("/api/chatbot/flows/rtf_99")
    expect(init.method).toBe("PUT")
  })

  it("includes trigger_keywords and trigger_match_type in the request body", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { id: "rtf_1", flow_slug: "kw1" } }),
        { status: 200 },
      ),
    )
    await publishRuntimeFlow(mockCtx(), {
      flowData: { name: "Promo" },
      triggerKeywords: ["kw1", "kw2"],
      triggerMatchType: "contains",
    })
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.trigger_keywords).toEqual(["kw1", "kw2"])
    expect(body.trigger_match_type).toBe("contains")
    expect(body.name).toBe("Promo")
  })

  it("returns runtimeFlowId from the envelope", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { id: "rtf_42", flow_slug: "test" } }),
        { status: 200 },
      ),
    )
    const result = await publishRuntimeFlow(mockCtx(), {
      flowData: {},
      triggerKeywords: [],
      triggerMatchType: "exact",
    })
    expect(result.runtimeFlowId).toBe("rtf_42")
  })

  it("throws publish_failed (not internal_error) on non-2xx response", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("bad gateway", { status: 502 }))
    await expect(
      publishRuntimeFlow(mockCtx(), { flowData: {}, triggerKeywords: [], triggerMatchType: "exact" }),
    ).rejects.toMatchObject({ code: "publish_failed" })
  })
})

describe("checkKeywordConflict", () => {
  const originalFetch = global.fetch

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it("returns null when no flows exist", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({ status: "success", data: { projects: [], total: 0 } }),
        { status: 200 },
      ),
    )
    const result = await checkKeywordConflict(mockCtx(), "hello")
    expect(result).toBeNull()
  })

  it("returns null when no keyword matches", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            projects: [
              {
                id: "mf_1",
                name: "Flow A",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                trigger_keywords: ["iphone11"],
                node_count: 2,
                latest_version: 1,
              },
            ],
            total: 1,
          },
        }),
        { status: 200 },
      ),
    )
    const result = await checkKeywordConflict(mockCtx(), "galaxy")
    expect(result).toBeNull()
  })

  it("returns matching flow info when keyword matches exactly", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            projects: [
              {
                id: "mf_1",
                name: "iPhone 11 Flow",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                trigger_keywords: ["iphone11"],
                node_count: 3,
                latest_version: 1,
              },
            ],
            total: 1,
          },
        }),
        { status: 200 },
      ),
    )
    const result = await checkKeywordConflict(mockCtx(), "iphone11")
    expect(result).toEqual({
      id: "mf_1",
      name: "iPhone 11 Flow",
      magic_flow_url: expect.stringContaining("/flow/mf_1"),
    })
  })

  it("returns matching flow info case-insensitively", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            projects: [
              {
                id: "mf_2",
                name: "Sale Flow",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                trigger_keywords: ["SALE"],
                node_count: 1,
                latest_version: 1,
              },
            ],
            total: 1,
          },
        }),
        { status: 200 },
      ),
    )
    const result = await checkKeywordConflict(mockCtx(), "sale")
    expect(result).not.toBeNull()
    expect(result?.id).toBe("mf_2")
  })

  it("returns the first match when multiple flows have the same keyword", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            projects: [
              {
                id: "mf_1",
                name: "Flow 1",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                trigger_keywords: ["promo"],
                node_count: 1,
                latest_version: 1,
              },
              {
                id: "mf_2",
                name: "Flow 2",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                trigger_keywords: ["promo"],
                node_count: 1,
                latest_version: 1,
              },
            ],
            total: 2,
          },
        }),
        { status: 200 },
      ),
    )
    const result = await checkKeywordConflict(mockCtx(), "promo")
    expect(result?.id).toBe("mf_1")
  })
})
