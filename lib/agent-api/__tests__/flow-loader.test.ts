import { describe, it, expect, vi, beforeEach } from "vitest"
import { loadFlowForEdit } from "@/lib/agent-api/flow-loader"
import type { AgentContext } from "@/lib/agent-api/types"
import type { ProjectInfo, VersionInfo } from "@/lib/agent-api/publisher"

vi.mock("@/lib/agent-api/publisher", () => ({
  getProject: vi.fn(),
}))

import { getProject } from "@/lib/agent-api/publisher"

function mockCtx(): AgentContext {
  return {
    apiKey: "whm_test123",
    account: {
      id: "acc_1",
      name: "Acme",
      phone_number: "+919876543210",
      connected_channels: ["whatsapp"],
    },
  }
}

function makeVersion(overrides: Partial<VersionInfo> = {}): VersionInfo {
  return {
    id: "ver_2",
    versionNumber: 2,
    nodes: [{ id: "n1", type: "message", position: { x: 0, y: 0 }, data: {} }],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    platform: "whatsapp",
    isPublished: true,
    publishedAt: "2026-04-15T12:00:00Z",
    changes: [],
    ...overrides,
  }
}

function makeProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    id: "proj_1",
    name: "iPhone 11 Flow",
    platform: "whatsapp",
    publishedFlowId: "rtf_99",
    flowSlug: "iphone11",
    triggerKeywords: ["iphone11"],
    triggerMatchType: "exact",
    waAccountId: "waid_1",
    waPhoneNumber: "+919876543210",
    latestVersion: makeVersion(),
    ...overrides,
  }
}

describe("loadFlowForEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns existingFlow nodes/edges and toolContext from the published version", async () => {
    const project = makeProject()
    ;(getProject as any).mockResolvedValue(project)

    const result = await loadFlowForEdit(mockCtx(), "proj_1")

    expect(getProject).toHaveBeenCalledWith(mockCtx(), "proj_1")

    expect(result.project).toBe(project)
    expect(result.version).toBe(project.latestVersion)
    expect(result.existingFlow.nodes).toEqual(project.latestVersion!.nodes)
    expect(result.existingFlow.edges).toEqual(project.latestVersion!.edges)
    expect(result.toolContext.authHeader).toBe("whm_test123")
    expect(result.toolContext.projectId).toBe("proj_1")
    expect(result.toolContext.projectName).toBe("iPhone 11 Flow")
    expect(result.toolContext.triggerKeywords).toEqual(["iphone11"])
    expect(result.toolContext.publishedFlowId).toBe("rtf_99")
  })

  it("toolContext.authHeader is the raw whm_* key from ctx.apiKey", async () => {
    const ctx = mockCtx()
    ;(getProject as any).mockResolvedValue(makeProject())

    const result = await loadFlowForEdit(ctx, "proj_1")

    expect(result.toolContext.authHeader).toBe(ctx.apiKey)
    expect(result.toolContext.authHeader).toMatch(/^whm_/)
  })

  it("throws flow_not_found when project has no latestVersion", async () => {
    ;(getProject as any).mockResolvedValue(makeProject({ latestVersion: undefined }))

    await expect(loadFlowForEdit(mockCtx(), "proj_1")).rejects.toMatchObject({
      code: "flow_not_found",
      message: expect.stringContaining("proj_1"),
    })
  })

  it("propagates flow_not_found when getProject throws for a missing project", async () => {
    const { AgentError } = await import("@/lib/agent-api/errors")
    ;(getProject as any).mockRejectedValue(new AgentError("flow_not_found", "Project proj_99 not found"))

    await expect(loadFlowForEdit(mockCtx(), "proj_99")).rejects.toMatchObject({
      code: "flow_not_found",
    })
  })
})
