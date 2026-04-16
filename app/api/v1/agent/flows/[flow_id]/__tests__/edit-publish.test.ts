import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { POST as editPOST } from "@/app/api/v1/agent/flows/[flow_id]/edit/route"
import { POST as publishPOST } from "@/app/api/v1/agent/flows/[flow_id]/publish/route"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

// Must be at the top level for vitest hoisting to work correctly
vi.mock("@/lib/ai/tools/generate-flow", () => ({
  generateFlowStreaming: vi.fn(),
}))

import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"

const mockGenerateFlow = vi.mocked(generateFlowStreaming)

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
// Shared mock data
// ---------------------------------------------------------------------------

const ACCOUNTS_BODY = {
  status: "success",
  data: {
    accounts: [
      {
        id: "acc_1",
        name: "Acme",
        phone_number: "+919876543210",
        status: "active",
        has_access_token: true,
      },
    ],
  },
}

const PROJECT_BODY = {
  status: "success",
  data: {
    project: {
      id: "proj_1",
      name: "Test Flow",
      platform: "whatsapp",
      published_flow_id: "rt_abc",
      flow_slug: "test-flow",
      trigger_keywords: ["hello"],
      trigger_match_type: "exact",
      wa_account_id: "acc_1",
      wa_phone_number: "+919876543210",
      created_at: "2026-04-16T09:00:00Z",
      updated_at: "2026-04-16T09:00:00Z",
      latest_version: {
        id: "ver_3",
        version_number: 3,
        nodes: [
          { id: "1", type: "start", position: { x: 250, y: 25 }, data: { label: "Start" } },
          {
            id: "2",
            type: "whatsappQuestion",
            position: { x: 250, y: 150 },
            data: { question: "What is your name?", storeAs: "name" },
          },
        ],
        edges: [{ id: "e1-2", source: "1", target: "2" }],
        platform: "whatsapp",
        is_published: true,
        published_at: "2026-04-16T09:00:00Z",
        changes: [],
      },
    },
  },
}

const NEW_VERSION_BODY = {
  status: "success",
  data: { version: { id: "ver_4", version_number: 4 } },
}

// ---------------------------------------------------------------------------
// POST /v1/agent/flows/{flow_id}/edit
// ---------------------------------------------------------------------------

describe("POST /v1/agent/flows/[flow_id]/edit", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
    mockGenerateFlow.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function makeEditRequest(body: Record<string, unknown>, apiKey = "whm_abc") {
    return new Request("https://example.com/api/v1/agent/flows/proj_1/edit", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  }

  function mockEditFetch() {
    // Call sequence for edit:
    //   1. GET /api/accounts (withAgentAuth → getActingAccount)
    //   2. GET /api/magic-flow/projects/proj_1 (loadFlowForEdit → getProject)
    //   3. POST /api/magic-flow/projects/proj_1/versions (createVersion)
    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/accounts")) {
        return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      }
      if (url.includes("/api/magic-flow/projects/proj_1/versions") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify(NEW_VERSION_BODY), { status: 200 }))
      }
      if (url.includes("/api/magic-flow/projects/proj_1") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify(PROJECT_BODY), { status: 200 }))
      }
      return Promise.resolve(new Response("not found", { status: 404 }))
    })
  }

  function mockEditAI() {
    mockGenerateFlow.mockImplementation(async (_req, emit) => {
      emit({ type: "tool_step", tool: "apply_edit", status: "done", summary: "Added a confirmation node" })
      emit({ type: "flow_ready", action: "edit" })
      emit({
        type: "result",
        data: {
          message: "Added a new confirmation message node",
          updates: {
            nodes: [
              {
                id: "3",
                type: "whatsappMessage",
                position: { x: 250, y: 275 },
                data: { message: "Thank you, {{name}}!" },
              },
            ],
            edges: [{ id: "e2-3", source: "2", target: "3" }],
          },
          action: "edit" as const,
        },
      })
    })
  }

  // -------------------------------------------------------------------------
  // Test 1: Happy path
  // -------------------------------------------------------------------------
  it("happy path: SSE stream has progress events + result with published:false and version:4", async () => {
    mockEditFetch()
    mockEditAI()

    const req = makeEditRequest({ instruction: "Add a thank you message after the name question" })

    const res = await editPOST(req)
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
    expect(result.published).toBe(false)
    expect(result.version).toBe(4)
    expect(Array.isArray(result.changes)).toBe(true)
    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.next_action).toContain("publish")
    expect(result.magic_flow_url).toContain("/flow/proj_1")

    // Should NOT have any error events
    const errorEvents = events.filter((e) => e.event === "error")
    expect(errorEvents).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // Test 2: 401 without API key
  // -------------------------------------------------------------------------
  it("returns 401 when X-API-Key is missing", async () => {
    const req = new Request("https://example.com/api/v1/agent/flows/proj_1/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Add a node" }),
    })
    const res = await editPOST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("unauthorized")
  })

  // -------------------------------------------------------------------------
  // Test 3: 400 on missing instruction
  // -------------------------------------------------------------------------
  it("returns 400 when instruction is missing", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }),
    )

    const req = makeEditRequest({}) // no instruction field
    const res = await editPOST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  // -------------------------------------------------------------------------
  // Test 4: 404 when project not found
  // -------------------------------------------------------------------------
  it("returns 404 when project does not exist", async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("/api/accounts")) {
        return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      }
      // getProject returns 404
      if (url.includes("/api/magic-flow/projects/proj_1")) {
        return Promise.resolve(new Response("not found", { status: 404 }))
      }
      return Promise.resolve(new Response("not found", { status: 404 }))
    })

    const req = makeEditRequest({ instruction: "Add a node" })
    const res = await editPOST(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe("flow_not_found")
  })
})

// ---------------------------------------------------------------------------
// POST /v1/agent/flows/{flow_id}/publish
// ---------------------------------------------------------------------------

describe("POST /v1/agent/flows/[flow_id]/publish", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function makePublishRequest() {
    return new Request("https://example.com/api/v1/agent/flows/proj_1/publish", {
      method: "POST",
      headers: {
        "x-api-key": "whm_abc",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    })
  }

  // -------------------------------------------------------------------------
  // Test 1: Happy path — unpublished latest version gets published
  //
  // Call sequence:
  //   1. GET /api/accounts (auth)
  //   2. GET /api/magic-flow/projects/proj_1 (getProject)
  //   3. GET /api/magic-flow/projects/proj_1/versions (listVersions)
  //   4. POST .../versions/ver_4/publish (publishVersion)
  //   5. PUT /api/chatbot/flows/rt_abc (publishRuntimeFlow — update because publishedFlowId exists)
  // -------------------------------------------------------------------------
  it("happy path: publishes unpublished latest version and returns 200 with test_url", async () => {
    const versionsBody = {
      status: "success",
      data: {
        versions: [
          {
            id: "ver_4",
            version_number: 4,
            nodes: PROJECT_BODY.data.project.latest_version.nodes,
            edges: PROJECT_BODY.data.project.latest_version.edges,
            platform: "whatsapp",
            is_published: false, // not yet published
            published_at: undefined,
            changes: [],
          },
        ],
      },
    }

    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/accounts")) {
        return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      }
      // listVersions
      if (url.includes("/versions") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify(versionsBody), { status: 200 }))
      }
      // getProject
      if (url.includes("/api/magic-flow/projects/proj_1") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify(PROJECT_BODY), { status: 200 }))
      }
      // publishVersion: POST .../versions/ver_4/publish
      if (url.includes("/versions/ver_4/publish") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { version: { id: "ver_4", version_number: 4, is_published: true } } }),
            { status: 200 },
          ),
        )
      }
      // publishRuntimeFlow: PUT /api/chatbot/flows/rt_abc (update because project has publishedFlowId)
      if (url.includes("/api/chatbot/flows/rt_abc") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: "success", data: { id: "rt_abc", flow_slug: "test-flow" } }),
            { status: 200 },
          ),
        )
      }
      // updateProject: PUT /api/magic-flow/projects/:id (save published_flow_id)
      if (url.includes("/api/magic-flow/projects/") && init?.method === "PUT") {
        return Promise.resolve(
          new Response(JSON.stringify({ status: "success" }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response("not found", { status: 404 }))
    })

    const res = await publishPOST(makePublishRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.published).toBe(true)
    expect(body.already_published).toBe(false)
    expect(body.test_url).toBe("https://wa.me/919876543210?text=hello")
    expect(body.flow_id).toBe("proj_1")
    expect(body.version).toBe(4)
  })

  // -------------------------------------------------------------------------
  // Test 2: Idempotent — latest version already published
  //
  // Call sequence:
  //   1. GET /api/accounts (auth)
  //   2. GET /api/magic-flow/projects/proj_1 (getProject)
  //   3. GET /api/magic-flow/projects/proj_1/versions (listVersions → already published)
  //   No further calls to publishVersion or publishRuntimeFlow.
  // -------------------------------------------------------------------------
  it("idempotent: returns already_published:true without calling publishVersion or publishRuntimeFlow", async () => {
    const versionsBody = {
      status: "success",
      data: {
        versions: [
          {
            id: "ver_3",
            version_number: 3,
            nodes: PROJECT_BODY.data.project.latest_version.nodes,
            edges: PROJECT_BODY.data.project.latest_version.edges,
            platform: "whatsapp",
            is_published: true, // already published
            published_at: "2026-04-16T09:00:00Z",
            changes: [],
          },
        ],
      },
    }

    ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/accounts")) {
        return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      }
      // listVersions
      if (url.includes("/versions") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify(versionsBody), { status: 200 }))
      }
      // getProject
      if (url.includes("/api/magic-flow/projects/proj_1") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(new Response(JSON.stringify(PROJECT_BODY), { status: 200 }))
      }
      // publishVersion or publishRuntimeFlow — should NOT be called
      return Promise.resolve(new Response("should not have been called", { status: 500 }))
    })

    const res = await publishPOST(makePublishRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.published).toBe(true)
    expect(body.already_published).toBe(true)
    expect(body.test_url).toBe("https://wa.me/919876543210?text=hello")

    // Verify no publish calls were made
    const allCalls = (global.fetch as any).mock.calls as Array<[string, RequestInit?]>
    const publishCalls = allCalls.filter(
      ([url, init]) =>
        (url.includes("/publish") && init?.method === "POST") ||
        (url.includes("/api/chatbot/flows") && (init?.method === "POST" || init?.method === "PUT")),
    )
    expect(publishCalls).toHaveLength(0)
  })
})
