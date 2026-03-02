import { describe, it, expect } from "vitest"
import {
  buildFlowFromPlan,
  buildEditFlowFromPlan,
  contentToNodeData,
  isNodeTypeValidForPlatform,
} from "../flow-plan-builder"
import type { FlowPlan, EditFlowPlan } from "@/types/flow-plan"
import type { Platform, ButtonData, OptionData } from "@/types"
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
  it("converts string buttons to ButtonData[]", () => {
    const data = contentToNodeData(
      { buttons: ["Yes", "No", "Maybe"] },
      "quickReply"
    )
    const buttons = data.buttons as ButtonData[]
    expect(buttons).toHaveLength(3)
    expect(buttons[0].text).toBe("Yes")
    expect(buttons[1].text).toBe("No")
    expect(buttons[2].text).toBe("Maybe")
  })

  it("converts string options to OptionData[]", () => {
    const data = contentToNodeData(
      { options: ["Shampoo", "Conditioner"] },
      "interactiveList"
    )
    const options = data.options as OptionData[]
    expect(options).toHaveLength(2)
    expect(options[0].text).toBe("Shampoo")
    expect(options[1].text).toBe("Conditioner")
  })

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
            buttons: ["A", "B"],
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

    // Find branch edges by looking at the quickReply node's button IDs
    const qrNode = nodes.find((n) => n.id.includes("quickReply"))
    const buttons = qrNode?.data?.buttons as ButtonData[]
    expect(buttons).toHaveLength(2)

    const branchEdge0 = edges.find((e) => e.sourceHandle === buttons[0].id)
    const branchEdge1 = edges.find((e) => e.sourceHandle === buttons[1].id)

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
          content: { question: "Pick", buttons: ["A", "B", "C", "D"] },
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
          content: { question: "Level 1", buttons: ["Go"] },
        },
        {
          step: "branch",
          buttonIndex: 0,
          steps: [
            {
              step: "node",
              nodeType: "quickReply",
              content: { question: "Level 2", buttons: ["Deeper"] },
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

    // Both branch edges should have sourceHandle (stable btn- IDs)
    const branchEdges = edges.filter((e) => e.sourceHandle?.startsWith("btn-"))
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

  it("creates super nodes with factory defaults + validation rules", () => {
    const plan = linearPlan(["name"])
    const { nodes } = buildFlowFromPlan(plan, "web")
    expect(nodes[0].type).toBe("name")
    expect(nodes[0].data.validationRules).toBeDefined()
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
          content: { question: "Pick", buttons: ["A", "B"] },
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
          content: { question: "Pick a slot", buttons: ["Morning", "Afternoon", "Evening"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "homeDelivery" }] },
        { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "homeDelivery" }] },
        { step: "branch", buttonIndex: 2, steps: [{ step: "node", nodeType: "homeDelivery" }] },
        // Shared convergence node — should get edges from all 3 branch endpoints
        { step: "node", nodeType: "question", content: { question: "Rate us" } },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "whatsapp")
    const quickReplyId = "plan-quickReply-1"
    const questionNode = nodes.find((n) => n.id.includes("question"))
    expect(questionNode).toBeDefined()

    // 3 button edges from quickReply (using stable btn- IDs)
    const edgesFromQR = edges.filter((e) => e.source === quickReplyId)
    expect(edgesFromQR).toHaveLength(3)
    edgesFromQR.forEach((e) => {
      expect(e.sourceHandle).toMatch(/^btn-/)
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
          content: { question: "Pick", buttons: ["A"] },
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
          content: { question: "Choose", buttons: ["A"] },
        },
        { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "name" }] },
      ],
    }

    const { nodes, edges } = buildFlowFromPlan(plan, "web")
    const quickReplyId = "plan-quickReply-1"
    const qrNode = nodes.find((n) => n.id === quickReplyId)
    const buttons = qrNode?.data?.buttons as ButtonData[]

    // Only one edge from quickReply's first button (stable ID)
    const btn0Edges = edges.filter(
      (e) => e.source === quickReplyId && e.sourceHandle === buttons[0].id
    )
    expect(btn0Edges).toHaveLength(1)
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
            buttons: ["Dandruff", "Oily Hair", "Hair Loss"],
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

    // Check edges include sourceHandle branches (stable btn- IDs)
    const branchEdges = edges.filter((e) => e.sourceHandle?.startsWith("btn-"))
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
          content: { question: "Rate us", buttons: ["Good", "Okay", "Bad"] },
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
    // Each should use a stable button ID
    const buttons = qrNode!.data.buttons as ButtonData[]
    expect(edgesFromQR.map((e) => e.sourceHandle).sort()).toEqual(
      buttons.map((b) => b.id).sort()
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
          content: { question: "Pick", buttons: ["A", "B"] },
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
          content: { question: "Pick", buttons: ["A", "B"] },
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
          content: { question: "Pick", buttons: ["A", "B"] },
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
  it("resolves attachHandle 'button-N' to actual button ID from anchor node", () => {
    // Simulate: existing quickReply node with real button IDs
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "whatsapp",
          label: "Breed",
          question: "What breed?",
          buttons: [
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

  it("keeps attachHandle as-is when it is already a button ID", () => {
    const existingNodes = [
      {
        id: "qr-1",
        type: "whatsappQuickReply",
        position: { x: 100, y: 100 },
        data: {
          platform: "whatsapp",
          buttons: [
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
})
