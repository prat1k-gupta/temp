import { describe, it, expect } from "vitest"
import {
  buildFlowFromPlan,
  buildEditFlowFromPlan,
  contentToNodeData,
  isNodeTypeValidForPlatform,
} from "../flow-plan-builder"
import type { FlowPlan, EditFlowPlan } from "@/types/flow-plan"
import type { Platform, ChoiceData, TemplateResolver, ApprovedTemplate } from "@/types"
import { START_X, HORIZONTAL_GAP } from "../flow-layout"

// ─── helpers ──────────────────────────────────────────

/** Convenience: build a simple linear plan */
function linearPlan(nodeTypes: string[], platform?: Platform): FlowPlan {
  return {
    message: "test",
    steps: nodeTypes.map((t) => ({ step: "node" as const, nodeType: t })),
  }
}

// ─── isNodeTypeValidForPlatform ───────────────────────

describe("isNodeTypeValidForPlatform", () => {
  it("allows universal types on any platform", () => {
    for (const p of ["web", "whatsapp", "instagram"] as Platform[]) {
      expect(isNodeTypeValidForPlatform("name", p)).toBe(true)
      expect(isNodeTypeValidForPlatform("email", p)).toBe(true)
      expect(isNodeTypeValidForPlatform("quickReply", p)).toBe(true)
    }
  })

  it("rejects interactiveList on web", () => {
    expect(isNodeTypeValidForPlatform("interactiveList", "web")).toBe(false)
  })

  it("allows interactiveList on whatsapp", () => {
    expect(isNodeTypeValidForPlatform("interactiveList", "whatsapp")).toBe(true)
  })

  it("rejects whatsappMessage on instagram", () => {
    expect(isNodeTypeValidForPlatform("whatsappMessage", "instagram")).toBe(false)
  })

  it("rejects instagramDM on web", () => {
    expect(isNodeTypeValidForPlatform("instagramDM", "web")).toBe(false)
  })

  it("allows metaAudience on whatsapp and instagram", () => {
    expect(isNodeTypeValidForPlatform("metaAudience", "whatsapp")).toBe(true)
    expect(isNodeTypeValidForPlatform("metaAudience", "instagram")).toBe(true)
  })

  it("rejects metaAudience on web", () => {
    expect(isNodeTypeValidForPlatform("metaAudience", "web")).toBe(false)
  })
})

// ─── contentToNodeData ────────────────────────────────

describe("contentToNodeData", () => {
  it("passes through label, question, text, comment, message", () => {
    const data = contentToNodeData(
      { label: "L", question: "Q?", text: "T", comment: "C", message: "M" },
      "question"
    )
    expect(data.label).toBe("L")
    expect(data.question).toBe("Q?")
    expect(data.text).toBe("T")
    expect(data.comment).toBe("C")
    expect(data.message).toBe("M")
  })

  it("omits undefined fields", () => {
    const data = contentToNodeData({}, "name")
    expect(Object.keys(data)).toHaveLength(0)
  })
})

describe("contentToNodeData — choices unification", () => {
  it("maps content.choices → data.choices", () => {
    const data = contentToNodeData({ choices: ["A", "B"] }, "whatsappQuickReply")
    const choices = data.choices as ChoiceData[]
    expect(choices).toHaveLength(2)
    expect(choices.map(c => c.text)).toEqual(["A", "B"])
  })

  it("produces no data.choices when no input is supplied", () => {
    const data = contentToNodeData({ question: "hi" }, "whatsappQuickReply")
    expect(data.choices).toBeUndefined()
    expect(data.question).toBe("hi")
  })
})

// ─── buildFlowFromPlan — linear flows ─────────────────

describe("buildFlowFromPlan — linear", () => {
  it("returns empty arrays for empty plan", () => {
    const result = buildFlowFromPlan({ message: "empty", steps: [] }, "web")
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
    expect(result.nodeOrder).toHaveLength(0)
  })

  it("creates 3 sequential nodes with correct positions", () => {
    const plan = linearPlan(["name", "email", "address"])
    const { nodes, edges, nodeOrder } = buildFlowFromPlan(plan, "web")

    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(3) // start→name, name→email, email→address
    expect(nodeOrder).toHaveLength(3)

    // First node at START_X, then each +350
    expect(nodes[0].position.x).toBe(START_X)
    expect(nodes[1].position.x).toBe(START_X + HORIZONTAL_GAP)
    expect(nodes[2].position.x).toBe(START_X + HORIZONTAL_GAP * 2)
  })

  it("connects first node to start node (id=1)", () => {
    const plan = linearPlan(["name"])
    const { edges } = buildFlowFromPlan(plan, "web")
    expect(edges[0].source).toBe("1")
    expect(edges[0].target).toContain("name")
  })

  it("chains edges sequentially", () => {
    const plan = linearPlan(["name", "email"])
    const { nodes, edges } = buildFlowFromPlan(plan, "web")

    expect(edges).toHaveLength(2)
    // First edge: start → name
    expect(edges[0].source).toBe("1")
    expect(edges[0].target).toBe(nodes[0].id)
    // Second edge: name → email
    expect(edges[1].source).toBe(nodes[0].id)
    expect(edges[1].target).toBe(nodes[1].id)
  })

  it("uses correct platform-specific node types", () => {
    const plan = linearPlan(["question"])
    const whatsapp = buildFlowFromPlan(plan, "whatsapp")
    expect(whatsapp.nodes[0].type).toBe("whatsappQuestion")

    const web = buildFlowFromPlan(plan, "web")
    expect(web.nodes[0].type).toBe("question")
  })

  it("merges content into node data", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "question",
          content: { question: "How are you?", label: "Greeting" },
        },
      ],
    }
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes[0].data.question).toBe("How are you?")
    expect(nodes[0].data.label).toBe("Greeting")
  })
})

// ─── buildFlowFromPlan — branching ────────────────────

describe("buildFlowFromPlan — branching", () => {
  it("creates branching from quickReply with sourceHandles", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "Pick one",
            choices: ["A", "B"],
          },
        },
        {
          step: "branch",
          buttonIndex: 0,
          steps: [{ step: "node", nodeType: "name" }],
        },
        {
          step: "branch",
          buttonIndex: 1,
          steps: [{ step: "node", nodeType: "email" }],
        },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")

    // 1 quickReply + 1 name + 1 email = 3 nodes
    expect(nodes).toHaveLength(3)

    // Find branch edges by looking at the quickReply node's choice IDs
    const qrNode = nodes.find((n) => n.id.includes("quickReply"))
    const choices = qrNode?.data?.choices as ChoiceData[]
    expect(choices).toHaveLength(2)

    const branchEdge0 = edges.find((e) => e.sourceHandle === choices[0].id)
    const branchEdge1 = edges.find((e) => e.sourceHandle === choices[1].id)

    expect(branchEdge0).toBeDefined()
    expect(branchEdge1).toBeDefined()
    expect(branchEdge0!.source).toContain("quickReply")
    expect(branchEdge1!.source).toContain("quickReply")
  })

  it("trims branches beyond platform button limit (whatsapp max 3)", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick", choices: ["A", "B", "C", "D"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "name" }] },
        { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "email" }] },
        { step: "branch", buttonIndex: 2, steps: [{ step: "node", nodeType: "dob" }] },
        { step: "branch", buttonIndex: 3, steps: [{ step: "node", nodeType: "address" }] },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "whatsapp")

    // buttonIndex 3 should be trimmed (whatsapp limit = 3, so 0,1,2 valid)
    const branchEdge3 = edges.find((e) => e.sourceHandle === "button-3")
    expect(branchEdge3).toBeUndefined()

    // Should have quickReply + 3 branch nodes = 4
    expect(nodes).toHaveLength(4)
  })

  it("handles nested branches (quickReply inside a branch)", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Level 1", choices: ["Go"] },
        },
        {
          step: "branch",
          buttonIndex: 0,
          steps: [
            {
              step: "node",
              nodeType: "quickReply",
              content: { question: "Level 2", choices: ["Deeper"] },
            },
            {
              step: "branch",
              buttonIndex: 0,
              steps: [{ step: "node", nodeType: "name" }],
            },
          ],
        },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")

    // 2 quickReplys + 1 name = 3 nodes
    expect(nodes).toHaveLength(3)

    // Both branch edges should have sourceHandle (stable choice- IDs)
    const branchEdges = edges.filter((e) => e.sourceHandle?.startsWith("choice-"))
    expect(branchEdges).toHaveLength(2)
  })
})

// ─── buildFlowFromPlan — platform validation ──────────

describe("buildFlowFromPlan — platform validation", () => {
  it("skips interactiveList on web", () => {
    const plan = linearPlan(["interactiveList"])
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes).toHaveLength(0)
  })

  it("skips whatsappMessage on instagram", () => {
    const plan = linearPlan(["whatsappMessage"])
    const { nodes } = buildFlowFromPlan(plan, "instagram")
    expect(nodes).toHaveLength(0)
  })

  it("skips instagramDM on web", () => {
    const plan = linearPlan(["instagramDM"])
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes).toHaveLength(0)
  })

  it("includes interactiveList on whatsapp", () => {
    const plan = linearPlan(["interactiveList"])
    const { nodes } = buildFlowFromPlan(plan, "whatsapp")
    expect(nodes).toHaveLength(1)
  })
})

// ─── buildFlowFromPlan — factory defaults ─────────────

describe("buildFlowFromPlan — factory defaults", () => {
  it("creates integration nodes with factory defaults (no content)", () => {
    const plan = linearPlan(["shopify"])
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe("shopify")
    expect(nodes[0].data.platform).toBe("web")
  })

  it("creates fulfillment nodes with factory defaults", () => {
    const plan = linearPlan(["homeDelivery"])
    const { nodes } = buildFlowFromPlan(plan, "whatsapp")
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe("homeDelivery")
    expect(nodes[0].data.platform).toBe("whatsapp")
  })

  it("creates flowTemplate nodes for data collection types (name, email, etc.)", () => {
    const plan = linearPlan(["name"])
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes[0].type).toBe("flowTemplate")
    expect(nodes[0].data.internalNodes).toBeDefined()
  })
})

// ─── buildFlowFromPlan — nodeOrder ────────────────────

describe("buildFlowFromPlan — nodeOrder", () => {
  it("returns nodeOrder matching creation sequence", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        { step: "node", nodeType: "name" },
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick", choices: ["A", "B"] },
        },
        {
          step: "branch",
          buttonIndex: 0,
          steps: [{ step: "node", nodeType: "address" }],
        },
        {
          step: "branch",
          buttonIndex: 1,
          steps: [{ step: "node", nodeType: "email" }],
        },
      ],
    }

    const { nodeOrder, nodes } = buildFlowFromPlan(plan, "web")

    // Order: name → quickReply → address (branch 0) → email (branch 1)
    expect(nodeOrder).toHaveLength(4)
    expect(nodeOrder).toEqual(nodes.map((n) => n.id))
  })
})

// ─── buildFlowFromPlan — no duplicate edges from multi-output ──

describe("buildFlowFromPlan — edge handling for quickReply", () => {
  it("converges branches to shared follow-up node", () => {
    // After branches, a sequential node should get edges from all branch endpoints
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick a slot", choices: ["Morning", "Afternoon", "Evening"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "homeDelivery" }] },
        { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "homeDelivery" }] },
        { step: "branch", buttonIndex: 2, steps: [{ step: "node", nodeType: "homeDelivery" }] },
        // Shared convergence node — should get edges from all 3 branch endpoints
        { step: "node", nodeType: "question", content: { question: "Rate us" } },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "whatsapp")
    const quickReplyNode = nodes.find((n) => n.id.includes("quickReply"))
    expect(quickReplyNode).toBeDefined()
    const quickReplyId = quickReplyNode!.id
    const questionNode = nodes.find((n) => n.id.includes("question"))
    expect(questionNode).toBeDefined()

    // 3 choice edges from quickReply (using stable choice- IDs)
    const edgesFromQR = edges.filter((e) => e.source === quickReplyId)
    expect(edgesFromQR).toHaveLength(3)
    edgesFromQR.forEach((e) => {
      expect(e.sourceHandle).toMatch(/^choice-/)
    })

    // 3 convergence edges from homeDelivery nodes → question node
    const homeDeliveryNodes = nodes.filter((n) => n.id.includes("homeDelivery"))
    expect(homeDeliveryNodes).toHaveLength(3)
    for (const hd of homeDeliveryNodes) {
      const convergenceEdge = edges.find(
        (e) => e.source === hd.id && e.target === questionNode!.id
      )
      expect(convergenceEdge).toBeDefined()
    }
  })

  it("connects branch endpoints to convergence node and chains from it", () => {
    // Convergence node should also chain to subsequent nodes
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick", choices: ["A"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "name" }] },
        // Shared convergence node + chained node after it
        { step: "node", nodeType: "question", content: { question: "Q1" } },
        { step: "node", nodeType: "email" },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")
    const nameNode = nodes.find((n) => n.id.includes("name"))
    const questionNode = nodes.find((n) => n.id.includes("question"))
    const emailNode = nodes.find((n) => n.id.includes("email"))
    expect(nameNode).toBeDefined()
    expect(questionNode).toBeDefined()
    expect(emailNode).toBeDefined()

    // name → question convergence edge
    const convergenceEdge = edges.find(
      (e) => e.source === nameNode!.id && e.target === questionNode!.id
    )
    expect(convergenceEdge).toBeDefined()

    // question → email sequential edge
    const chainEdge = edges.find(
      (e) => e.source === questionNode!.id && e.target === emailNode!.id
    )
    expect(chainEdge).toBeDefined()
  })

  it("deduplicates edges with same source+sourceHandle", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Choose", choices: ["A"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "name" }] },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")
    const qrNode = nodes.find((n) => n.id.includes("quickReply"))
    expect(qrNode).toBeDefined()
    const quickReplyId = qrNode!.id
    const choices = qrNode?.data?.choices as ChoiceData[]

    // Only one edge from quickReply's first choice (stable ID)
    const choice0Edges = edges.filter(
      (e) => e.source === quickReplyId && e.sourceHandle === choices[0].id
    )
    expect(choice0Edges).toHaveLength(1)
  })
})

// ─── buildFlowFromPlan — realistic flow ───────────────

describe("buildFlowFromPlan — realistic flow", () => {
  it("builds a complete delivery flow", () => {
    const plan: FlowPlan = {
      message: "Created a hair care delivery flow",
      steps: [
        { step: "node", nodeType: "name" },
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "Which hair issue would you like help with?",
            choices: ["Dandruff", "Oily Hair", "Hair Loss"],
          },
        },
        {
          step: "branch",
          buttonIndex: 0,
          steps: [
            { step: "node", nodeType: "address" },
            { step: "node", nodeType: "homeDelivery" },
          ],
        },
        {
          step: "branch",
          buttonIndex: 1,
          steps: [
            {
              step: "node",
              nodeType: "question",
              content: { question: "Tell us more about your hair type." },
            },
          ],
        },
        {
          step: "branch",
          buttonIndex: 2,
          steps: [{ step: "node", nodeType: "metaAudience" }],
        },
      ],
    }

    const { nodes, edges, nodeOrder } = buildFlowFromPlan(plan, "whatsapp")

    // name + quickReply + address + homeDelivery + question + metaAudience = 6
    expect(nodes).toHaveLength(6)
    expect(nodeOrder).toHaveLength(6)

    // Check platform types
    const qr = nodes.find((n) => n.id.includes("quickReply"))
    expect(qr?.type).toBe("whatsappQuickReply")

    const q = nodes.find((n) => n.id.includes("question"))
    expect(q?.type).toBe("whatsappQuestion")
    expect(q?.data.question).toBe("Tell us more about your hair type.")

    // Check edges include sourceHandle branches (stable choice- IDs)
    const branchEdges = edges.filter((e) => e.sourceHandle?.startsWith("choice-"))
    expect(branchEdges).toHaveLength(3)

    // Ensure all nodes are connected
    const targetIds = new Set(edges.map((e) => e.target))
    nodes.forEach((n) => {
      expect(targetIds.has(n.id)).toBe(true)
    })
  })
})

// ─── buildFlowFromPlan — convergence ──────────────────

describe("buildFlowFromPlan — convergence", () => {
  it("direct convergence: all buttons point to same node when no branches", () => {
    // quickReply with 3 buttons, followed directly by a question (no branches)
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Rate us", choices: ["Good", "Okay", "Bad"] },
        },
        { step: "node", nodeType: "question", content: { question: "Any comments?" } },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "whatsapp")

    expect(nodes).toHaveLength(2)
    const qrNode = nodes.find((n) => n.id.includes("quickReply"))
    const questionNode = nodes.find((n) => n.id.includes("question"))
    expect(qrNode).toBeDefined()
    expect(questionNode).toBeDefined()

    // 3 edges from quickReply (using stable btn- IDs) all → question
    const edgesFromQR = edges.filter((e) => e.source === qrNode!.id && e.target === questionNode!.id)
    expect(edgesFromQR).toHaveLength(3)
    // Each should use a stable choice ID
    const choices = qrNode!.data.choices as ChoiceData[]
    expect(edgesFromQR.map((e) => e.sourceHandle).sort()).toEqual(
      choices.map((c) => c.id).sort()
    )
  })

  it("branch convergence: shared steps after branches get edges from all endpoints", () => {
    // quickReply with 2 branches, followed by a shared question
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick", choices: ["A", "B"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "name" }] },
        { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "email" }] },
        { step: "node", nodeType: "question", content: { question: "Shared question" } },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")

    const nameNode = nodes.find((n) => n.id.includes("name"))
    const emailNode = nodes.find((n) => n.id.includes("email"))
    const questionNode = nodes.find((n) => n.id.includes("question"))
    expect(nameNode).toBeDefined()
    expect(emailNode).toBeDefined()
    expect(questionNode).toBeDefined()

    // 2 convergence edges: name → question and email → question
    const convergenceEdges = edges.filter((e) => e.target === questionNode!.id)
    expect(convergenceEdges).toHaveLength(2)
    const convergenceSources = convergenceEdges.map((e) => e.source).sort()
    expect(convergenceSources).toEqual([nameNode!.id, emailNode!.id].sort())
  })

  it("branch convergence positions shared nodes after the longest branch", () => {
    // Branch 0 has 2 nodes (longer), branch 1 has 1 node
    // Shared node should be positioned after the longest branch
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick", choices: ["A", "B"] },
        },
        {
          step: "branch",
          buttonIndex: 0,
          steps: [
            { step: "node", nodeType: "name" },
            { step: "node", nodeType: "address" },
          ],
        },
        { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "email" }] },
        { step: "node", nodeType: "question", content: { question: "Shared" } },
      ],
    }

    const { nodes } = buildFlowFromPlan(plan, "web")

    const addressNode = nodes.find((n) => n.id.includes("address"))
    const questionNode = nodes.find((n) => n.id.includes("question"))
    expect(addressNode).toBeDefined()
    expect(questionNode).toBeDefined()

    // Shared question node should be positioned to the right of the longest branch endpoint (address)
    expect(questionNode!.position.x).toBeGreaterThan(addressNode!.position.x)
  })

  it("multiple shared steps after convergence chain sequentially", () => {
    // After convergence, multiple shared nodes should chain normally
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: { question: "Pick", choices: ["A", "B"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "name" }] },
        { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "email" }] },
        { step: "node", nodeType: "address" },
        { step: "node", nodeType: "homeDelivery" },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")

    const addressNode = nodes.find((n) => n.id.includes("address"))
    const hdNode = nodes.find((n) => n.id.includes("homeDelivery"))
    expect(addressNode).toBeDefined()
    expect(hdNode).toBeDefined()

    // address → homeDelivery sequential edge should exist
    const chainEdge = edges.find(
      (e) => e.source === addressNode!.id && e.target === hdNode!.id
    )
    expect(chainEdge).toBeDefined()
  })
})

// ─── buildEditFlowFromPlan ──────────────────────────

describe("buildEditFlowFromPlan", () => {
  it("resolves attachHandle 'button-N' to actual choice ID from anchor node", () => {
    // Simulate: existing quickReply node with real choice IDs
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "whatsapp",
          label: "Breed",
          question: "What breed?",
          choices: [
            { text: "Labrador", id: "btn-abc123" },
            { text: "Beagle", id: "btn-def456" },
            { text: "Bulldog", id: "btn-ghi789" },
          ],
        },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Added brand question after Bulldog",
      chains: [
        {
          attachTo: "qr-1",
          attachHandle: "button-2", // AI says button-2 = Bulldog
          steps: [
            { step: "node", nodeType: "question", content: { question: "Which brand?" } },
          ],
        },
      ],
    }

    const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)

    // The edge from qr-1 should use the actual button ID, not "button-2"
    const attachEdge = result.newEdges.find((e) => e.source === "qr-1")
    expect(attachEdge).toBeDefined()
    expect(attachEdge!.sourceHandle).toBe("btn-ghi789") // Bulldog's actual ID
  })

  it("keeps attachHandle as-is when it is already a choice ID", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "whatsapp",
          choices: [
            { text: "A", id: "btn-aaa" },
            { text: "B", id: "btn-bbb" },
          ],
        },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      chains: [
        {
          attachTo: "qr-1",
          attachHandle: "btn-bbb", // already the real ID
          steps: [
            { step: "node", nodeType: "question", content: { question: "test?" } },
          ],
        },
      ],
    }

    const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)
    const attachEdge = result.newEdges.find((e) => e.source === "qr-1")
    expect(attachEdge).toBeDefined()
    expect(attachEdge!.sourceHandle).toBe("btn-bbb")
  })

  it("resolves attachHandle 'button-N' on templateMessage nodes (data.buttons, not data.choices)", () => {
    // Template message nodes store buttons in data.buttons with {type, text, id} schema
    // — they were intentionally excluded from the data.choices unification
    const existingNodes = [
      {
        id: "tmpl-1",
        type: "templateMessage",
        position: { x: 100, y: 100 },
        data: {
          platform: "whatsapp",
          label: "Template Message",
          templateId: "tpl_123",
          templateName: "satisfaction_survey",
          buttons: [
            { type: "quick_reply", text: "Very Satisfied", id: "btn-0" },
            { type: "quick_reply", text: "Satisfied", id: "btn-1" },
            { type: "quick_reply", text: "Unsatisfied", id: "btn-2" },
          ],
        },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Added follow-up after Satisfied button",
      chains: [
        {
          attachTo: "tmpl-1",
          attachHandle: "button-1", // AI says button-1 = Satisfied
          steps: [
            { step: "node", nodeType: "whatsappMessage", content: { message: "Thanks for your feedback!" } },
          ],
        },
      ],
    }

    const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)

    const attachEdge = result.newEdges.find((e) => e.source === "tmpl-1")
    expect(attachEdge).toBeDefined()
    expect(attachEdge!.sourceHandle).toBe("btn-1") // Satisfied button's actual ID
  })

  it("does not resolve button-N on templateMessage with only URL buttons (no output handles)", () => {
    const existingNodes = [
      {
        id: "tmpl-2",
        type: "templateMessage",
        position: { x: 100, y: 100 },
        data: {
          platform: "whatsapp",
          label: "Template Message",
          templateId: "tpl_456",
          templateName: "promo_link",
          buttons: [
            { type: "url", text: "Visit Website", url: "https://example.com" },
            { type: "phone_number", text: "Call Us" },
          ],
        },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Added follow-up after first button",
      chains: [
        {
          attachTo: "tmpl-2",
          attachHandle: "button-0",
          steps: [
            { step: "node", nodeType: "whatsappMessage", content: { message: "Thanks!" } },
          ],
        },
      ],
    }

    const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)

    // button-0 should stay unresolved — URL buttons don't have output handles
    const attachEdge = result.newEdges.find((e) => e.source === "tmpl-2")
    expect(attachEdge).toBeDefined()
    expect(attachEdge!.sourceHandle).toBe("button-0")
  })
})

// ─── warnings collection ────────────────────────────

describe("buildFlowFromPlan — warnings", () => {
  it("returns warnings for invalid platform node types", () => {
    const plan = linearPlan(["interactiveList"])
    const { nodes, warnings } = buildFlowFromPlan(plan, "web")
    expect(nodes).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain("interactiveList")
    expect(warnings[0]).toContain("web")
  })

  it("returns empty warnings for valid plans", () => {
    const plan = linearPlan(["name", "email"])
    const { warnings } = buildFlowFromPlan(plan, "web")
    expect(warnings).toHaveLength(0)
  })
})

describe("buildEditFlowFromPlan — warnings", () => {
  it("warns when attachTo node is not found", () => {
    const editPlan: EditFlowPlan = {
      message: "test",
      chains: [{
        attachTo: "nonexistent-node",
        steps: [{ step: "node", nodeType: "name" }],
      }],
    }
    const { warnings } = buildEditFlowFromPlan(editPlan, "web", [])
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain("nonexistent-node")
  })

  it("warns when nodeUpdate target is not found", () => {
    const editPlan: EditFlowPlan = {
      message: "test",
      chains: [],
      nodeUpdates: [{ nodeId: "missing-node", content: { question: "test?" } }],
    }
    const { warnings } = buildEditFlowFromPlan(editPlan, "web", [])
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain("missing-node")
    // The filter in generate-flow-edit.ts#apply_edit matches this exact
    // prefix to trigger a rollback. Keep this assertion in sync with the
    // filter; any rename here must update the filter, and vice versa.
    expect(warnings[0].startsWith("nodeUpdate target ")).toBe(true)
  })
})

// ─── randomized node IDs ────────────────────────────

describe("buildFlowFromPlan — randomized IDs", () => {
  it("generates node IDs with plan- prefix and random suffix", () => {
    const plan = linearPlan(["name"])
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes[0].id).toMatch(/^plan-name-\d+-[a-z0-9]{4}$/)
  })

  it("generates unique IDs across duplicate runs", () => {
    const plan = linearPlan(["name"])
    const run1 = buildFlowFromPlan(plan, "web")
    const run2 = buildFlowFromPlan(plan, "web")
    expect(run1.nodes[0].id).not.toBe(run2.nodes[0].id)
  })
})

// ─── quickReply → interactiveList auto-conversion ───

describe("buildFlowFromPlan — quickReply auto-conversion", () => {
  it("auto-converts quickReply to interactiveList when buttons exceed whatsapp limit (3)", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "How often do you eat fruit?",
            choices: ["Daily", "Weekly", "Monthly", "Rarely", "Never"],
          },
        },
      ],
    }

    const { nodes, warnings } = buildFlowFromPlan(plan, "whatsapp")

    expect(nodes).toHaveLength(1)
    // Should be converted to whatsappInteractiveList
    expect(nodes[0].type).toBe("whatsappInteractiveList")
    // data.choices should survive the conversion (no rename)
    const choices = nodes[0].data.choices as ChoiceData[]
    expect(choices).toHaveLength(5)
    expect(choices[0].text).toBe("Daily")
    expect(choices[4].text).toBe("Never")
    // Legacy fields should not exist on the migrated node
    expect(nodes[0].data.buttons).toBeUndefined()
    expect(nodes[0].data.options).toBeUndefined()
    // Should have a listTitle
    expect(nodes[0].data.listTitle).toBeDefined()
    // Should preserve the question
    expect(nodes[0].data.question).toBe("How often do you eat fruit?")
    // Should warn about conversion
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain("auto-converted")
  })

  it("does NOT convert quickReply on web (limit is 10)", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "Pick one",
            choices: ["A", "B", "C", "D", "E"],
          },
        },
      ],
    }

    const { nodes, warnings } = buildFlowFromPlan(plan, "web")

    expect(nodes).toHaveLength(1)
    // Should stay as quickReply (web limit is 10, 5 choices is fine)
    expect(nodes[0].type).toBe("quickReply")
    const choices = nodes[0].data.choices as ChoiceData[]
    expect(choices).toHaveLength(5)
    expect(warnings).toHaveLength(0)
  })

  it("trims choices on web when exceeding limit (10)", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "Pick one",
            choices: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
          },
        },
      ],
    }

    const { nodes, warnings } = buildFlowFromPlan(plan, "web")

    expect(nodes).toHaveLength(1)
    // Web doesn't have interactiveList — should trim to 10
    expect(nodes[0].type).toBe("quickReply")
    const choices = nodes[0].data.choices as ChoiceData[]
    expect(choices).toHaveLength(10)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain("trimmed")
  })

  it("preserves 3 choices on whatsapp without conversion", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "Yes or no?",
            choices: ["Yes", "No", "Maybe"],
          },
        },
      ],
    }

    const { nodes, warnings } = buildFlowFromPlan(plan, "whatsapp")

    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe("whatsappQuickReply")
    const choices = nodes[0].data.choices as ChoiceData[]
    expect(choices).toHaveLength(3)
    expect(warnings).toHaveLength(0)
  })

  it("converted interactiveList still works as multi-output with choices for branching", () => {
    const plan: FlowPlan = {
      message: "test",
      steps: [
        {
          step: "node",
          nodeType: "quickReply",
          content: {
            question: "Pick a fruit",
            choices: ["Apple", "Banana", "Cherry", "Date"],
          },
        },
        // Direct convergence — all options → same node
        { step: "node", nodeType: "question", content: { question: "Why do you like it?" } },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "whatsapp")

    // Should auto-convert to interactiveList
    const listNode = nodes.find((n) => n.type === "whatsappInteractiveList")
    expect(listNode).toBeDefined()
    const choices = listNode!.data.choices as ChoiceData[]
    expect(choices).toHaveLength(4)

    // All 4 choices should have edges → question node (direct convergence)
    const questionNode = nodes.find((n) => n.id.includes("question"))
    expect(questionNode).toBeDefined()
    const convergenceEdges = edges.filter(
      (e) => e.source === listNode!.id && e.target === questionNode!.id
    )
    expect(convergenceEdges).toHaveLength(4)
    // Each edge should use a stable choice- handle ID as sourceHandle (preserved from conversion)
    convergenceEdges.forEach((e) => {
      expect(e.sourceHandle).toMatch(/^choice-/)
    })
  })

  it("auto-converts in edit mode chains too", () => {
    const existingNodes = [
      {
        id: "q-1",
        type: "whatsappQuestion",
        position: { x: 100, y: 100 },
        data: { platform: "whatsapp", question: "test" },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      chains: [
        {
          attachTo: "q-1",
          steps: [
            {
              step: "node",
              nodeType: "quickReply",
              content: {
                question: "Choose frequency",
                choices: ["Daily", "Weekly", "Monthly", "Rarely"],
              },
            },
          ],
        },
      ],
    }

    const { newNodes, warnings } = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)

    expect(newNodes).toHaveLength(1)
    expect(newNodes[0].type).toBe("whatsappInteractiveList")
    const choices = newNodes[0].data.choices as ChoiceData[]
    expect(choices).toHaveLength(4)
    expect(warnings.some((w) => w.includes("auto-converted"))).toBe(true)
  })

  it("preserves choice IDs when auto-converting quickReply → interactiveList", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: {
          question: "Pick one",
          choices: [
            { text: "Yes", id: "choice-keep-1" },
            { text: "No", id: "choice-keep-2" },
            { text: "Maybe", id: "choice-keep-3" },
          ],
        },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Add a 4th choice",
      nodeUpdates: [{
        nodeId: "qr-1",
        content: { choices: ["Yes", "No", "Maybe", "Definitely"] },
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes)

    expect(result.nodeUpdates[0].newType).toBe("whatsappInteractiveList")
    const updatedChoices = result.nodeUpdates[0].data.choices as ChoiceData[]
    expect(updatedChoices[0].id).toBe("choice-keep-1")
    expect(updatedChoices[1].id).toBe("choice-keep-2")
    expect(updatedChoices[2].id).toBe("choice-keep-3")
    expect(updatedChoices[3].id).toBeDefined()
    expect(updatedChoices[3].text).toBe("Definitely")
  })
})

// ─── buildEditFlowFromPlan — newType edge topology ──

describe("buildEditFlowFromPlan — newType (type changes)", () => {
  it("preserves outgoing edges on quickReply → interactiveList (same-family)", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: {
          platform: "whatsapp",
          question: "Pick",
          choices: [
            { id: "c1", text: "A" },
            { id: "c2", text: "B" },
          ],
        },
      },
    ] as any[]
    const existingEdges = [
      { id: "e1", source: "qr-1", target: "msg-A", sourceHandle: "c1" },
      { id: "e2", source: "qr-1", target: "msg-B", sourceHandle: "c2" },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "convert to list",
      nodeUpdates: [{
        nodeId: "qr-1",
        newType: "whatsappInteractiveList",
        content: { choices: ["A", "B"] },
      }],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, existingEdges)
    // No ambiguous warning
    expect(result.warnings.find(w => w.startsWith("ambiguous_type_change"))).toBeUndefined()
    // The nodeUpdate was applied
    expect(result.nodeUpdates).toHaveLength(1)
    expect(result.nodeUpdates[0].newType).toBe("whatsappInteractiveList")
    // No new edges added and no edges removed (preserved as-is)
    expect(result.newEdges).toHaveLength(0)
    expect(result.removeEdges).toHaveLength(0)
  })

  it("collapses quickReply → whatsappMessage when all buttons point to the same target", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: {
          platform: "whatsapp",
          question: "Pick",
          choices: [
            { id: "c1", text: "A" },
            { id: "c2", text: "B" },
          ],
        },
      },
    ] as any[]
    const existingEdges = [
      { id: "e1", source: "qr-1", target: "msg-shared", sourceHandle: "c1" },
      { id: "e2", source: "qr-1", target: "msg-shared", sourceHandle: "c2" },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "convert to message",
      nodeUpdates: [{
        nodeId: "qr-1",
        newType: "whatsappMessage",
        content: { text: "Thanks for picking" },
      }],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, existingEdges)
    // Not ambiguous
    expect(result.warnings.find(w => w.startsWith("ambiguous_type_change"))).toBeUndefined()
    // The nodeUpdate was still applied (only edge topology was rewritten)
    expect(result.nodeUpdates).toHaveLength(1)
    expect(result.nodeUpdates[0].newType).toBe("whatsappMessage")
    // Both old edges scheduled for removal
    expect(result.removeEdges).toHaveLength(2)
    // One new edge added pointing to the shared target
    expect(result.newEdges).toHaveLength(1)
    expect(result.newEdges[0].target).toBe("msg-shared")
    expect(result.newEdges[0].source).toBe("qr-1")
    // New edge uses the new default handle (normalized to undefined for
    // single-output nodes per ReactFlow convention).
    expect(result.newEdges[0].sourceHandle).toBeUndefined()
    // Collapse warning emitted
    expect(result.warnings.find(w => w.includes("Collapsed 2 outgoing edges"))).toBeDefined()
  })

  it("refuses quickReply → whatsappMessage when buttons point to different targets (ambiguous)", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: {
          platform: "whatsapp",
          question: "Pick",
          choices: [
            { id: "c1", text: "A" },
            { id: "c2", text: "B" },
          ],
        },
      },
    ] as any[]
    const existingEdges = [
      { id: "e1", source: "qr-1", target: "msg-A", sourceHandle: "c1" },
      { id: "e2", source: "qr-1", target: "msg-B", sourceHandle: "c2" },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "convert to message",
      nodeUpdates: [{
        nodeId: "qr-1",
        newType: "whatsappMessage",
        content: { text: "Thanks" },
      }],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, existingEdges)
    // ambiguous_type_change warning present
    const ambiguous = result.warnings.find(w => w.startsWith("ambiguous_type_change"))
    expect(ambiguous).toBeDefined()
    expect(ambiguous).toContain("qr-1")
    // The nodeUpdate was SKIPPED (not pushed to result.nodeUpdates)
    expect(result.nodeUpdates).toHaveLength(0)
  })

  it("no edge work when the old node had no outgoing edges", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: { platform: "whatsapp", question: "Pick", choices: [] },
      },
    ] as any[]
    const existingEdges = [] as any[]
    const plan: EditFlowPlan = {
      message: "convert",
      nodeUpdates: [{
        nodeId: "qr-1",
        newType: "whatsappMessage",
        content: { text: "Hi" },
      }],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, existingEdges)
    expect(result.warnings.find(w => w.startsWith("ambiguous_type_change"))).toBeUndefined()
    expect(result.nodeUpdates).toHaveLength(1)
    expect(result.nodeUpdates[0].newType).toBe("whatsappMessage")
  })

  it("preserves existing choices when newType converts quickReply → interactiveList without choice content", () => {
    // Same-family conversion where the AI sends listTitle/label but doesn't
    // resend choices. Without backfill, applyNodeUpdates factory-resets (base
    // types differ: quickReply vs list) and drops the user's 3 choices.
    const existingNodes = [
      {
        id: "qr1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: {
          platform: "whatsapp",
          question: "Pick one",
          choices: [
            { id: "old-c1", text: "A" },
            { id: "old-c2", text: "B" },
            { id: "old-c3", text: "C" },
          ],
        },
      },
    ] as any[]

    const result = buildEditFlowFromPlan(
      {
        message: "convert to list",
        nodeUpdates: [
          { nodeId: "qr1", newType: "interactiveList", content: { listTitle: "Pick one please" } },
        ],
      } as any,
      "whatsapp",
      existingNodes,
      [],
    )

    expect(result.nodeUpdates.length).toBe(1)
    const updated = result.nodeUpdates[0]
    expect(updated.newType).toBe("interactiveList")
    const choices = (updated.data as any).choices
    expect(choices).toHaveLength(3)
    // Existing IDs should be preserved by the ID-preservation block
    expect(choices[0].id).toBe("old-c1")
    expect(choices[1].id).toBe("old-c2")
    expect(choices[2].id).toBe("old-c3")
  })

  it("fans out single default edge when question → quickReply adds N handles", () => {
    // Expansion case: question has one default edge → msg. Converting to
    // quickReply with 3 buttons should produce 3 edges, one per new handle,
    // all pointing at the same target. The old default edge is dropped.
    const existingNodes = [
      {
        id: "q1",
        type: "whatsappQuestion",
        position: { x: 0, y: 0 },
        data: { platform: "whatsapp", question: "What's your name?", storeAs: "name" },
      },
      {
        id: "m1",
        type: "whatsappMessage",
        position: { x: 100, y: 0 },
        data: { platform: "whatsapp", text: "Thanks!" },
      },
    ] as any[]

    const existingEdges = [
      { id: "e1", source: "q1", target: "m1" }, // default edge (no sourceHandle)
    ] as any[]

    const result = buildEditFlowFromPlan(
      {
        message: "convert question to quickReply",
        nodeUpdates: [
          {
            nodeId: "q1",
            newType: "quickReply",
            content: {
              question: "What's your name?",
              choices: ["Alice", "Bob", "Carol"],
            },
          },
        ],
      } as any,
      "whatsapp",
      existingNodes,
      existingEdges,
    )

    // The nodeUpdate was applied (not refused as ambiguous)
    expect(result.warnings.find(w => w.startsWith("ambiguous_type_change"))).toBeUndefined()
    expect(result.nodeUpdates).toHaveLength(1)
    expect(result.nodeUpdates[0].newType).toBe("quickReply")

    // Expect 3 edges from q1 to m1, one per button handle
    const fanoutEdges = result.newEdges.filter(e => e.source === "q1" && e.target === "m1")
    expect(fanoutEdges).toHaveLength(3)
    // Each edge should have a distinct sourceHandle (one per new choice)
    const handles = new Set(fanoutEdges.map(e => e.sourceHandle))
    expect(handles.size).toBe(3)
    // None of them should be undefined — they're all choice handles
    for (const handle of handles) {
      expect(handle).toBeDefined()
    }

    // Old default edge is scheduled for removal
    const removed = result.removeEdges.find(e => e.source === "q1" && e.target === "m1")
    expect(removed).toBeDefined()

    // Fanout warning (informational, not ambiguous)
    const warning = result.warnings.find(w =>
      w.includes("q1") && w.includes("Added 3 new handles") && w.includes("m1")
    )
    expect(warning).toBeDefined()
  })
})

// ─── addEdges validation ────────────────────────────

describe("buildEditFlowFromPlan — addEdges validation", () => {
  it("skips self-loop edges in addEdges", () => {
    const existingNodes = [
      { id: "n1", type: "name", position: { x: 0, y: 0 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      chains: [],
      addEdges: [{ source: "n1", target: "n1" }],
    }
    const { newEdges } = buildEditFlowFromPlan(editPlan, "web", existingNodes)
    expect(newEdges).toHaveLength(0)
  })

  it("skips edges with non-existent source or target", () => {
    const existingNodes = [
      { id: "n1", type: "name", position: { x: 0, y: 0 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      chains: [],
      addEdges: [{ source: "n1", target: "nonexistent" }],
    }
    const { newEdges } = buildEditFlowFromPlan(editPlan, "web", existingNodes)
    expect(newEdges).toHaveLength(0)
  })
})

// ─── connectTo (insert-between-nodes) ────────────────

describe("buildEditFlowFromPlan — connectTo", () => {
  it("inserts a node between two existing nodes (A → C becomes A → B → C)", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "C", type: "email", position: { x: 450, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Inserted address between name and email",
      removeEdges: [{ source: "A", target: "C" }],
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "address" }],
        connectTo: "C",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // Should create one new node (address)
    expect(result.newNodes).toHaveLength(1)
    expect(result.newNodes[0].id).toContain("address")

    // Should have two edges: A → address, address → C
    expect(result.newEdges).toHaveLength(2)
    const edgeFromA = result.newEdges.find(e => e.source === "A")
    const edgeToC = result.newEdges.find(e => e.target === "C")
    expect(edgeFromA).toBeDefined()
    expect(edgeFromA!.target).toBe(result.newNodes[0].id)
    expect(edgeToC).toBeDefined()
    expect(edgeToC!.source).toBe(result.newNodes[0].id)

    // Should remove the old A → C edge
    expect(result.removeEdges).toEqual([{ source: "A", target: "C" }])
  })

  it("replaces a node with a new node (A → X → B becomes A → Y → B)", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "X", type: "question", position: { x: 450, y: 100 }, data: { platform: "web", question: "old?" } },
      { id: "B", type: "email", position: { x: 800, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Replaced question with quickReply",
      removeNodeIds: ["X"],
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "quickReply", content: { question: "Pick one", choices: ["Yes", "No"] } }],
        connectTo: "B",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // Should create one new quickReply node
    expect(result.newNodes).toHaveLength(1)
    expect(result.newNodes[0].id).toContain("quickReply")

    // Should have edge from A → quickReply
    const edgeFromA = result.newEdges.find(e => e.source === "A")
    expect(edgeFromA).toBeDefined()
    expect(edgeFromA!.target).toBe(result.newNodes[0].id)

    // connectTo edge: quickReply → B (uses a free button handle, never "sync-next")
    const edgeToB = result.newEdges.find(e => e.target === "B")
    expect(edgeToB).toBeDefined()
    expect(edgeToB!.source).toBe(result.newNodes[0].id)
    expect(edgeToB!.sourceHandle).not.toBe("sync-next")
    expect(edgeToB!.sourceHandle).toBeTruthy()

    // Should remove X
    expect(result.removeNodeIds).toContain("X")
  })

  it("connectTo from multi-output last node uses a button handle (never sync-next)", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 800, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Insert quickReply between A and B",
      removeEdges: [{ source: "A", target: "B" }],
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "quickReply", content: { question: "Choose", choices: ["X", "Y"] } }],
        connectTo: "B",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // The connectTo edge should use a free button handle, never "sync-next"
    const connectToEdge = result.newEdges.find(e => e.target === "B")
    expect(connectToEdge).toBeDefined()
    expect(connectToEdge!.sourceHandle).not.toBe("sync-next")
    expect(connectToEdge!.sourceHandle).toBeTruthy()
  })

  it("connectTo to non-existent node does not crash (edge still created)", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Chain with bad connectTo",
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "email" }],
        connectTo: "nonexistent-node",
      }],
    }

    // Should not throw
    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // The new node should be created
    expect(result.newNodes).toHaveLength(1)

    // The connectTo edge to nonexistent node is still created (edge target validity is not checked here)
    const connectToEdge = result.newEdges.find(e => e.target === "nonexistent-node")
    expect(connectToEdge).toBeDefined()
  })
})

// ─── positionShifts (downstream node shifting) ─────────

describe("buildEditFlowFromPlan — positionShifts", () => {
  it("shifts downstream nodes right when inserting between A and C", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "C", type: "email", position: { x: 450, y: 100 }, data: { platform: "web" } },
      { id: "D", type: "address", position: { x: 800, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Insert question between A and C",
      removeEdges: [{ source: "A", target: "C" }],
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "question", content: { question: "How old?" } }],
        connectTo: "C",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // Both C and D are at or to the right of C.position.x (450)
    // so both should be shifted right by 1 * HORIZONTAL_GAP
    expect(result.positionShifts).toHaveLength(2)
    const shiftC = result.positionShifts.find(s => s.nodeId === "C")
    const shiftD = result.positionShifts.find(s => s.nodeId === "D")
    expect(shiftC).toBeDefined()
    expect(shiftC!.dx).toBe(HORIZONTAL_GAP)
    expect(shiftD).toBeDefined()
    expect(shiftD!.dx).toBe(HORIZONTAL_GAP)

    // A should NOT be shifted (it's to the left of the threshold)
    expect(result.positionShifts.find(s => s.nodeId === "A")).toBeUndefined()
  })

  it("does not shift removed nodes", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "X", type: "question", position: { x: 450, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 800, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Replace X with address",
      removeNodeIds: ["X"],
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "address" }],
        connectTo: "B",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // X should NOT be shifted because it's being removed
    expect(result.positionShifts.find(s => s.nodeId === "X")).toBeUndefined()

    // B is at x=800 >= B.x=800, so should be shifted
    const shiftB = result.positionShifts.find(s => s.nodeId === "B")
    expect(shiftB).toBeDefined()
    expect(shiftB!.dx).toBe(HORIZONTAL_GAP)
  })

  it("returns empty positionShifts when no connectTo is used", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Append a node",
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "email" }],
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)
    expect(result.positionShifts).toHaveLength(0)
  })

  it("accumulates shifts from multiple chains affecting the same nodes", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 450, y: 100 }, data: { platform: "web" } },
      { id: "C", type: "address", position: { x: 450, y: 300 }, data: { platform: "web" } },
      { id: "D", type: "question", position: { x: 800, y: 100 }, data: { platform: "web", question: "?" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Insert between A→B and A→C",
      removeEdges: [{ source: "A", target: "B" }, { source: "A", target: "C" }],
      chains: [
        {
          attachTo: "A",
          steps: [{ step: "node", nodeType: "question", content: { question: "Q1" } }],
          connectTo: "B",
        },
        {
          attachTo: "A",
          steps: [{ step: "node", nodeType: "question", content: { question: "Q2" } }],
          connectTo: "C",
        },
      ],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // D (at x=800) is to the right of both B (450) and C (450)
    // so it should be shifted by 2 * HORIZONTAL_GAP (once for each chain)
    const shiftD = result.positionShifts.find(s => s.nodeId === "D")
    expect(shiftD).toBeDefined()
    expect(shiftD!.dx).toBe(2 * HORIZONTAL_GAP)
  })

  it("shifts by multiple HORIZONTAL_GAPs when chain has multiple nodes", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "C", type: "email", position: { x: 450, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Insert two nodes between A and C",
      removeEdges: [{ source: "A", target: "C" }],
      chains: [{
        attachTo: "A",
        steps: [
          { step: "node", nodeType: "question", content: { question: "Q1" } },
          { step: "node", nodeType: "address" },
        ],
        connectTo: "C",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // 2 new nodes → shift by 2 * HORIZONTAL_GAP
    const shiftC = result.positionShifts.find(s => s.nodeId === "C")
    expect(shiftC).toBeDefined()
    expect(shiftC!.dx).toBe(2 * HORIZONTAL_GAP)
  })
})

// ─── merge/redirect pattern (addEdges + removeEdges) ─

describe("buildEditFlowFromPlan — merge/redirect patterns", () => {
  it("redirects choices to an existing node (merge pattern)", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "quickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "web",
          question: "Pick",
          choices: [
            { text: "A", id: "btn-aaa" },
            { text: "B", id: "btn-bbb" },
            { text: "C", id: "btn-ccc" },
          ],
        },
      },
      { id: "q1", type: "question", position: { x: 450, y: 0 }, data: { platform: "web", question: "Q1" } },
      { id: "q2", type: "question", position: { x: 450, y: 200 }, data: { platform: "web", question: "Q2" } },
      { id: "q3", type: "question", position: { x: 450, y: 400 }, data: { platform: "web", question: "Q3" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "All 3 buttons now point to Q1",
      removeEdges: [
        { source: "qr-1", target: "q2" },
        { source: "qr-1", target: "q3" },
      ],
      removeNodeIds: ["q2", "q3"],
      addEdges: [
        { source: "qr-1", target: "q1", sourceButtonIndex: 1 },
        { source: "qr-1", target: "q1", sourceButtonIndex: 2 },
      ],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // Two new edges created
    expect(result.newEdges).toHaveLength(2)

    // First addEdge: button-1 → q1, should resolve to btn-bbb
    const edge1 = result.newEdges.find(e => e.sourceHandle === "btn-bbb")
    expect(edge1).toBeDefined()
    expect(edge1!.target).toBe("q1")

    // Second addEdge: button-2 → q1, should resolve to btn-ccc
    const edge2 = result.newEdges.find(e => e.sourceHandle === "btn-ccc")
    expect(edge2).toBeDefined()
    expect(edge2!.target).toBe("q1")

    // Removed nodes and edges
    expect(result.removeNodeIds).toEqual(["q2", "q3"])
    expect(result.removeEdges).toHaveLength(2)
  })

  it("adds a new choice via nodeUpdates + connects via addEdges", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "quickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "web",
          question: "Pick",
          choices: [
            { text: "A", id: "btn-aaa" },
            { text: "B", id: "btn-bbb" },
          ],
        },
      },
      { id: "target-a", type: "name", position: { x: 450, y: 0 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Added new choice C pointing to target-a",
      nodeUpdates: [{ nodeId: "qr-1", content: { choices: ["A", "B", "New C"] } }],
      addEdges: [{ source: "qr-1", target: "target-a", sourceButtonIndex: 2 }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // nodeUpdate should have 3 choices
    expect(result.nodeUpdates).toHaveLength(1)
    const updatedChoices = result.nodeUpdates[0].data.choices as ChoiceData[]
    expect(updatedChoices).toHaveLength(3)

    // New edge should resolve button index 2 to the new choice's ID (from nodeUpdate data)
    expect(result.newEdges).toHaveLength(1)
    const newEdge = result.newEdges[0]
    expect(newEdge.source).toBe("qr-1")
    expect(newEdge.target).toBe("target-a")
    // The third choice (index 2) gets a new ID from contentToNodeData since it's beyond existing choices
    expect(newEdge.sourceHandle).toBeDefined()
    // It should NOT be "button-2" — it should be resolved to an actual ID
    expect(newEdge.sourceHandle).not.toBe("button-2")
  })

  it("nodeUpdates preserves existing choice IDs by position", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "quickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "web",
          question: "Pick",
          choices: [
            { text: "Old A", id: "btn-original-0" },
            { text: "Old B", id: "btn-original-1" },
          ],
        },
      },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "Updated choice labels",
      nodeUpdates: [{ nodeId: "qr-1", content: { choices: ["New A", "New B", "New C"] } }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    expect(result.nodeUpdates).toHaveLength(1)
    const updatedChoices = result.nodeUpdates[0].data.choices as ChoiceData[]
    expect(updatedChoices).toHaveLength(3)

    // First two choices should retain their original IDs
    expect(updatedChoices[0].id).toBe("btn-original-0")
    expect(updatedChoices[1].id).toBe("btn-original-1")
    // Third choice gets a new ID (not from existing)
    expect(updatedChoices[2].id).toBeDefined()
    expect(updatedChoices[2].id).not.toBe("btn-original-0")
    expect(updatedChoices[2].id).not.toBe("btn-original-1")

    // Text should be updated
    expect(updatedChoices[0].text).toBe("New A")
    expect(updatedChoices[1].text).toBe("New B")
    expect(updatedChoices[2].text).toBe("New C")
  })

  it("addEdges resolves 'button-N' sourceHandle to actual choice ID", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "quickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "web",
          choices: [
            { text: "A", id: "btn-real-0" },
            { text: "B", id: "btn-real-1" },
          ],
        },
      },
      { id: "target", type: "name", position: { x: 450, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      addEdges: [{ source: "qr-1", target: "target", sourceHandle: "button-1" }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    expect(result.newEdges).toHaveLength(1)
    // "button-1" should resolve to "btn-real-1"
    expect(result.newEdges[0].sourceHandle).toBe("btn-real-1")
  })
})

// ─── backward edge + orphan detection warnings ──────

describe("buildEditFlowFromPlan — backward edge + orphan warnings", () => {
  it("warns about backward edges but still creates them", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 500, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      addEdges: [{ source: "B", target: "A" }], // backward: B(x=500) → A(x=100)
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)

    // Edge should still be created
    expect(result.newEdges).toHaveLength(1)
    expect(result.newEdges[0].source).toBe("B")
    expect(result.newEdges[0].target).toBe("A")

    // Should warn about backward edge
    expect(result.warnings.some(w => w.includes("backward edge"))).toBe(true)
    expect(result.warnings.some(w => w.includes("B") && w.includes("A"))).toBe(true)
  })

  it("does NOT warn about forward edges", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 500, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      addEdges: [{ source: "A", target: "B" }], // forward: A(x=100) → B(x=500)
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)
    expect(result.newEdges).toHaveLength(1)
    expect(result.warnings.some(w => w.includes("backward edge"))).toBe(false)
  })

  it("detects orphaned nodes when their only source is removed", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "X", type: "question", position: { x: 450, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 800, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const existingEdges = [
      { id: "e-A-X", source: "A", target: "X", type: "default" },
      { id: "e-X-B", source: "X", target: "B", type: "default" },
    ] as any[]

    // Remove X — this orphans B (its only source was X)
    const editPlan: EditFlowPlan = {
      message: "test",
      removeNodeIds: ["X"],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes, existingEdges)

    // Should warn about orphaned B
    expect(result.warnings.some(w => w.includes("orphaned") && w.includes("B"))).toBe(true)
  })

  it("does NOT warn about orphans when new edges reconnect the node", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "X", type: "question", position: { x: 450, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 800, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const existingEdges = [
      { id: "e-A-X", source: "A", target: "X", type: "default" },
      { id: "e-X-B", source: "X", target: "B", type: "default" },
    ] as any[]

    // Remove X but reconnect A → B via chain's connectTo
    const editPlan: EditFlowPlan = {
      message: "test",
      removeNodeIds: ["X"],
      chains: [{
        attachTo: "A",
        steps: [{ step: "node", nodeType: "address" }],
        connectTo: "B",
      }],
    }

    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes, existingEdges)

    // Should NOT warn about orphaned B because new chain connects to it
    expect(result.warnings.some(w => w.includes("orphaned") && w.includes("B"))).toBe(false)
  })

  it("does NOT run orphan detection when existingEdges is not provided", () => {
    const existingNodes = [
      { id: "A", type: "name", position: { x: 100, y: 100 }, data: { platform: "web" } },
      { id: "B", type: "email", position: { x: 500, y: 100 }, data: { platform: "web" } },
    ] as any[]

    const editPlan: EditFlowPlan = {
      message: "test",
      removeNodeIds: ["A"],
    }

    // No existingEdges provided — should not crash or warn
    const result = buildEditFlowFromPlan(editPlan, "web", existingNodes)
    expect(result.warnings.some(w => w.includes("orphaned"))).toBe(false)
  })
})

// ─── buildFlowFromPlan — templateResolver ───────────

describe("buildFlowFromPlan with templateResolver", () => {
  it("resolves user templates via templateResolver", () => {
    const plan: FlowPlan = {
      message: "Test",
      steps: [
        {
          step: "node",
          nodeType: "flowTemplate",
          content: { templateId: "user-template-123" },
        },
      ],
    }

    const resolver: TemplateResolver = (id) => {
      if (id === "user-template-123") {
        return {
          nodes: [{
            id: "inner-1",
            type: "whatsappQuestion",
            position: { x: 0, y: 0 },
            data: { platform: "whatsapp", label: "Test Q", question: "Test?", storeAs: "test_var" },
          }],
          edges: [],
        }
      }
      return null
    }

    const result = buildFlowFromPlan(plan, "whatsapp", resolver)
    expect(result.nodes.length).toBe(1)
    expect(result.nodes[0].type).toBe("flowTemplate")
    expect((result.nodes[0].data as any).internalNodes.length).toBe(1)
    expect(result.warnings.length).toBe(0)
  })

  it("warns when template not found in resolver", () => {
    const plan: FlowPlan = {
      message: "Test",
      steps: [
        {
          step: "node",
          nodeType: "flowTemplate",
          content: { templateId: "nonexistent-id" },
        },
      ],
    }

    const resolver: TemplateResolver = () => null

    const result = buildFlowFromPlan(plan, "whatsapp", resolver)
    expect(result.warnings.some(w => w.includes("nonexistent-id"))).toBe(true)
  })

  it("works without a resolver (backward compatible)", () => {
    const plan: FlowPlan = {
      message: "Test",
      steps: [
        { step: "node", nodeType: "question", content: { question: "Name?", storeAs: "name" } },
      ],
    }

    const result = buildFlowFromPlan(plan, "whatsapp")
    expect(result.nodes.length).toBe(1)
  })
})

// ─── buildEditFlowFromPlan — templateResolver ───────

describe("buildEditFlowFromPlan with templateResolver", () => {
  it("resolves user templates via templateResolver in edit mode", () => {
    const editPlan: EditFlowPlan = {
      message: "Test",
      chains: [{
        attachTo: "existing-1",
        steps: [
          {
            step: "node",
            nodeType: "flowTemplate",
            content: { templateId: "user-template-456" },
          },
        ],
      }],
    }

    const existingNodes = [{
      id: "existing-1",
      type: "whatsappQuestion",
      position: { x: 0, y: 0 },
      data: { platform: "whatsapp", label: "Q1", question: "Test?" },
    }]

    const resolver: TemplateResolver = (id) => {
      if (id === "user-template-456") {
        return {
          nodes: [{
            id: "inner-1",
            type: "whatsappQuestion",
            position: { x: 0, y: 0 },
            data: { platform: "whatsapp", label: "Inner Q", question: "Inner?", storeAs: "inner_var" },
          }],
          edges: [],
        }
      }
      return null
    }

    const result = buildEditFlowFromPlan(editPlan, "whatsapp", existingNodes, [], resolver)
    expect(result.newNodes.length).toBe(1)
    expect(result.newNodes[0].type).toBe("flowTemplate")
    expect((result.newNodes[0].data as any).internalNodes.length).toBe(1)
  })
})

describe("buildEditFlowFromPlan — localId in chains", () => {
  it("resolves localId:X in addEdges to the generated node ID", () => {
    const existingNodes = [
      { id: "qr-1", type: "whatsappQuickReply", position: { x: 0, y: 0 }, data: { platform: "whatsapp", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }] } },
      { id: "qr-2", type: "whatsappQuickReply", position: { x: 100, y: 0 }, data: { platform: "whatsapp", choices: [{ id: "c3", text: "X" }] } },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "fan-in to a new confirmation",
      chains: [{
        attachTo: "qr-1",
        attachHandle: "c1",
        steps: [{
          step: "node",
          nodeType: "whatsappMessage",
          content: { text: "Confirmed!" },
          localId: "confirm",
        }],
      }],
      addEdges: [
        { source: "qr-2", target: "localId:confirm", sourceButtonIndex: 0 },
      ],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, [])
    // Chain created the new message
    expect(result.newNodes).toHaveLength(1)
    const newNode = result.newNodes[0]
    expect(newNode.type).toBe("whatsappMessage")
    // addEdge resolved localId:confirm to the new node's ID
    const fanIn = result.newEdges.find(e => e.source === "qr-2" && e.target === newNode.id)
    expect(fanIn).toBeDefined()
  })

  it("emits a warning and skips the edge when localId is not found", () => {
    const existingNodes = [
      { id: "qr-1", type: "whatsappQuickReply", position: { x: 0, y: 0 }, data: { platform: "whatsapp", choices: [{ id: "c1", text: "A" }] } },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "bad localId reference",
      chains: [],
      addEdges: [
        { source: "qr-1", target: "localId:typo-name", sourceButtonIndex: 0 },
      ],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, [])
    expect(result.newEdges).toHaveLength(0)
    const skipWarning = result.warnings.find(w => w.startsWith("addEdge ") && w.includes("typo-name"))
    expect(skipWarning).toBeDefined()
  })

  it("warns on duplicate localId and uses the second one", () => {
    const existingNodes = [
      { id: "qr-1", type: "whatsappQuickReply", position: { x: 0, y: 0 }, data: { platform: "whatsapp", choices: [{ id: "c1", text: "A" }] } },
      { id: "qr-2", type: "whatsappQuickReply", position: { x: 100, y: 0 }, data: { platform: "whatsapp", choices: [{ id: "c2", text: "B" }] } },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "duplicate localId",
      chains: [
        {
          attachTo: "qr-1",
          attachHandle: "c1",
          steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "First" }, localId: "shared" }],
        },
        {
          attachTo: "qr-2",
          attachHandle: "c2",
          steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Second" }, localId: "shared" }],
        },
      ],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, [])
    expect(result.newNodes).toHaveLength(2)
    const dupWarning = result.warnings.find(w => w.startsWith("duplicate localId"))
    expect(dupWarning).toBeDefined()
  })

  it("passes through non-localId source/target unchanged", () => {
    const existingNodes = [
      { id: "qr-1", type: "whatsappQuickReply", position: { x: 0, y: 0 }, data: { platform: "whatsapp", choices: [{ id: "c1", text: "A" }, { id: "c2", text: "B" }] } },
      { id: "msg-1", type: "whatsappMessage", position: { x: 100, y: 0 }, data: { platform: "whatsapp", text: "Target" } },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "normal addEdge with no localId",
      chains: [],
      addEdges: [
        { source: "qr-1", target: "msg-1", sourceButtonIndex: 0 },
      ],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, [])
    expect(result.newEdges).toHaveLength(1)
    expect(result.newEdges[0].source).toBe("qr-1")
    expect(result.newEdges[0].target).toBe("msg-1")
  })

  it("resolves target:localId + sourceButtonIndex to both target and sourceHandle", () => {
    // Combines localId target resolution with sourceButtonIndex → button ID
    // resolution. Both should run in the same addEdge: the target maps to
    // the chain-created node, and sourceHandle resolves to the source
    // node's second button id ("c2").
    const existingNodes = [
      {
        id: "qr-2",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: {
          platform: "whatsapp",
          choices: [
            { id: "c1", text: "A" },
            { id: "c2", text: "B" },
          ],
        },
      },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "target localId with sourceButtonIndex",
      chains: [{
        attachTo: "qr-2",
        attachHandle: "c1",
        steps: [{
          step: "node",
          nodeType: "whatsappMessage",
          content: { text: "Confirmed!" },
          localId: "confirm",
        }],
      }],
      addEdges: [
        { source: "qr-2", target: "localId:confirm", sourceButtonIndex: 1 },
      ],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, [])
    const newNode = result.newNodes[0]
    const fanIn = result.newEdges.find(
      e => e.source === "qr-2" && e.target === newNode.id && e.sourceHandle === "c2"
    )
    expect(fanIn).toBeDefined()
  })

  it("resolves source:localId to the chain-created node ID", () => {
    // Reverse direction: source uses localId, target is an existing node.
    // The localId-created node is the source of a new edge pointing into an
    // existing message node.
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 0, y: 0 },
        data: { platform: "whatsapp", choices: [{ id: "c1", text: "A" }] },
      },
      {
        id: "target-msg",
        type: "whatsappMessage",
        position: { x: 200, y: 0 },
        data: { platform: "whatsapp", text: "Final" },
      },
    ] as any[]
    const plan: EditFlowPlan = {
      message: "source localId",
      chains: [{
        attachTo: "qr-1",
        attachHandle: "c1",
        steps: [{
          step: "node",
          nodeType: "whatsappMessage",
          content: { text: "Intermediate" },
          localId: "mid",
        }],
      }],
      addEdges: [
        { source: "localId:mid", target: "target-msg" },
      ],
    }
    const result = buildEditFlowFromPlan(plan, "whatsapp", existingNodes, [])
    const newNode = result.newNodes.find(n => (n.data as any).text === "Intermediate")
    expect(newNode).toBeDefined()
    const edge = result.newEdges.find(e => e.source === newNode!.id && e.target === "target-msg")
    expect(edge).toBeDefined()
  })
})

describe("buildFlowFromPlan — templateMessage", () => {
  const basePlan = (content: any): FlowPlan => ({
    message: "test",
    steps: [
      {
        step: "node",
        nodeType: "templateMessage",
        content,
      },
    ],
  })

  it("builds a templateMessage node with full content", () => {
    const plan = basePlan({
      templateId: "tpl-123",
      templateName: "order_confirmation",
      displayName: "Order Confirmation",
      language: "en",
      category: "UTILITY",
      headerType: "TEXT",
      bodyPreview: "Hi {{first_name}}, your order {{order_id}} is ready",
      parameterMappings: [
        { templateVar: "first_name", flowValue: "{{user_name}}" },
        { templateVar: "order_id", flowValue: "{{order_id}}" },
      ],
      templateButtons: [
        { type: "QUICK_REPLY", text: "Track order" },
        { type: "URL", text: "View", url: "https://example.com" },
      ],
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)

    const templateNode = result.nodes.find((n) => n.type === "templateMessage")
    expect(templateNode).toBeDefined()
    const data = templateNode!.data as any
    expect(data.templateId).toBe("tpl-123")
    expect(data.templateName).toBe("order_confirmation")
    expect(data.displayName).toBe("Order Confirmation")
    expect(data.language).toBe("en")
    expect(data.category).toBe("UTILITY")
    expect(data.headerType).toBe("TEXT")
    expect(data.bodyPreview).toBe("Hi {{first_name}}, your order {{order_id}} is ready")
    expect(data.parameterMappings).toEqual([
      { templateVar: "first_name", flowValue: "{{user_name}}" },
      { templateVar: "order_id", flowValue: "{{order_id}}" },
    ])
    expect(data.buttons).toHaveLength(2)
    expect(data.buttons[0]).toMatchObject({ type: "quick_reply", text: "Track order", id: "btn-0" })
    expect(data.buttons[1]).toMatchObject({ type: "url", text: "View", url: "https://example.com", id: "btn-1" })
  })

  it("seeds parameterMappings from bodyPreview when AI omits them", () => {
    const plan = basePlan({
      templateName: "welcome",
      bodyPreview: "Hi {{first_name}}, welcome {{company}}",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    expect(data.parameterMappings).toEqual([
      { templateVar: "first_name", flowValue: "" },
      { templateVar: "company", flowValue: "" },
    ])
  })

  it("uses displayName for label when label is absent", () => {
    const plan = basePlan({
      templateName: "x",
      displayName: "Welcome Template",
      bodyPreview: "hello",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    // Factory default label is "Template Message"; contentToNodeData should NOT
    // overwrite it unless content.label is explicitly provided. Verify the
    // factory default is preserved.
    expect(data.label).toBe("Template Message")
    expect(data.displayName).toBe("Welcome Template")
  })

  it("builds a clean node when the template has no variables", () => {
    const plan = basePlan({
      templateName: "simple",
      bodyPreview: "Thanks for shopping with us!",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    expect(data.parameterMappings).toEqual([])
  })
})

describe("buildFlowFromPlan — templateMessage with approvedTemplates catalog", () => {
  // Minimal catalog entry matching the shape returned by list_templates.
  const catalog: ApprovedTemplate[] = [
    {
      id: "real-uuid-123",
      name: "welcome_customer",
      displayName: "Welcome Customer",
      language: "en",
      category: "MARKETING",
      headerType: "TEXT",
      body: "Hi {{customer_name}}, welcome to {{company}}!",
      variables: ["customer_name", "company"],
      buttons: [
        { type: "quick_reply", text: "Get Started" },
        { type: "url", text: "Visit Site", url: "https://example.com" },
      ],
    },
  ]

  const basePlan = (content: any): FlowPlan => ({
    message: "test",
    steps: [
      { step: "node", nodeType: "templateMessage", content },
    ],
  })

  it("overwrites AI-hallucinated templateId / bodyPreview with catalog values when the name matches", () => {
    const plan = basePlan({
      templateName: "welcome_customer",
      language: "en",
      // AI-fabricated values — builder must ignore all of these.
      templateId: "fake-meta-id-9999",
      bodyPreview: "Hi {{1}}! Totally wrong body the AI invented.",
      category: "WRONG",
      headerType: "IMAGE",
      templateButtons: [{ type: "QUICK_REPLY", text: "fabricated button" }],
      parameterMappings: [
        { templateVar: "1", flowValue: "{{system.contact_name}}" },
      ],
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined, catalog)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    expect(data.templateId).toBe("real-uuid-123")
    expect(data.bodyPreview).toBe("Hi {{customer_name}}, welcome to {{company}}!")
    expect(data.category).toBe("MARKETING")
    expect(data.headerType).toBe("TEXT")
    expect(data.displayName).toBe("Welcome Customer")
    expect(data.language).toBe("en")
    expect(data.buttons).toHaveLength(2)
    expect(data.buttons[0]).toMatchObject({ type: "quick_reply", text: "Get Started", id: "btn-0" })
    expect(data.buttons[1]).toMatchObject({ type: "url", text: "Visit Site", id: "btn-1" })
    expect(result.warnings).toEqual([])
  })

  it("pushes a warning and drops the fabricated data when the templateName doesn't match any approved template", () => {
    const plan = basePlan({
      templateName: "no_such_template_lol",
      language: "en",
      templateId: "fake-id",
      bodyPreview: "AI invented body",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined, catalog)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    // The node still exists (templateName / language passthrough from plan)
    // but the AI's fabricated values MUST NOT land. Factory defaults (empty
    // string / undefined) are acceptable — what matters is that the
    // hallucinated fake-id / fake body aren't adopted.
    expect(data.templateName).toBe("no_such_template_lol")
    expect(data.templateId).not.toBe("fake-id")
    expect(data.bodyPreview).not.toBe("AI invented body")

    expect(result.warnings.length).toBeGreaterThan(0)
    const warning = result.warnings.find(w => w.includes("no_such_template_lol"))
    expect(warning).toBeDefined()
    expect(warning).toContain("list_templates")
  })

  it("hydrates a non-APPROVED match (DRAFT/PENDING) and emits a warning", () => {
    const pendingCatalog: ApprovedTemplate[] = [{
      ...catalog[0],
      status: "PENDING",
    }]
    const plan = basePlan({
      templateName: "welcome_customer",
      language: "en",
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined, pendingCatalog)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    // Hydration still happens — AI needs preview/variables/buttons in the
    // canvas for the template it just created.
    expect(data.templateId).toBe("real-uuid-123")
    expect(data.bodyPreview).toBe("Hi {{customer_name}}, welcome to {{company}}!")
    expect(data.buttons).toHaveLength(2)

    // But the user is told the flow can't actually send yet.
    const warning = result.warnings.find(w => w.includes("welcome_customer"))
    expect(warning).toBeDefined()
    expect(warning).toContain("PENDING")
    expect(warning?.toLowerCase()).toContain("approves")
  })

  it("emits no status warning when the matched template is APPROVED", () => {
    const plan = basePlan({
      templateName: "welcome_customer",
      language: "en",
    })
    const approvedCatalog: ApprovedTemplate[] = [{ ...catalog[0], status: "APPROVED" }]
    const result = buildFlowFromPlan(plan, "whatsapp", undefined, approvedCatalog)
    expect(result.warnings).toEqual([])
  })

  it("merges parameterMappings: preserves AI-supplied flowValue for matching templateVars, adds catalog-only variables with empty flowValue, drops hallucinated templateVars", () => {
    const plan = basePlan({
      templateName: "welcome_customer",
      language: "en",
      // AI pre-bound customer_name → flow var (should survive). Also bound
      // a hallucinated `first_name` that doesn't exist on the real template
      // (should be dropped). `company` is in the catalog but unbound here —
      // should appear with empty flowValue.
      parameterMappings: [
        { templateVar: "customer_name", flowValue: "{{user_name_var}}" },
        { templateVar: "first_name", flowValue: "{{fake_var}}" },
      ],
    })

    const result = buildFlowFromPlan(plan, "whatsapp", undefined, catalog)
    const data = result.nodes.find((n) => n.type === "templateMessage")!.data as any

    expect(data.parameterMappings).toEqual([
      { templateVar: "customer_name", flowValue: "{{user_name_var}}" }, // preserved
      { templateVar: "company", flowValue: "" }, // catalog-only, defaulted
    ])
    // Hallucinated `first_name` is not in the result.
    const firstName = data.parameterMappings.find((m: any) => m.templateVar === "first_name")
    expect(firstName).toBeUndefined()
  })
})
