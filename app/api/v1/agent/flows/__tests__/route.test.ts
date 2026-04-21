import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET, POST } from "@/app/api/v1/agent/flows/route"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

// Must be at the top level for vitest hoisting to work correctly
vi.mock("@/lib/ai/tools/generate-flow", () => ({
  generateFlowStreaming: vi.fn(),
}))

import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"

const mockGenerateFlow = vi.mocked(generateFlowStreaming)

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
    // Both fs-whatsapp endpoints wrap responses in {status, data} via SendEnvelope.
    const accountsBody = {
      status: "success",
      data: {
        accounts: [
          { id: "acc_1", name: "Acme Main", phone_number: "+919876543210", status: "active", has_access_token: true },
        ],
      },
    }
    const projectsBody = {
      status: "success",
      data: {
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
      },
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

  it("forwards the query param to fs-whatsapp as a server-side search filter", async () => {
    // Capture the projects-list URL so we can prove listFlows actually put
    // the query on the wire — a silent regression that dropped `query` in
    // publisher.listFlows (e.g. URLSearchParams rename) would have still
    // returned 200 + a body, so just asserting shape is insufficient.
    const seenUrls: string[] = []
    const accountsBody = {
      status: "success",
      data: {
        accounts: [
          { id: "acc_1", name: "Acme Main", phone_number: "+919876543210", status: "active", has_access_token: true },
        ],
      },
    }
    const projectsBody = { status: "success", data: { projects: [], total: 0, page: 1, limit: 50 } }
    let callIndex = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      seenUrls.push(url)
      const response =
        callIndex === 0
          ? new Response(JSON.stringify(accountsBody), { status: 200 })
          : new Response(JSON.stringify(projectsBody), { status: 200 })
      callIndex++
      return Promise.resolve(response)
    })

    const req = new Request("https://example.com/api/v1/agent/flows?query=iphone", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const projectsCall = seenUrls.find((u) => u.includes("/api/magic-flow/projects"))
    expect(projectsCall).toBeDefined()
    expect(projectsCall).toContain("query=iphone")
  })
})

// ---------------------------------------------------------------------------
// SSE helper
// ---------------------------------------------------------------------------

async function readSSE(res: Response): Promise<Array<{ event: string; data: any }>> {
  const text = await res.text()
  const events: Array<{ event: string; data: any }> = []
  const blocks = text.split("\n\n").filter((b) => b.trim())
  for (const block of blocks) {
    if (block.startsWith(":")) continue // heartbeat
    const eventMatch = block.match(/^event: (\w+)/m)
    const dataMatch = block.match(/^data: (.+)$/m)
    if (eventMatch && dataMatch) {
      events.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) })
    }
  }
  return events
}

// ---------------------------------------------------------------------------
// POST /v1/agent/flows
// ---------------------------------------------------------------------------

describe("POST /v1/agent/flows", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
    mockGenerateFlow.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  /**
   * Sets up global.fetch for the full happy-path call sequence:
   *   1. GET /api/accounts (withAgentAuth)
   *   2. GET /api/magic-flow/projects (checkKeywordConflict → listFlows)
   *   3. POST /api/magic-flow/projects (createProject)
   *   4. POST /api/magic-flow/projects/:id/versions (createVersion)
   *   5. POST /api/magic-flow/projects/:id/versions/:vid/publish (publishVersion)
   *   6. POST /api/chatbot/flows (publishRuntimeFlow)
   */
  function mockHappyPathFetch() {
    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      // 1. Auth: GET /api/accounts
      if (url.includes("/api/accounts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: {
                accounts: [
                  {
                    id: "acc_1",
                    name: "Test Account",
                    phone_number: "+919876543210",
                    status: "active",
                    has_access_token: true,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        )
      }

      // 2. Keyword conflict check: GET /api/magic-flow/projects (no method → GET)
      if (url.includes("/api/magic-flow/projects") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: { projects: [], total: 0 },
            }),
            { status: 200 },
          ),
        )
      }

      // 3. Create project: POST /api/magic-flow/projects
      if (url.includes("/api/magic-flow/projects") && init?.method === "POST" && !url.includes("/versions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: {
                project: { id: "proj_1" },
              },
            }),
            { status: 200 },
          ),
        )
      }

      // 5. Publish version: POST .../versions/:id/publish
      if (url.includes("/versions") && url.includes("/publish") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: { version: { id: "v2", version_number: 2, is_published: true } },
            }),
            { status: 200 },
          ),
        )
      }

      // 4. Create version: POST .../versions (must come after publish check)
      if (url.includes("/versions") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: { version: { id: "v2", version_number: 2 } },
            }),
            { status: 200 },
          ),
        )
      }

      // 6. Publish runtime flow: POST /api/chatbot/flows
      if (url.includes("/api/chatbot/flows")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: { id: "runtime_1", flow_slug: "test-flow" },
            }),
            { status: 200 },
          ),
        )
      }

      // 7. Update project: PUT /api/magic-flow/projects/:id (save published_flow_id)
      if (url.includes("/api/magic-flow/projects") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(JSON.stringify({ status: "success" }), { status: 200 }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
  }

  function mockHappyPathAI() {
    mockGenerateFlow.mockImplementation(async (_req, emit) => {
      emit({ type: "tool_step", tool: "build_and_validate", status: "done", summary: "Built 5 nodes" })
      emit({ type: "flow_ready", action: "create" })
      emit({
        type: "result",
        data: {
          message: "Created a lead capture flow",
          flowData: {
            nodes: [
              { id: "1", type: "start", position: { x: 0, y: 0 }, data: {} },
              { id: "2", type: "question", position: { x: 0, y: 100 }, data: {} },
            ] as any[],
            edges: [{ id: "e1", source: "1", target: "2" }] as any[],
          },
          action: "create" as const,
        },
      })
    })
  }

  function makePostRequest(body: Record<string, unknown>) {
    // Inject a default name if not provided (required field)
    const withDefaults = { name: "Test Flow", ...body }
    return new Request("https://example.com/api/v1/agent/flows", {
      method: "POST",
      headers: {
        "x-api-key": "whm_abc",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withDefaults),
    })
  }

  // -------------------------------------------------------------------------
  // Test 1: Happy path
  // -------------------------------------------------------------------------
  it("happy path: SSE stream has progress events + terminal result", async () => {
    mockHappyPathFetch()
    mockHappyPathAI()

    const req = makePostRequest({
      instruction: "Create a lead capture flow that asks for name and email",
      channel: "whatsapp",
      trigger_keyword: "lead",
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/event-stream")

    const events = await readSSE(res)

    // Should have at least one progress event
    const progressEvents = events.filter((e) => e.event === "progress")
    expect(progressEvents.length).toBeGreaterThan(0)

    // Should have exactly one result event
    const resultEvents = events.filter((e) => e.event === "result")
    expect(resultEvents).toHaveLength(1)

    const result = resultEvents[0].data
    expect(result.flow_id).toBe("proj_1")
    expect(result.version).toBe(2)
    expect(result.node_count).toBe(3) // 2 AI-generated + 1 prepended start node
    expect(result.trigger_keyword).toBe("lead")
    expect(result.magic_flow_url).toBeUndefined()
    expect(result.platform_url).toContain("/flow/proj_1")
    expect(result.test_url).toBe("https://wa.me/919876543210?text=lead")
    expect(result.created_at).toBeDefined()
    // No description sent on the request → echoed as empty string, never
    // undefined. Matches PublicFlow's always-string contract.
    expect(result.description).toBe("")

    // Should NOT have any error events
    const errorEvents = events.filter((e) => e.event === "error")
    expect(errorEvents).toHaveLength(0)
  })

  it("echoes the request description in the result event when supplied", async () => {
    mockHappyPathFetch()
    mockHappyPathAI()

    const req = makePostRequest({
      instruction: "Create a lead capture flow",
      channel: "whatsapp",
      trigger_keyword: "lead2",
      description: "Sales-qualified lead capture — stages phone + email before routing",
    })
    const res = await POST(req)
    const events = await readSSE(res)
    const result = events.find((e) => e.event === "result")?.data
    expect(result?.description).toBe("Sales-qualified lead capture — stages phone + email before routing")
  })

  // -------------------------------------------------------------------------
  // Test 2: Missing instruction → HTTP 400 (pre-stream)
  // -------------------------------------------------------------------------
  it("returns HTTP 400 invalid_param when instruction is missing", async () => {
    // Only need accounts fetch (auth) — withAgentAuth runs before body parsing
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            accounts: [
              {
                id: "acc_1",
                name: "Test",
                phone_number: "+919876543210",
                status: "active",
                has_access_token: true,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )

    const req = makePostRequest({
      channel: "whatsapp",
      trigger_keyword: "lead",
      // instruction missing
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  // -------------------------------------------------------------------------
  // Test 3: Missing trigger_keyword → HTTP 400 (pre-stream)
  // -------------------------------------------------------------------------
  it("returns HTTP 400 invalid_param when trigger_keyword is missing", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            accounts: [
              {
                id: "acc_1",
                name: "Test",
                phone_number: "+919876543210",
                status: "active",
                has_access_token: true,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )

    const req = makePostRequest({
      instruction: "Create a lead capture flow",
      channel: "whatsapp",
      // trigger_keyword missing
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  // -------------------------------------------------------------------------
  // Test 4: Channel not connected → HTTP 400 (pre-stream)
  // -------------------------------------------------------------------------
  it("returns HTTP 400 channel_not_connected when channel is not linked", async () => {
    // Account only has whatsapp, but request uses instagram
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          data: {
            accounts: [
              {
                id: "acc_1",
                name: "Test",
                phone_number: "+919876543210",
                status: "active",
                has_access_token: true,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    )

    const req = makePostRequest({
      instruction: "Create a lead capture flow",
      channel: "instagram",
      trigger_keyword: "lead",
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("channel_not_connected")
    expect(Array.isArray(body.connected_channels)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Test 5: Keyword conflict → HTTP 409 (pre-stream)
  // -------------------------------------------------------------------------
  it("returns HTTP 409 keyword_conflict when trigger keyword is already in use", async () => {
    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      // Auth
      if (url.includes("/api/accounts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: {
                accounts: [
                  {
                    id: "acc_1",
                    name: "Test",
                    phone_number: "+919876543210",
                    status: "active",
                    has_access_token: true,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        )
      }

      // listFlows for keyword conflict — returns existing flow with "lead" keyword
      if (url.includes("/api/magic-flow/projects") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: {
                projects: [
                  {
                    id: "existing_proj",
                    name: "Existing Lead Flow",
                    created_at: "2026-04-01T00:00:00Z",
                    updated_at: "2026-04-01T00:00:00Z",
                    trigger_keywords: ["lead"],
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
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })

    const req = makePostRequest({
      instruction: "Create another lead flow",
      channel: "whatsapp",
      trigger_keyword: "lead",
    })

    const res = await POST(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("keyword_conflict")
    expect(body.existing_flow).toBeDefined()
    expect(body.existing_flow.id).toBe("existing_proj")
  })

  // -------------------------------------------------------------------------
  // Test 6: AI validation failure → SSE error + orphan cleanup
  // -------------------------------------------------------------------------
  it("SSE error event when AI emits error, and deleteProject is called (orphan cleanup)", async () => {
    mockHappyPathFetch()

    mockGenerateFlow.mockImplementation(async (_req, emit) => {
      emit({ type: "error", message: "AI model refused: content policy violation" })
    })

    const req = makePostRequest({
      instruction: "Create a flow",
      channel: "whatsapp",
      trigger_keyword: "test",
    })

    const res = await POST(req)
    // HTTP status is 200 — stream was already opened
    expect(res.status).toBe(200)

    const events = await readSSE(res)
    const errorEvents = events.filter((e) => e.event === "error")
    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0].data.code).toBe("validation_failed")

    // Orphan cleanup: DELETE /api/magic-flow/projects/proj_1 should have been called
    const allCalls = (global.fetch as any).mock.calls as Array<[string, RequestInit?]>
    const deleteCalls = allCalls.filter(
      ([url, init]) => url.includes("/api/magic-flow/projects/proj_1") && init?.method === "DELETE",
    )
    expect(deleteCalls.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Test 7: AI produces no flow data → SSE error with invalid_instruction
  // -------------------------------------------------------------------------
  it("SSE error event with invalid_instruction when AI emits result with no flowData", async () => {
    mockHappyPathFetch()

    mockGenerateFlow.mockImplementation(async (_req, emit) => {
      emit({
        type: "result",
        data: {
          message: "I cannot create that flow",
          flowData: undefined,
          action: "create" as const,
        },
      })
    })

    const req = makePostRequest({
      instruction: "Do something vague",
      channel: "whatsapp",
      trigger_keyword: "vague",
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const events = await readSSE(res)
    const errorEvents = events.filter((e) => e.event === "error")
    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0].data.code).toBe("invalid_instruction")
  })

  // -------------------------------------------------------------------------
  // Test 8: Publish failure → SSE error + orphan cleanup
  // -------------------------------------------------------------------------
  it("SSE error when publishRuntimeFlow fails, orphan cleanup runs", async () => {
    mockHappyPathAI()

    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      // Auth
      if (url.includes("/api/accounts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: {
                accounts: [
                  {
                    id: "acc_1",
                    name: "Test",
                    phone_number: "+919876543210",
                    status: "active",
                    has_access_token: true,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        )
      }

      // No keyword conflict
      if (url.includes("/api/magic-flow/projects") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { projects: [], total: 0 } }),
            { status: 200 },
          ),
        )
      }

      // Create project
      if (url.includes("/api/magic-flow/projects") && init?.method === "POST" && !url.includes("/versions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { project: { id: "proj_1" } } }),
            { status: 200 },
          ),
        )
      }

      // Publish version
      if (url.includes("/versions") && url.includes("/publish") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { version: { id: "v2", version_number: 2, is_published: true } } }),
            { status: 200 },
          ),
        )
      }

      // Create version
      if (url.includes("/versions") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { version: { id: "v2", version_number: 2 } } }),
            { status: 200 },
          ),
        )
      }

      // DELETE (orphan cleanup)
      if (url.includes("/api/magic-flow/projects/proj_1") && init?.method === "DELETE") {
        return Promise.resolve(
          new Response(JSON.stringify({ status: "success" }), { status: 200 }),
        )
      }

      // Runtime flow publish → fail with 500
      if (url.includes("/api/chatbot/flows")) {
        return Promise.resolve(new Response("internal server error", { status: 500 }))
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })

    const req = makePostRequest({
      instruction: "Create a lead flow",
      channel: "whatsapp",
      trigger_keyword: "lead",
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const events = await readSSE(res)
    const errorEvents = events.filter((e) => e.event === "error")
    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0].data.code).toBe("publish_failed")

    // Orphan cleanup was called
    const allCalls = (global.fetch as any).mock.calls as Array<[string, RequestInit?]>
    const deleteCalls = allCalls.filter(
      ([url, init]) => url.includes("/api/magic-flow/projects/proj_1") && init?.method === "DELETE",
    )
    expect(deleteCalls.length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Test 9: Orphan cleanup failure — cleanup error is swallowed
  // -------------------------------------------------------------------------
  it("SSE error is the publish error when both publish and cleanup fail", async () => {
    mockHappyPathAI()

    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      // Auth
      if (url.includes("/api/accounts")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "success",
              data: {
                accounts: [
                  {
                    id: "acc_1",
                    name: "Test",
                    phone_number: "+919876543210",
                    status: "active",
                    has_access_token: true,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        )
      }

      // No keyword conflict
      if (url.includes("/api/magic-flow/projects") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { projects: [], total: 0 } }),
            { status: 200 },
          ),
        )
      }

      // Create project
      if (url.includes("/api/magic-flow/projects") && init?.method === "POST" && !url.includes("/versions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { project: { id: "proj_1" } } }),
            { status: 200 },
          ),
        )
      }

      // Publish version
      if (url.includes("/versions") && url.includes("/publish") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { version: { id: "v2", version_number: 2, is_published: true } } }),
            { status: 200 },
          ),
        )
      }

      // Create version
      if (url.includes("/versions") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { version: { id: "v2", version_number: 2 } } }),
            { status: 200 },
          ),
        )
      }

      // Both runtime publish AND delete (cleanup) fail
      if (url.includes("/api/chatbot/flows")) {
        return Promise.resolve(new Response("internal server error", { status: 500 }))
      }

      if (url.includes("/api/magic-flow/projects/proj_1") && init?.method === "DELETE") {
        return Promise.resolve(new Response("cleanup failed", { status: 500 }))
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })

    const req = makePostRequest({
      instruction: "Create a lead flow",
      channel: "whatsapp",
      trigger_keyword: "lead",
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const events = await readSSE(res)

    // There should be exactly one error event — the publish error
    const errorEvents = events.filter((e) => e.event === "error")
    expect(errorEvents).toHaveLength(1)
    // The error is the publish failure, not the cleanup failure
    expect(errorEvents[0].data.code).toBe("publish_failed")

    // No result event
    const resultEvents = events.filter((e) => e.event === "result")
    expect(resultEvents).toHaveLength(0)
  })
})
