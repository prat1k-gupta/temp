import { describe, it, expect } from "vitest"
import { mapProjectToMetadata, mapProjectToFlowData } from "../flow-storage"

describe("mapProjectToMetadata", () => {
  it("maps snake_case backend response to camelCase FlowMetadata", () => {
    const project = {
      id: "proj-1",
      name: "My Flow",
      description: "A test flow",
      platform: "whatsapp",
      type: "flow",
      has_draft: true,
      has_published: false,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-30T10:00:00Z",
      node_count: 5,
      edge_count: 4,
    }

    const result = mapProjectToMetadata(project)

    expect(result.id).toBe("proj-1")
    expect(result.name).toBe("My Flow")
    expect(result.description).toBe("A test flow")
    expect(result.platform).toBe("whatsapp")
    expect(result.type).toBe("flow")
    expect(result.hasDraft).toBe(true)
    expect(result.hasPublished).toBe(false)
    expect(result.createdAt).toBe("2026-03-01T00:00:00Z")
    expect(result.updatedAt).toBe("2026-03-30T10:00:00Z")
    expect(result.nodeCount).toBe(5)
    expect(result.edgeCount).toBe(4)
  })

  it("defaults type to 'flow' when missing", () => {
    const result = mapProjectToMetadata({ id: "1", name: "x", platform: "web" })
    expect(result.type).toBe("flow")
  })

  it("defaults has_draft to false when missing", () => {
    const result = mapProjectToMetadata({ id: "1", name: "x", platform: "web" })
    expect(result.hasDraft).toBe(false)
  })

  it("derives hasPublished from published_flow_id when has_published is missing", () => {
    const result = mapProjectToMetadata({
      id: "1",
      name: "x",
      platform: "web",
      published_flow_id: "flow-abc",
    })
    expect(result.hasPublished).toBe(true)
  })

  it("defaults node_count and edge_count to 0 when missing", () => {
    const result = mapProjectToMetadata({ id: "1", name: "x", platform: "web" })
    expect(result.nodeCount).toBe(0)
    expect(result.edgeCount).toBe(0)
  })

  it("accepts camelCase fallbacks for dates", () => {
    const result = mapProjectToMetadata({
      id: "1",
      name: "x",
      platform: "web",
      createdAt: "2026-01-01",
      updatedAt: "2026-02-01",
    })
    expect(result.createdAt).toBe("2026-01-01")
    expect(result.updatedAt).toBe("2026-02-01")
  })

  it("maps ai_metadata from snake_case", () => {
    const result = mapProjectToMetadata({
      id: "1",
      name: "x",
      platform: "web",
      ai_metadata: { description: "test", whenToUse: "always" },
    })
    expect(result.aiMetadata).toEqual({ description: "test", whenToUse: "always" })
  })

  it("maps aiMetadata from camelCase fallback", () => {
    const result = mapProjectToMetadata({
      id: "1",
      name: "x",
      platform: "web",
      aiMetadata: { description: "test" },
    })
    expect(result.aiMetadata).toEqual({ description: "test" })
  })
})

describe("mapProjectToFlowData", () => {
  it("maps full backend project to FlowData", () => {
    const project = {
      id: "proj-1",
      name: "My Flow",
      description: "Desc",
      platform: "whatsapp",
      type: "flow",
      trigger_id: "t1",
      trigger_ids: ["t1", "t2"],
      trigger_keywords: ["hello", "hi"],
      trigger_match_type: "exact",
      trigger_ref: "my-ref",
      published_flow_id: "pf-1",
      flow_slug: "my-flow",
      wa_account_id: "wa-1",
      wa_phone_number: "+1234567890",
      latest_version: {
        nodes: [{ id: "1", type: "start" }],
        edges: [{ id: "e1", source: "1", target: "2" }],
      },
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-30T10:00:00Z",
    }

    const result = mapProjectToFlowData(project)

    expect(result.id).toBe("proj-1")
    expect(result.name).toBe("My Flow")
    expect(result.platform).toBe("whatsapp")
    expect(result.triggerId).toBe("t1")
    expect(result.triggerIds).toEqual(["t1", "t2"])
    expect(result.triggerKeywords).toEqual(["hello", "hi"])
    expect(result.triggerMatchType).toBe("exact")
    expect(result.triggerRef).toBe("my-ref")
    expect(result.publishedFlowId).toBe("pf-1")
    expect(result.flowSlug).toBe("my-flow")
    expect(result.waAccountId).toBe("wa-1")
    expect(result.waPhoneNumber).toBe("+1234567890")
    expect(result.nodes).toEqual([{ id: "1", type: "start" }])
    expect(result.edges).toEqual([{ id: "e1", source: "1", target: "2" }])
  })

  it("prefers draft over latest_version for nodes/edges", () => {
    const project = {
      id: "proj-1",
      name: "x",
      platform: "web",
      draft: {
        nodes: [{ id: "draft-1", type: "message" }],
        edges: [],
      },
      latest_version: {
        nodes: [{ id: "pub-1", type: "start" }],
        edges: [{ id: "e1", source: "1", target: "2" }],
      },
    }

    const result = mapProjectToFlowData(project)

    expect(result.nodes).toEqual([{ id: "draft-1", type: "message" }])
    expect(result.edges).toEqual([])
  })

  it("falls back to latest_version when no draft", () => {
    const project = {
      id: "proj-1",
      name: "x",
      platform: "web",
      latest_version: {
        nodes: [{ id: "pub-1", type: "start" }],
        edges: [{ id: "e1" }],
      },
    }

    const result = mapProjectToFlowData(project)

    expect(result.nodes).toEqual([{ id: "pub-1", type: "start" }])
    expect(result.edges).toEqual([{ id: "e1" }])
  })

  it("falls back to top-level nodes/edges when no draft or version", () => {
    const project = {
      id: "proj-1",
      name: "x",
      platform: "web",
      nodes: [{ id: "top-1" }],
      edges: [{ id: "top-e1" }],
    }

    const result = mapProjectToFlowData(project)

    expect(result.nodes).toEqual([{ id: "top-1" }])
    expect(result.edges).toEqual([{ id: "top-e1" }])
  })

  it("defaults to empty arrays when no nodes/edges anywhere", () => {
    const result = mapProjectToFlowData({
      id: "proj-1",
      name: "x",
      platform: "web",
    })

    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it("defaults trigger arrays to empty when missing", () => {
    const result = mapProjectToFlowData({
      id: "proj-1",
      name: "x",
      platform: "web",
    })

    expect(result.triggerIds).toEqual([])
    expect(result.triggerKeywords).toEqual([])
  })

  it("accepts camelCase fallbacks for all fields", () => {
    const project = {
      id: "proj-1",
      name: "x",
      platform: "web",
      triggerId: "t1",
      triggerIds: ["t1"],
      triggerKeywords: ["hi"],
      triggerMatchType: "contains",
      triggerRef: "ref",
      publishedFlowId: "pf-1",
      flowSlug: "slug",
      waAccountId: "wa",
      waPhoneNumber: "+1",
      createdAt: "2026-01-01",
      updatedAt: "2026-02-01",
    }

    const result = mapProjectToFlowData(project)

    expect(result.triggerId).toBe("t1")
    expect(result.triggerIds).toEqual(["t1"])
    expect(result.publishedFlowId).toBe("pf-1")
    expect(result.flowSlug).toBe("slug")
    expect(result.createdAt).toBe("2026-01-01")
  })

  it("maps ai_metadata from snake_case", () => {
    const result = mapProjectToFlowData({
      id: "proj-1",
      name: "x",
      platform: "web",
      ai_metadata: { description: "template desc", whenToUse: "collecting name" },
    })
    expect(result.aiMetadata).toEqual({ description: "template desc", whenToUse: "collecting name" })
  })

  it("maps aiMetadata from camelCase fallback", () => {
    const result = mapProjectToFlowData({
      id: "proj-1",
      name: "x",
      platform: "web",
      aiMetadata: { description: "fallback" },
    })
    expect(result.aiMetadata).toEqual({ description: "fallback" })
  })
})
