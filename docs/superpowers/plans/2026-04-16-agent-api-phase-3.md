# Agent API Phase 3: Edit + Publish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new agent API endpoints — `POST /v1/agent/flows/{id}/edit` (SSE streaming) and `POST /v1/agent/flows/{id}/publish` (JSON) — completing the CRUD surface.

**Architecture:** The edit endpoint loads the project + latest published version from fs-whatsapp, runs `generateFlowStreaming` in edit mode with a filtered tool set (5 tools, no `trigger_flow`), saves the result as an unpublished version, and streams progress as SSE. The publish endpoint promotes the latest version to live and re-deploys to the runtime. Both reuse the existing `withAgentAuth` wrapper and `publisher.ts` helpers.

**Tech Stack:** Next.js route handlers, Zod validation, SSE streaming, Vitest

**Worktree:** `/Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3` (branch `feat/flow-assistant-agent-api-phase-3`, port 3012)

---

## File Structure

```
New files:
  lib/agent-api/flow-loader.ts           — loads project + published version for edit context
  app/api/v1/agent/flows/[flow_id]/
    edit/route.ts                         — POST handler (edit, SSE)
    publish/route.ts                      — POST handler (publish, JSON)
  lib/agent-api/__tests__/flow-loader.test.ts

Modified files:
  lib/ai/tools/list-approved-templates.ts — accept X-API-Key header alongside Authorization
  lib/agent-api/publisher.ts              — add getProject + listVersions helpers
  lib/agent-api/schemas.ts               — already has editFlowBodySchema + publishFlowBodySchema (done)
  docs/agent-api/reference.md            — add edit + publish endpoint docs
  docs/agent-api/quickstart.md           — add edit + publish examples
  docs/agent-api/system-prompt.md        — add edit + publish tool guidance
```

---

## Task 1: Add project + version loading to publisher.ts

**Why first:** Both edit and publish endpoints need to load a project by ID and get its latest/published version. This is the data layer they both depend on.

**Files:**
- Modify: `lib/agent-api/publisher.ts`
- Test: `lib/agent-api/__tests__/publisher.test.ts` (existing file — add new tests)

- [ ] **Step 1: Write failing tests for getProject**

Add to the existing `lib/agent-api/__tests__/publisher.test.ts`:

```typescript
describe("getProject", () => {
  it("returns project with latest_version when found", async () => {
    const projectBody = {
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
            nodes: [{ id: "1", type: "start", position: { x: 0, y: 0 }, data: {} }],
            edges: [],
            platform: "whatsapp",
            is_published: true,
            published_at: "2026-04-16T09:00:00Z",
            changes: [],
          },
        },
      },
    }
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify(projectBody), { status: 200 }),
    )

    const result = await getProject(CTX, "proj_1")
    expect(result.id).toBe("proj_1")
    expect(result.name).toBe("Test Flow")
    expect(result.publishedFlowId).toBe("rt_abc")
    expect(result.triggerKeywords).toEqual(["hello"])
    expect(result.latestVersion).toBeDefined()
    expect(result.latestVersion!.id).toBe("ver_3")
    expect(result.latestVersion!.nodes).toHaveLength(1)
  })

  it("throws flow_not_found on 404", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response("", { status: 404 }),
    )
    await expect(getProject(CTX, "missing")).rejects.toThrow("flow_not_found")
  })

  it("throws internal_error on non-404 failure", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response("", { status: 500 }),
    )
    await expect(getProject(CTX, "proj_1")).rejects.toThrow("internal_error")
  })
})
```

Where `CTX` is the test's existing `AgentContext` fixture (the existing test file should have one — check its `beforeEach` or add `const CTX: AgentContext = { apiKey: "whm_test", account: { id: "acc_1", name: "Test", phone_number: "+919876543210", connected_channels: ["whatsapp"] } }` at the top of the describe block). Also import `getProject` from the publisher.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/agent-api/__tests__/publisher.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `getProject` is not exported.

- [ ] **Step 3: Implement getProject in publisher.ts**

Add after the existing `deleteProject` function (~line 182):

```typescript
// ---------------------------------------------------------------------------
// Project + version loading (Phase 3)
// ---------------------------------------------------------------------------

export interface ProjectInfo {
  id: string
  name: string
  platform: string
  publishedFlowId: string | undefined
  flowSlug: string
  triggerKeywords: string[]
  triggerMatchType: string
  waAccountId: string
  waPhoneNumber: string
  latestVersion: VersionInfo | undefined
}

export interface VersionInfo {
  id: string
  versionNumber: number
  nodes: any[]
  edges: any[]
  platform: string
  isPublished: boolean
  publishedAt: string | undefined
  changes: any[]
}

export async function getProject(
  ctx: AgentContext,
  projectId: string,
): Promise<ProjectInfo> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (res.status === 404) {
    throw new AgentError("flow_not_found", `Flow ${projectId} not found`)
  }
  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when loading project`)
  }

  let body: { status?: string; data?: { project?: any } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable project response")
  }

  const p = body.data?.project
  if (!p?.id) {
    throw new AgentError("flow_not_found", `Flow ${projectId} not found`)
  }

  const lv = p.latest_version
  const latestVersion: VersionInfo | undefined = lv
    ? {
        id: lv.id,
        versionNumber: lv.version_number,
        nodes: lv.nodes || [],
        edges: lv.edges || [],
        platform: lv.platform,
        isPublished: lv.is_published,
        publishedAt: lv.published_at,
        changes: lv.changes || [],
      }
    : undefined

  return {
    id: p.id,
    name: p.name,
    platform: p.platform,
    publishedFlowId: p.published_flow_id || undefined,
    flowSlug: p.flow_slug,
    triggerKeywords: p.trigger_keywords || [],
    triggerMatchType: p.trigger_match_type || "exact",
    waAccountId: p.wa_account_id || "",
    waPhoneNumber: p.wa_phone_number || "",
    latestVersion,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/agent-api/__tests__/publisher.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Write failing test for listVersions**

Add to the same test file:

```typescript
describe("listVersions", () => {
  it("returns parsed version list sorted by version_number DESC", async () => {
    const body = {
      status: "success",
      data: {
        versions: [
          { id: "v3", project_id: "proj_1", version_number: 3, name: "v3", description: "", nodes: [], edges: [], platform: "whatsapp", is_published: true, published_at: "2026-04-16T09:00:00Z", changes: [], created_at: "2026-04-16T09:00:00Z" },
          { id: "v2", project_id: "proj_1", version_number: 2, name: "v2", description: "", nodes: [], edges: [], platform: "whatsapp", is_published: false, changes: [], created_at: "2026-04-16T08:00:00Z" },
        ],
      },
    }
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    )

    const versions = await listVersions(CTX, "proj_1")
    expect(versions).toHaveLength(2)
    expect(versions[0].id).toBe("v3")
    expect(versions[0].isPublished).toBe(true)
    expect(versions[1].versionNumber).toBe(2)
  })
})
```

Import `listVersions` from publisher.

- [ ] **Step 6: Implement listVersions in publisher.ts**

Add after `getProject`:

```typescript
export async function listVersions(
  ctx: AgentContext,
  projectId: string,
): Promise<VersionInfo[]> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}/versions`

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when listing versions`)
  }

  let body: { status?: string; data?: { versions?: any[] } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable versions response")
  }

  const raw = body.data?.versions ?? []
  return raw.map((v: any): VersionInfo => ({
    id: v.id,
    versionNumber: v.version_number,
    nodes: v.nodes || [],
    edges: v.edges || [],
    platform: v.platform,
    isPublished: v.is_published,
    publishedAt: v.published_at,
    changes: v.changes || [],
  }))
}
```

- [ ] **Step 7: Run full publisher tests**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/agent-api/__tests__/publisher.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add lib/agent-api/publisher.ts lib/agent-api/__tests__/publisher.test.ts
git commit -m "feat(agent-api): add getProject and listVersions to publisher"
```

---

## Task 2: Fix list_approved_templates to accept X-API-Key

**Why:** The edit endpoint passes `toolContext` with an API key (not a JWT). The existing `list_approved_templates` tool sends `Authorization: authHeader` to `/api/templates`. For agent API calls, we need to send `X-API-Key` instead. The fix: the factory reads from `toolContext.apiKey` when present and sends `X-API-Key` header; falls back to `Authorization` for the UI path.

**Files:**
- Modify: `lib/ai/tools/list-approved-templates.ts`
- Test: `lib/ai/tools/__tests__/list-approved-templates.test.ts` (if exists, otherwise add inline verification)

- [ ] **Step 1: Write failing test for X-API-Key auth path**

Check if `lib/ai/tools/__tests__/list-approved-templates.test.ts` exists. If it does, add a test. If not, create it:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchApprovedTemplates } from "../list-approved-templates"

describe("fetchApprovedTemplates", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("sends X-API-Key header when authHeader starts with whm_", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { templates: [] } }), { status: 200 }),
    )
    global.fetch = mockFetch

    await fetchApprovedTemplates("http://localhost:8080", "whm_test_key")

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_test_key")
    expect(init.headers["Authorization"]).toBeUndefined()
  })

  it("sends Authorization header when authHeader is a JWT Bearer token", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { templates: [] } }), { status: 200 }),
    )
    global.fetch = mockFetch

    await fetchApprovedTemplates("http://localhost:8080", "Bearer jwt_token")

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers["Authorization"]).toBe("Bearer jwt_token")
    expect(init.headers["X-API-Key"]).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/ai/tools/__tests__/list-approved-templates.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — the current code always sends `Authorization`.

- [ ] **Step 3: Update fetchApprovedTemplates to support both auth modes**

In `lib/ai/tools/list-approved-templates.ts`, change the `fetchApprovedTemplates` function:

```typescript
export async function fetchApprovedTemplates(
  apiUrl: string,
  authHeader: string,
): Promise<FetchApprovedTemplatesResult> {
  try {
    // Agent API passes whm_* keys; UI passes "Bearer <jwt>".
    // Route to the correct header so fs-whatsapp's auth middleware accepts it.
    const headers: Record<string, string> = authHeader.startsWith("whm_")
      ? { "X-API-Key": authHeader }
      : { Authorization: authHeader }

    const res = await fetch(`${apiUrl}/api/templates?status=APPROVED`, { headers })
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const inner = data && typeof data === "object" && "data" in data ? data.data : data
    const raw = Array.isArray(inner) ? inner : inner?.templates || []
    const templates = raw.map(shapeTemplate)
    return { success: true, templates, count: templates.length }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/ai/tools/__tests__/list-approved-templates.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add lib/ai/tools/list-approved-templates.ts lib/ai/tools/__tests__/list-approved-templates.test.ts
git commit -m "fix(list-templates): support X-API-Key auth for agent API path"
```

---

## Task 3: Create flow-loader.ts

**Why:** The edit endpoint needs to load a flow's project metadata + latest published version, reconstruct it as a `{ nodes, edges }` object that `generateFlowStreaming` understands, and provide the `toolContext` with the forwarded API key. This module encapsulates that logic.

**Files:**
- Create: `lib/agent-api/flow-loader.ts`
- Create: `lib/agent-api/__tests__/flow-loader.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest"
import { loadFlowForEdit } from "../flow-loader"
import type { AgentContext } from "../types"

// Mock publisher module
vi.mock("../publisher", () => ({
  getProject: vi.fn(),
}))

import { getProject } from "../publisher"
const mockGetProject = vi.mocked(getProject)

const CTX: AgentContext = {
  apiKey: "whm_test",
  account: { id: "acc_1", name: "Test", phone_number: "+919876543210", connected_channels: ["whatsapp"] },
}

describe("loadFlowForEdit", () => {
  afterEach(() => {
    mockGetProject.mockReset()
  })

  it("returns existing flow nodes/edges + toolContext from published version", async () => {
    mockGetProject.mockResolvedValue({
      id: "proj_1",
      name: "My Flow",
      platform: "whatsapp",
      publishedFlowId: "rt_abc",
      flowSlug: "my-flow",
      triggerKeywords: ["hello"],
      triggerMatchType: "exact",
      waAccountId: "acc_1",
      waPhoneNumber: "+919876543210",
      latestVersion: {
        id: "ver_3",
        versionNumber: 3,
        nodes: [
          { id: "1", type: "start", position: { x: 0, y: 0 }, data: { label: "Start" } },
          { id: "2", type: "whatsappQuestion", position: { x: 250, y: 100 }, data: { question: "What is your name?" } },
        ],
        edges: [{ id: "e1-2", source: "1", target: "2" }],
        platform: "whatsapp",
        isPublished: true,
        publishedAt: "2026-04-16T09:00:00Z",
        changes: [],
      },
    })

    const result = await loadFlowForEdit(CTX, "proj_1")

    expect(result.project.id).toBe("proj_1")
    expect(result.project.name).toBe("My Flow")
    expect(result.existingFlow.nodes).toHaveLength(2)
    expect(result.existingFlow.edges).toHaveLength(1)
    expect(result.toolContext.authHeader).toBe("whm_test")
    expect(result.version.id).toBe("ver_3")
    expect(result.version.versionNumber).toBe(3)
  })

  it("throws flow_not_found when project has no published version", async () => {
    mockGetProject.mockResolvedValue({
      id: "proj_1",
      name: "My Flow",
      platform: "whatsapp",
      publishedFlowId: undefined,
      flowSlug: "my-flow",
      triggerKeywords: [],
      triggerMatchType: "exact",
      waAccountId: "",
      waPhoneNumber: "",
      latestVersion: undefined,
    })

    await expect(loadFlowForEdit(CTX, "proj_1")).rejects.toThrow(
      "has no published version",
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/agent-api/__tests__/flow-loader.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement flow-loader.ts**

```typescript
import { getProject } from "./publisher"
import type { ProjectInfo, VersionInfo } from "./publisher"
import { AgentError } from "./errors"
import type { AgentContext } from "./types"
import type { Node, Edge } from "@xyflow/react"

export interface FlowEditContext {
  project: ProjectInfo
  version: VersionInfo
  existingFlow: {
    nodes: Node[]
    edges: Edge[]
  }
  /** toolContext to pass to generateFlowStreaming — carries the API key as authHeader */
  toolContext: {
    authHeader: string
  }
}

/**
 * Load a flow project and its latest published version for editing via the agent API.
 *
 * The returned `existingFlow` is the exact shape that `generateFlowStreaming`
 * expects when it enters edit mode (nodes array must have non-start nodes to
 * trigger edit, see generate-flow.ts:365-369).
 *
 * The `toolContext.authHeader` carries the raw `whm_*` key. Downstream tools
 * (like `list_approved_templates`) detect the `whm_` prefix and send it as
 * `X-API-Key` instead of `Authorization`.
 */
export async function loadFlowForEdit(
  ctx: AgentContext,
  projectId: string,
): Promise<FlowEditContext> {
  const project = await getProject(ctx, projectId)

  if (!project.latestVersion) {
    throw new AgentError(
      "flow_not_found",
      `Flow ${projectId} has no published version to edit`,
    )
  }

  const version = project.latestVersion

  return {
    project,
    version,
    existingFlow: {
      nodes: version.nodes as Node[],
      edges: version.edges as Edge[],
    },
    toolContext: {
      authHeader: ctx.apiKey,
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run lib/agent-api/__tests__/flow-loader.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add lib/agent-api/flow-loader.ts lib/agent-api/__tests__/flow-loader.test.ts
git commit -m "feat(agent-api): add flow-loader for edit endpoint context"
```

---

## Task 4: Implement the edit endpoint

**Why:** This is the core deliverable — `POST /v1/agent/flows/{id}/edit`. It loads the published flow, runs AI edit mode with streaming, saves the result as an unpublished version, and returns a compact diff.

**Files:**
- Create: `app/api/v1/agent/flows/[flow_id]/edit/route.ts`

- [ ] **Step 1: Create the edit route handler**

Create `app/api/v1/agent/flows/[flow_id]/edit/route.ts`:

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import { editFlowBodySchema } from "@/lib/agent-api/schemas"
import { SSEWriter } from "@/lib/agent-api/sse"
import { loadFlowForEdit } from "@/lib/agent-api/flow-loader"
import { createVersion } from "@/lib/agent-api/publisher"
import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"
import { applyNodeUpdates } from "@/lib/ai/tools/generate-flow-edit"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import type { Node, Edge } from "@xyflow/react"

/**
 * POST /v1/agent/flows/{flow_id}/edit — edit an existing flow via AI instruction.
 *
 * Streams SSE progress events during AI generation, saves the result as an
 * unpublished version. The caller must separately call POST .../publish to
 * make the edit live.
 *
 * Auth: X-API-Key header with a whm_* key.
 * Rate limit bucket: expensive (10/min).
 */
export const POST = withAgentAuth(async (ctx, req) => {
  // Extract flow_id from the URL path
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  // Path: /api/v1/agent/flows/{flow_id}/edit
  const flowIdIndex = segments.indexOf("flows") + 1
  const flowId = segments[flowIdIndex]
  if (!flowId) {
    throw new AgentError("missing_required_param", "Missing flow_id in URL path")
  }

  // Parse request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new AgentError("missing_required_param", "Invalid or missing JSON body")
  }

  const parsed = editFlowBodySchema.safeParse(body)
  if (!parsed.success) {
    throw new AgentError("invalid_param", "Invalid request body", {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const { instruction } = parsed.data

  // Load the flow's project + latest published version (pre-stream validation)
  const flowCtx = await loadFlowForEdit(ctx, flowId)
  const { project, version, existingFlow, toolContext } = flowCtx

  // --- Start SSE stream ---
  const { readable, writer } = SSEWriter.create()

  const pipeline = async () => {
    try {
      writer.progress("understanding", "Analyzing your edit request")

      // Capture the AI result via closure
      const captured: {
        updates: {
          nodes?: Node[]
          edges?: Edge[]
          removeNodeIds?: string[]
          removeEdges?: Array<{ source: string; target: string; sourceHandle?: string }>
          positionShifts?: Array<{ nodeId: string; dx: number }>
        } | null
        message: string
        error: string | null
      } = { updates: null, message: "", error: null }

      // Template data for list_approved_templates tool + templateResolver
      const userTemplates = DEFAULT_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        aiMetadata: t.aiMetadata,
      }))
      const userTemplateData = DEFAULT_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        nodes: t.nodes,
        edges: t.edges,
      }))

      await generateFlowStreaming(
        {
          prompt: instruction,
          platform: project.platform as any,
          existingFlow,
          context: { source: "agent_api" },
          userTemplates,
          userTemplateData,
          toolContext,
        },
        (event: StreamEvent) => {
          switch (event.type) {
            case "text_delta":
              // Drop — AI prose tokens are noise for the agent API
              break
            case "tool_step":
              if (event.status === "done" && event.summary) {
                writer.progress("editing", event.summary)
              }
              break
            case "flow_ready":
              writer.progress("validating", "Edit validated")
              break
            case "result":
              captured.updates = event.data.updates ?? null
              captured.message = event.data.message
              break
            case "error":
              captured.error = event.message
              break
          }
        },
      )

      if (captured.error) {
        throw new AgentError("validation_failed", captured.error)
      }
      if (!captured.updates) {
        throw new AgentError(
          "invalid_instruction",
          captured.message || "AI could not determine what to edit. Try a more specific instruction.",
        )
      }

      const updates = captured.updates

      // Merge updates into the existing flow to produce the new version's full state
      const existingNodes = existingFlow.nodes
      const existingEdges = existingFlow.edges

      // 1. Remove nodes
      const removeNodeSet = new Set(updates.removeNodeIds ?? [])
      let mergedNodes = existingNodes.filter((n) => !removeNodeSet.has(n.id))

      // 2. Apply updated/new nodes from the AI
      if (updates.nodes && updates.nodes.length > 0) {
        const updatedNodeMap = new Map(updates.nodes.map((n) => [n.id, n]))
        mergedNodes = mergedNodes.map((n) => updatedNodeMap.get(n.id) ?? n)
        // Add truly new nodes (not in existing)
        const existingIds = new Set(mergedNodes.map((n) => n.id))
        for (const n of updates.nodes) {
          if (!existingIds.has(n.id)) {
            mergedNodes.push(n)
          }
        }
      }

      // 3. Apply position shifts
      if (updates.positionShifts) {
        const shiftMap = new Map(updates.positionShifts.map((s) => [s.nodeId, s.dx]))
        mergedNodes = mergedNodes.map((n) => {
          const dx = shiftMap.get(n.id)
          if (dx !== undefined) {
            return { ...n, position: { ...n.position, x: n.position.x + dx } }
          }
          return n
        })
      }

      // 4. Remove edges
      const removeEdgeKeys = new Set(
        (updates.removeEdges ?? []).map(
          (e) => `${e.source}-${e.target}-${e.sourceHandle || ""}`,
        ),
      )
      let mergedEdges = existingEdges.filter(
        (e) => !removeEdgeKeys.has(`${e.source}-${e.target}-${e.sourceHandle || ""}`),
      )

      // 5. Add new edges
      if (updates.edges && updates.edges.length > 0) {
        mergedEdges = [...mergedEdges, ...updates.edges]
      }

      // Build change entries
      const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const now = new Date().toISOString()
      const flowChanges: any[] = []

      if (updates.nodes) {
        for (const n of updates.nodes) {
          const existed = existingNodes.some((en) => en.id === n.id)
          flowChanges.push({
            id: generateId(),
            type: existed ? "node_update" : "node_add",
            timestamp: now,
            data: n,
            description: existed
              ? `Updated ${n.type || "node"}: ${(n.data as any)?.label || n.id}`
              : `Added ${n.type || "node"}: ${(n.data as any)?.label || n.id}`,
            source: "ai",
          })
        }
      }
      for (const nodeId of updates.removeNodeIds ?? []) {
        const removed = existingNodes.find((n) => n.id === nodeId)
        flowChanges.push({
          id: generateId(),
          type: "node_remove",
          timestamp: now,
          data: { id: nodeId },
          description: `Removed ${removed?.type || "node"}: ${(removed?.data as any)?.label || nodeId}`,
          source: "ai",
        })
      }

      // Save as new unpublished version
      writer.progress("saving", "Saving new version")
      const newVersion = await createVersion(
        ctx,
        project.id,
        mergedNodes,
        mergedEdges,
        flowChanges as any,
      )

      // Build compact changes summary for the response
      const changesSummary = flowChanges.map((c) => ({
        type: c.type,
        node_id: c.data?.id,
        description: c.description,
      }))

      // Final result — NOT published
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
      writer.result({
        flow_id: project.id,
        version: newVersion.version_number,
        published: false,
        name: project.name,
        summary: captured.message || "Flow edited successfully",
        changes: changesSummary,
        node_count: mergedNodes.length,
        magic_flow_url: `${appUrl}/flow/${project.id}`,
        next_action: `Call POST /v1/agent/flows/${project.id}/publish to make this version live`,
        updated_at: now,
      })
    } catch (err) {
      const agentErr = AgentError.fromUnknown(err)
      writer.error(agentErr)
    } finally {
      writer.close()
    }
  }

  // Fire pipeline async — the Response returns immediately with the readable stream
  pipeline()

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}, "expensive")
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors (or fix any type errors that arise).

- [ ] **Step 3: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add app/api/v1/agent/flows/\[flow_id\]/edit/route.ts
git commit -m "feat(agent-api): add POST /v1/agent/flows/{id}/edit endpoint"
```

---

## Task 5: Implement the publish endpoint

**Why:** Separate publish step after edit. Promotes the latest version to live and re-deploys to the runtime.

**Files:**
- Create: `app/api/v1/agent/flows/[flow_id]/publish/route.ts`

- [ ] **Step 1: Create the publish route handler**

Create `app/api/v1/agent/flows/[flow_id]/publish/route.ts`:

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import { publishFlowBodySchema } from "@/lib/agent-api/schemas"
import {
  getProject,
  listVersions,
  publishVersion,
  publishRuntimeFlow,
} from "@/lib/agent-api/publisher"
import { convertToFsWhatsApp } from "@/utils/whatsapp-converter"
import { flattenFlow } from "@/utils/flow-flattener"

/**
 * POST /v1/agent/flows/{flow_id}/publish — publish the latest version to live.
 *
 * Returns JSON (not SSE). Idempotent — if already published, returns
 * `already_published: true` instead of an error.
 *
 * Auth: X-API-Key header with a whm_* key.
 * Rate limit bucket: publish (30/min).
 */
export const POST = withAgentAuth(async (ctx, req) => {
  // Extract flow_id from URL path
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  // Path: /api/v1/agent/flows/{flow_id}/publish
  const flowIdIndex = segments.indexOf("flows") + 1
  const flowId = segments[flowIdIndex]
  if (!flowId) {
    throw new AgentError("missing_required_param", "Missing flow_id in URL path")
  }

  // Parse body (empty in v1, but validate schema for forward compat)
  let body: unknown = {}
  try {
    const text = await req.text()
    if (text.trim()) {
      body = JSON.parse(text)
    }
  } catch {
    throw new AgentError("invalid_param", "Invalid JSON body")
  }
  publishFlowBodySchema.parse(body) // strip unknown fields

  // Load project
  const project = await getProject(ctx, flowId)

  // Find the highest version number
  const versions = await listVersions(ctx, flowId)
  if (versions.length === 0) {
    throw new AgentError("flow_not_found", `Flow ${flowId} has no versions`)
  }

  // versions come sorted by version_number DESC from the API
  const latestVersion = versions[0]

  // Idempotent: if the latest version is already published, return success
  if (latestVersion.isPublished) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
    const phoneDigits = ctx.account.phone_number?.replace(/\D/g, "")
    const firstKeyword = (project.triggerKeywords ?? [])[0]
    const testUrl =
      phoneDigits && firstKeyword
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(firstKeyword)}`
        : undefined

    return Response.json(
      {
        flow_id: project.id,
        version: latestVersion.versionNumber,
        published: true,
        already_published: true,
        published_at: latestVersion.publishedAt,
        test_url: testUrl,
        trigger_keyword: firstKeyword,
        magic_flow_url: `${appUrl}/flow/${project.id}`,
      },
      { status: 200 },
    )
  }

  // Publish the version in magic-flow's DB
  await publishVersion(ctx, flowId, latestVersion.id)

  // Flatten + convert to runtime format
  const flat = flattenFlow(latestVersion.nodes, latestVersion.edges)
  const converted = convertToFsWhatsApp(
    flat.nodes,
    flat.edges,
    project.name,
    undefined, // description
    [], // triggerIds — read from project
    project.triggerKeywords,
    project.triggerMatchType,
    undefined, // triggerRef
    project.flowSlug,
    project.waAccountId,
  )

  // Deploy to runtime (create or update)
  await publishRuntimeFlow(ctx, {
    flowData: converted as Record<string, unknown>,
    triggerKeywords: project.triggerKeywords,
    triggerMatchType: project.triggerMatchType,
    existingRuntimeFlowId: project.publishedFlowId,
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
  const phoneDigits = ctx.account.phone_number?.replace(/\D/g, "")
  const firstKeyword = (project.triggerKeywords ?? [])[0]
  const testUrl =
    phoneDigits && firstKeyword
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(firstKeyword)}`
      : undefined

  return Response.json(
    {
      flow_id: project.id,
      version: latestVersion.versionNumber,
      published: true,
      already_published: false,
      published_at: new Date().toISOString(),
      test_url: testUrl,
      trigger_keyword: firstKeyword,
      magic_flow_url: `${appUrl}/flow/${project.id}`,
    },
    { status: 200 },
  )
}, "publish")
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add app/api/v1/agent/flows/\[flow_id\]/publish/route.ts
git commit -m "feat(agent-api): add POST /v1/agent/flows/{id}/publish endpoint"
```

---

## Task 6: Write integration tests for edit + publish

**Why:** End-to-end tests that mock only the fs-whatsapp HTTP calls and the AI generation, verifying the full SSE event sequence for edit and the JSON response for publish.

**Files:**
- Create: `app/api/v1/agent/flows/[flow_id]/__tests__/edit-publish.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { POST as editPOST } from "@/app/api/v1/agent/flows/[flow_id]/edit/route"
import { POST as publishPOST } from "@/app/api/v1/agent/flows/[flow_id]/publish/route"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

vi.mock("@/lib/ai/tools/generate-flow", () => ({
  generateFlowStreaming: vi.fn(),
}))

import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"
const mockGenerateFlow = vi.mocked(generateFlowStreaming)

// ---------------------------------------------------------------------------
// SSE helper (reused from existing tests)
// ---------------------------------------------------------------------------
async function readSSE(res: Response): Promise<Array<{ event: string; data: any }>> {
  const text = await res.text()
  const events: Array<{ event: string; data: any }> = []
  const blocks = text.split("\n\n").filter((b) => b.trim())
  for (const block of blocks) {
    if (block.startsWith(":")) continue
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
      { id: "acc_1", name: "Acme", phone_number: "+919876543210", status: "active", has_access_token: true },
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
          { id: "2", type: "whatsappQuestion", position: { x: 250, y: 150 }, data: { question: "What is your name?", storeAs: "name" } },
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

const VERSIONS_BODY = {
  status: "success",
  data: {
    versions: [
      { id: "ver_4", project_id: "proj_1", version_number: 4, name: "v4", description: "", nodes: [], edges: [], platform: "whatsapp", is_published: false, changes: [], created_at: "2026-04-16T10:00:00Z" },
      { id: "ver_3", project_id: "proj_1", version_number: 3, name: "v3", description: "", nodes: [], edges: [], platform: "whatsapp", is_published: true, published_at: "2026-04-16T09:00:00Z", changes: [], created_at: "2026-04-16T09:00:00Z" },
    ],
  },
}

const NEW_VERSION_BODY = {
  status: "success",
  data: { version: { id: "ver_4", version_number: 4 } },
}

// ---------------------------------------------------------------------------
// Edit tests
// ---------------------------------------------------------------------------
describe("POST /v1/agent/flows/{id}/edit", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
    mockGenerateFlow.mockReset()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns SSE stream with progress + result on successful edit", async () => {
    // Mock fs-whatsapp calls: 1=accounts, 2=getProject, 3=createVersion
    let callIndex = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      callIndex++
      if (callIndex === 1) return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      if (callIndex === 2) return Promise.resolve(new Response(JSON.stringify(PROJECT_BODY), { status: 200 }))
      if (callIndex === 3) return Promise.resolve(new Response(JSON.stringify(NEW_VERSION_BODY), { status: 200 }))
      return Promise.resolve(new Response("", { status: 500 }))
    })

    // Mock AI: emit result with updates
    mockGenerateFlow.mockImplementation(async (_req, emit) => {
      emit({ type: "tool_step", tool: "apply_edit", status: "done", summary: "Updated question text" })
      emit({ type: "flow_ready", updates: {}, action: "edit" as const })
      emit({
        type: "result",
        data: {
          message: "Made the question friendlier",
          action: "edit" as const,
          updates: {
            nodes: [
              { id: "2", type: "whatsappQuestion", position: { x: 250, y: 150 }, data: { question: "Hey! What's your name? 👋", storeAs: "name" } },
            ],
          },
        },
      })
    })

    const req = new Request("https://example.com/api/v1/agent/flows/proj_1/edit", {
      method: "POST",
      headers: { "x-api-key": "whm_abc", "content-type": "application/json" },
      body: JSON.stringify({ instruction: "make the name question friendlier" }),
    })

    const res = await editPOST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/event-stream")

    const events = await readSSE(res)
    const progressEvents = events.filter((e) => e.event === "progress")
    const resultEvents = events.filter((e) => e.event === "result")

    expect(progressEvents.length).toBeGreaterThanOrEqual(1)
    expect(resultEvents).toHaveLength(1)

    const result = resultEvents[0].data
    expect(result.flow_id).toBe("proj_1")
    expect(result.published).toBe(false)
    expect(result.version).toBe(4)
    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.next_action).toContain("publish")
  })

  it("returns 401 without API key", async () => {
    const req = new Request("https://example.com/api/v1/agent/flows/proj_1/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "test" }),
    })
    const res = await editPOST(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 on missing instruction", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))

    const req = new Request("https://example.com/api/v1/agent/flows/proj_1/edit", {
      method: "POST",
      headers: { "x-api-key": "whm_abc", "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await editPOST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  it("returns 404 when project not found", async () => {
    let callIndex = 0
    ;(global.fetch as any).mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      return Promise.resolve(new Response("", { status: 404 }))
    })

    const req = new Request("https://example.com/api/v1/agent/flows/missing/edit", {
      method: "POST",
      headers: { "x-api-key": "whm_abc", "content-type": "application/json" },
      body: JSON.stringify({ instruction: "edit something" }),
    })
    const res = await editPOST(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe("flow_not_found")
  })
})

// ---------------------------------------------------------------------------
// Publish tests
// ---------------------------------------------------------------------------
describe("POST /v1/agent/flows/{id}/publish", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("publishes latest unpublished version and returns result", async () => {
    // 1=accounts, 2=getProject, 3=listVersions, 4=publishVersion, 5=publishRuntimeFlow
    let callIndex = 0
    ;(global.fetch as any).mockImplementation((url: string, init?: any) => {
      callIndex++
      if (callIndex === 1) return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      if (callIndex === 2) return Promise.resolve(new Response(JSON.stringify(PROJECT_BODY), { status: 200 }))
      if (callIndex === 3) return Promise.resolve(new Response(JSON.stringify(VERSIONS_BODY), { status: 200 }))
      // publishVersion + publishRuntimeFlow return 200
      return Promise.resolve(new Response(JSON.stringify({ status: "success", data: { id: "rt_abc" } }), { status: 200 }))
    })

    const req = new Request("https://example.com/api/v1/agent/flows/proj_1/publish", {
      method: "POST",
      headers: { "x-api-key": "whm_abc", "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await publishPOST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.flow_id).toBe("proj_1")
    expect(body.published).toBe(true)
    expect(body.already_published).toBe(false)
    expect(body.test_url).toContain("wa.me")
    expect(body.trigger_keyword).toBe("hello")
  })

  it("returns already_published: true when latest is already published", async () => {
    const allPublishedVersions = {
      status: "success",
      data: {
        versions: [
          { id: "ver_3", project_id: "proj_1", version_number: 3, name: "v3", description: "", nodes: [], edges: [], platform: "whatsapp", is_published: true, published_at: "2026-04-16T09:00:00Z", changes: [], created_at: "2026-04-16T09:00:00Z" },
        ],
      },
    }

    let callIndex = 0
    ;(global.fetch as any).mockImplementation(() => {
      callIndex++
      if (callIndex === 1) return Promise.resolve(new Response(JSON.stringify(ACCOUNTS_BODY), { status: 200 }))
      if (callIndex === 2) return Promise.resolve(new Response(JSON.stringify(PROJECT_BODY), { status: 200 }))
      if (callIndex === 3) return Promise.resolve(new Response(JSON.stringify(allPublishedVersions), { status: 200 }))
      return Promise.resolve(new Response("", { status: 500 }))
    })

    const req = new Request("https://example.com/api/v1/agent/flows/proj_1/publish", {
      method: "POST",
      headers: { "x-api-key": "whm_abc", "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await publishPOST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.already_published).toBe(true)
    // Should NOT have called publishVersion or publishRuntimeFlow (callIndex stays at 3)
    expect(callIndex).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run app/api/v1/agent/flows/\\[flow_id\\]/__tests__/edit-publish.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS. Fix any issues.

- [ ] **Step 3: Run the full test suite**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add app/api/v1/agent/flows/\[flow_id\]/__tests__/edit-publish.test.ts
git commit -m "test(agent-api): integration tests for edit and publish endpoints"
```

---

## Task 7: Update integration docs

**Why:** Every phase must update `docs/agent-api/` in the same PR. The docs need edit + publish endpoint references, quickstart examples, and updated system prompt.

**Files:**
- Modify: `docs/agent-api/reference.md`
- Modify: `docs/agent-api/quickstart.md`
- Modify: `docs/agent-api/system-prompt.md`
- Modify: `docs/agent-api/README.md`

- [ ] **Step 1: Update reference.md — add edit + publish endpoint docs**

Add before the "Error response shape" section (before line 120):

```markdown
## POST /api/v1/agent/flows/{flow_id}/edit

Edit an existing flow with a natural language instruction. Returns SSE stream. Does NOT publish — the edit creates a new unpublished version.

**Request body:**
```json
{
  "instruction": "make the name question friendlier and add an emoji"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `instruction` | string | yes | What to change (1-4000 chars) |

**Pre-stream errors:**

| HTTP | Code | When |
|---|---|---|
| 400 | `invalid_param` | Missing or invalid instruction |
| 401 | `unauthorized` | Missing or bad API key |
| 404 | `flow_not_found` | Flow doesn't exist or has no published version |
| 429 | `rate_limited` | Too many calls |

**Success response — SSE stream (`text/event-stream`):**

```
event: progress
data: {"phase":"understanding","message":"Analyzing your edit request"}

event: progress
data: {"phase":"editing","message":"Updated question text"}

event: progress
data: {"phase":"validating","message":"Edit validated"}

event: progress
data: {"phase":"saving","message":"Saving new version"}

event: result
data: {
  "flow_id": "uuid",
  "version": 4,
  "published": false,
  "name": "Product Inquiry",
  "summary": "Made the name question friendlier with an emoji",
  "changes": [
    {"type": "node_update", "node_id": "plan-question-2-x7f3", "description": "Updated whatsappQuestion: What's your name?"}
  ],
  "node_count": 4,
  "magic_flow_url": "https://your-app/flow/uuid",
  "next_action": "Call POST /v1/agent/flows/uuid/publish to make this version live",
  "updated_at": "2026-04-16T10:00:00Z"
}
```

**Key difference from create:** `published: false` — you must call the publish endpoint separately.

**Rate limit:** 10/min per key.

---

## POST /api/v1/agent/flows/{flow_id}/publish

Publish the latest version of a flow to make it live. Returns JSON (not SSE).

**Request body:** `{}` (empty)

**Response (200):**
```json
{
  "flow_id": "uuid",
  "version": 4,
  "published": true,
  "already_published": false,
  "published_at": "2026-04-16T10:01:00Z",
  "test_url": "https://wa.me/1234567890?text=product",
  "trigger_keyword": "product",
  "magic_flow_url": "https://your-app/flow/uuid"
}
```

If the latest version is already published, returns 200 with `"already_published": true` (not an error). Safe to retry.

**Errors:**

| HTTP | Code | When |
|---|---|---|
| 401 | `unauthorized` | Missing or bad API key |
| 404 | `flow_not_found` | Flow doesn't exist or has no versions |
| 502 | `publish_failed` | Runtime deploy failed (retryable) |

**Rate limit:** 30/min per key.

---
```

- [ ] **Step 2: Update quickstart.md — add edit + publish sections**

Add after the "3. List your flows" section:

```markdown
## 4. Edit a flow

```bash
curl -N -X POST https://your-freestand-url/api/v1/agent/flows/FLOW_ID/edit \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "instruction": "make the name question friendlier and add an emoji"
  }'
```

The response is an SSE stream (same format as create). The final `result` event will have `"published": false` — you need to publish separately.

## 5. Publish the edit

```bash
curl -X POST https://your-freestand-url/api/v1/agent/flows/FLOW_ID/publish \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Returns JSON with `test_url` — click it to try the updated flow.
```

Also update the Vercel AI SDK tool definitions section (add to `freestandTools`):

```typescript
  freestand_edit_flow: tool({
    description: "Edit an existing flow. Does NOT publish — call freestand_publish_flow after.",
    parameters: z.object({
      flow_id: z.string().describe("ID of the flow to edit"),
      instruction: z.string().describe("Natural language description of the changes"),
    }),
    execute: ({ flow_id, instruction }) =>
      callFreestandSSE(`/api/v1/agent/flows/${flow_id}/edit`, { instruction }),
  }),

  freestand_publish_flow: tool({
    description: "Publish the latest version of a flow to make it live. Call after editing.",
    parameters: z.object({
      flow_id: z.string().describe("ID of the flow to publish"),
    }),
    execute: async ({ flow_id }) => {
      const res = await fetch(`${FREESTAND_URL}/api/v1/agent/flows/${flow_id}/publish`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
        body: "{}",
      })
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
      return res.json()
    },
  }),
```

And update the Python example to add `edit_flow` and `publish_flow` functions.

- [ ] **Step 3: Update system-prompt.md — add edit + publish tool guidance**

Replace the system prompt content with:

```markdown
# System Prompt Fragment

Paste this into your AI agent's system prompt so the LLM knows how to use the Freestand tools correctly.

\```
## Freestand Flow Tools

You have tools for building and managing Freestand chatbot flows: freestand_find_flow, freestand_create_flow, freestand_edit_flow, freestand_publish_flow.

Freestand currently supports WhatsApp only. The channel is always "whatsapp".

### Building a new flow
When the user asks to build a new flow:
1. You need three things before calling freestand_create_flow: (a) a short name for the flow, (b) what the flow should do (the instruction), (c) a trigger keyword. Collect any that are missing.
2. Call freestand_create_flow. It publishes automatically. Tell the user the flow is live, share the test_url so they can try it.
3. Remember the flow_id from the response — you'll need it for edits.

### Editing an existing flow
When the user asks to change an existing flow:
1. If you don't have the flow_id, call freestand_find_flow first.
2. Call freestand_edit_flow with the flow_id and a clear instruction describing the changes.
3. Show the user the changes summary from the response. Ask if they want to publish.
4. If yes, call freestand_publish_flow. Share the test_url.

### Finding existing flows
When the user asks about their existing flows, call freestand_find_flow to get the list.

### Publishing
- freestand_create_flow auto-publishes. No separate publish needed.
- freestand_edit_flow does NOT publish. Always ask the user before publishing an edit.
- freestand_publish_flow is safe to retry — it returns already_published: true if nothing changed.

### Handling errors
- keyword_conflict: the trigger keyword is already used. Suggest a different keyword, or offer to edit the existing flow.
- channel_not_connected: tell the user which channels are connected and ask them to pick one.
- invalid_instruction: the description wasn't clear enough. Ask for more detail.
- flow_not_found: the flow doesn't exist. Use freestand_find_flow to check.

### What NOT to do
- Don't invent flow_ids. Always get them from a tool result.
- Don't batch multiple flow operations in one tool call. One operation at a time.
- Don't auto-publish edits without asking the user first.
- The channel is always "whatsapp" in the current version — don't ask the user.
\```

This fragment is ~350 tokens. Update it when new endpoints ship.
```

- [ ] **Step 4: Update README.md — add edit + publish to endpoint table**

Add the two new endpoints to the table in README.md.

- [ ] **Step 5: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3
git add docs/agent-api/
git commit -m "docs(agent-api): add edit and publish endpoint documentation"
```

---

## Task 8: TypeScript check + full test run + final verification

**Why:** Final sanity check before the PR.

- [ ] **Step 1: Run TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: All tests PASS.

- [ ] **Step 3: Verify file structure matches expectations**

Run: `find /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3/app/api/v1/agent -type f -name "*.ts" | sort`

Expected output:
```
.../flows/__tests__/route.test.ts
.../flows/[flow_id]/__tests__/edit-publish.test.ts
.../flows/[flow_id]/edit/route.ts
.../flows/[flow_id]/publish/route.ts
.../flows/route.ts
```

- [ ] **Step 4: Review the diff**

Run: `cd /Users/pratikgupta/Freestand/magic-flow/.worktrees/agent-api-phase-3 && git diff --stat main`

Verify:
- New files: `flow-loader.ts`, `edit/route.ts`, `publish/route.ts`, `edit-publish.test.ts`, `flow-loader.test.ts`
- Modified files: `publisher.ts`, `publisher.test.ts`, `list-approved-templates.ts`, `reference.md`, `quickstart.md`, `system-prompt.md`, `README.md`
- NO changes to: `generate-flow.ts`, `generate-flow-edit.ts`, `generate-flow-create.ts` (shared files are NOT modified)
