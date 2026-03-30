import { describe, it, expect } from "vitest"
import { mapVersion, type VersionResponse } from "../use-versions"

function makeVersionResponse(overrides: Partial<VersionResponse> = {}): VersionResponse {
  return {
    id: "v-1",
    project_id: "proj-1",
    version_number: 3,
    name: "v3 - My Version",
    description: "A test version",
    nodes: [{ id: "1", type: "start", position: { x: 0, y: 0 }, data: {} }],
    edges: [{ id: "e1", source: "1", target: "2" }],
    platform: "whatsapp",
    is_published: true,
    published_at: "2026-03-30T10:00:00Z",
    changes: [{ id: "c1", type: "node_add", timestamp: "2026-03-30T10:00:00Z", data: {}, description: "Added node" }],
    created_at: "2026-03-30T09:00:00Z",
    ...overrides,
  }
}

describe("mapVersion", () => {
  it("maps snake_case backend fields to camelCase frontend fields", () => {
    const response = makeVersionResponse()
    const result = mapVersion(response)

    expect(result.id).toBe("v-1")
    expect(result.version).toBe(3) // version_number -> version
    expect(result.name).toBe("v3 - My Version")
    expect(result.description).toBe("A test version")
    expect(result.platform).toBe("whatsapp")
    expect(result.isPublished).toBe(true) // is_published -> isPublished
    expect(result.publishedAt).toBe("2026-03-30T10:00:00Z") // published_at -> publishedAt
    expect(result.createdAt).toBe("2026-03-30T09:00:00Z") // created_at -> createdAt
  })

  it("preserves nodes and edges arrays", () => {
    const nodes = [
      { id: "1", type: "start", position: { x: 0, y: 0 }, data: { label: "Start" } },
      { id: "2", type: "message", position: { x: 100, y: 100 }, data: { text: "Hello" } },
    ]
    const edges = [{ id: "e1", source: "1", target: "2" }]
    const result = mapVersion(makeVersionResponse({ nodes, edges }))

    expect(result.nodes).toEqual(nodes)
    expect(result.edges).toEqual(edges)
  })

  it("defaults null/undefined nodes and edges to empty arrays", () => {
    const result = mapVersion(makeVersionResponse({ nodes: null as any, edges: undefined as any }))

    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it("defaults null/undefined changes to empty array", () => {
    const result = mapVersion(makeVersionResponse({ changes: null as any }))

    expect(result.changes).toEqual([])
  })

  it("handles unpublished version (no published_at)", () => {
    const result = mapVersion(makeVersionResponse({
      is_published: false,
      published_at: undefined,
    }))

    expect(result.isPublished).toBe(false)
    expect(result.publishedAt).toBeUndefined()
  })

  it("maps version_number 1 correctly", () => {
    const result = mapVersion(makeVersionResponse({ version_number: 1 }))
    expect(result.version).toBe(1)
  })

  it("preserves all change entries", () => {
    const changes = [
      { id: "c1", type: "node_add", timestamp: "t1", data: { nodeId: "1" }, description: "Added start" },
      { id: "c2", type: "edge_add", timestamp: "t2", data: { edgeId: "e1" }, description: "Connected nodes" },
      { id: "c3", type: "node_update", timestamp: "t3", data: { nodeId: "1" }, description: "Updated text" },
    ]
    const result = mapVersion(makeVersionResponse({ changes }))
    expect(result.changes).toHaveLength(3)
    expect(result.changes).toEqual(changes)
  })
})
