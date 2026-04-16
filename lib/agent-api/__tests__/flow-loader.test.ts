import { describe, it, expect, vi, beforeEach } from "vitest"
import { loadFlowForEdit } from "@/lib/agent-api/flow-loader"
import type { AgentContext } from "@/lib/agent-api/types"
import type { ProjectInfo, VersionInfo } from "@/lib/agent-api/publisher"

vi.mock("@/lib/agent-api/publisher", () => ({
  getProject: vi.fn(),
  getLatestVersion: vi.fn(),
}))

import { getProject, getLatestVersion } from "@/lib/agent-api/publisher"

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

  it("uses the highest version (published or not) for editing", async () => {
    const unpublishedV3 = makeVersion({ id: "ver_3", versionNumber: 3, isPublished: false, publishedAt: undefined })
    const publishedV2 = makeVersion({ id: "ver_2", versionNumber: 2, isPublished: true })
    ;(getProject as any).mockResolvedValue(makeProject())
    ;(getLatestVersion as any).mockResolvedValue(unpublishedV3)

    const result = await loadFlowForEdit(mockCtx(), "proj_1")

    // Should use v3 (unpublished, highest), not v2 (published)
    expect(result.version).toBe(unpublishedV3)
    expect(result.existingFlow.nodes).toEqual(unpublishedV3.nodes)
  })

  it("returns toolContext with project metadata", async () => {
    ;(getProject as any).mockResolvedValue(makeProject())
    ;(getLatestVersion as any).mockResolvedValue(makeVersion())

    const result = await loadFlowForEdit(mockCtx(), "proj_1")

    expect(result.toolContext.authHeader).toBe("whm_test123")
    expect(result.toolContext.projectId).toBe("proj_1")
    expect(result.toolContext.projectName).toBe("iPhone 11 Flow")
    expect(result.toolContext.triggerKeywords).toEqual(["iphone11"])
    expect(result.toolContext.publishedFlowId).toBe("rtf_99")
  })

  it("throws flow_not_found when project has no versions", async () => {
    ;(getProject as any).mockResolvedValue(makeProject({ latestVersion: undefined }))
    ;(getLatestVersion as any).mockResolvedValue(null)

    await expect(loadFlowForEdit(mockCtx(), "proj_1")).rejects.toMatchObject({
      code: "flow_not_found",
      message: expect.stringContaining("no versions"),
    })
  })

  it("propagates flow_not_found when getProject throws", async () => {
    const { AgentError } = await import("@/lib/agent-api/errors")
    ;(getProject as any).mockRejectedValue(new AgentError("flow_not_found", "Project proj_99 not found"))
    ;(getLatestVersion as any).mockResolvedValue(null)

    await expect(loadFlowForEdit(mockCtx(), "proj_99")).rejects.toMatchObject({
      code: "flow_not_found",
    })
  })
})
