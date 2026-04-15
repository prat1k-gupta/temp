import { describe, it, expect } from "vitest"
import type { Node, Edge } from "@xyflow/react"
import { migrateApiFetchEdges, migrateSuperNodesToTemplates } from "../use-flow-persistence"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(id: string, type: string, data: Record<string, any> = {}): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { platform: "whatsapp", label: type, ...data },
  }
}

function edge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    ...(sourceHandle !== undefined ? { sourceHandle } : {}),
  }
}

// ---------------------------------------------------------------------------
// migrateApiFetchEdges
// ---------------------------------------------------------------------------

describe("migrateApiFetchEdges", () => {
  it("returns migrated: false when there are no apiFetch nodes", () => {
    const nodes = [node("1", "start"), node("2", "message")]
    const edges = [edge("1", "2")]

    const result = migrateApiFetchEdges(nodes, edges)

    expect(result.migrated).toBe(false)
    expect(result.edges).toBe(edges) // same reference — no new array created
  })

  it("migrates edges from apiFetch with empty sourceHandle to 'success'", () => {
    const nodes = [node("1", "start"), node("2", "apiFetch")]
    const edges = [edge("1", "2"), edge("2", "3", "")]

    const result = migrateApiFetchEdges(nodes, edges)

    expect(result.migrated).toBe(true)
    expect(result.edges[1].sourceHandle).toBe("success")
  })

  it("migrates edges from apiFetch with no sourceHandle to 'success'", () => {
    const nodes = [node("1", "apiFetch")]
    const edges = [{ id: "e1", source: "1", target: "2" } as Edge]

    const result = migrateApiFetchEdges(nodes, edges)

    expect(result.migrated).toBe(true)
    expect(result.edges[0].sourceHandle).toBe("success")
  })

  it("does not migrate edges that already have a named sourceHandle", () => {
    const nodes = [node("1", "apiFetch")]
    const edges = [edge("1", "2", "error")]

    const result = migrateApiFetchEdges(nodes, edges)

    expect(result.migrated).toBe(false)
    expect(result.edges[0].sourceHandle).toBe("error")
  })

  it("does not migrate edges from non-apiFetch nodes", () => {
    const nodes = [node("1", "message"), node("2", "start")]
    const edges = [edge("1", "2", "")]

    const result = migrateApiFetchEdges(nodes, edges)

    expect(result.migrated).toBe(false)
  })

  it("migrates multiple apiFetch edges in one pass", () => {
    const nodes = [node("1", "apiFetch"), node("3", "apiFetch")]
    const edges = [edge("1", "2", ""), edge("3", "4")]

    const result = migrateApiFetchEdges(nodes, edges)

    expect(result.migrated).toBe(true)
    expect(result.edges[0].sourceHandle).toBe("success")
    expect(result.edges[1].sourceHandle).toBe("success")
  })
})

// ---------------------------------------------------------------------------
// migrateSuperNodesToTemplates
// ---------------------------------------------------------------------------

describe("migrateSuperNodesToTemplates", () => {
  it("returns migrated: false when there are no super nodes", () => {
    const nodes = [node("1", "start"), node("2", "message")]

    const result = migrateSuperNodesToTemplates(nodes)

    expect(result.migrated).toBe(false)
    expect(result.nodes).toEqual(nodes)
  })

  it("migrates 'name' super node to flowTemplate type", () => {
    const nodes = [node("1", "name", { question: "What's your name?", storeAs: "user_name" })]

    const result = migrateSuperNodesToTemplates(nodes)

    expect(result.migrated).toBe(true)
    expect(result.nodes[0].type).toBe("flowTemplate")
    expect((result.nodes[0].data as any).templateName).toBeTruthy()
  })

  it("migrates 'email' super node to flowTemplate type", () => {
    const nodes = [node("1", "email", { question: "Your email?", storeAs: "user_email" })]

    const result = migrateSuperNodesToTemplates(nodes)

    expect(result.migrated).toBe(true)
    expect(result.nodes[0].type).toBe("flowTemplate")
  })

  it("migrates 'dob' super node to flowTemplate type", () => {
    const nodes = [node("1", "dob")]

    const result = migrateSuperNodesToTemplates(nodes)

    expect(result.migrated).toBe(true)
    expect(result.nodes[0].type).toBe("flowTemplate")
  })

  it("migrates 'address' super node to flowTemplate type", () => {
    const nodes = [node("1", "address")]

    const result = migrateSuperNodesToTemplates(nodes)

    expect(result.migrated).toBe(true)
    expect(result.nodes[0].type).toBe("flowTemplate")
  })

  it("preserves non-super nodes unchanged", () => {
    const startNode = node("1", "start")
    const messageNode = node("2", "message", { text: "Hello" })
    const superNode = node("3", "name")

    const result = migrateSuperNodesToTemplates([startNode, messageNode, superNode])

    expect(result.nodes[0]).toBe(startNode) // same reference
    expect(result.nodes[1]).toBe(messageNode) // same reference
    expect(result.nodes[2].type).toBe("flowTemplate") // migrated
  })

  it("preserves node id and position after migration", () => {
    const original = {
      id: "node-42",
      type: "name" as const,
      position: { x: 150, y: 300 },
      data: { platform: "whatsapp", label: "Name", question: "Name?" },
    }

    const result = migrateSuperNodesToTemplates([original as Node])

    expect(result.nodes[0].id).toBe("node-42")
    expect(result.nodes[0].position).toEqual({ x: 150, y: 300 })
  })

  it("sets internalNodes array on migrated template", () => {
    const nodes = [node("1", "name", { question: "Name?", storeAs: "name" })]

    const result = migrateSuperNodesToTemplates(nodes)

    const data = result.nodes[0].data as any
    expect(Array.isArray(data.internalNodes)).toBe(true)
    expect(data.internalNodes.length).toBeGreaterThan(0)
    expect(data.nodeCount).toBe(data.internalNodes.length)
  })

  it("does not migrate unknown node types", () => {
    const nodes = [node("1", "customNode"), node("2", "whatsappQuestion")]

    const result = migrateSuperNodesToTemplates(nodes)

    expect(result.migrated).toBe(false)
  })
})

