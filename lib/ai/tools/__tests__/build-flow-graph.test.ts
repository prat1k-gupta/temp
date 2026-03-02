import { describe, it, expect } from "vitest"
import { buildFlowGraphString } from "../generate-flow"
import type { Node, Edge } from "@xyflow/react"

function makeNode(id: string, type: string, data: Record<string, any> = {}): Node {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { platform: "whatsapp", label: data.label || type, ...data },
  }
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return {
    id: `e-${source}-${target}-${sourceHandle || "default"}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  }
}

describe("buildFlowGraphString", () => {
  it("returns (empty flow) for no nodes", () => {
    expect(buildFlowGraphString([], [])).toBe("(empty flow)")
  })

  it("shows a simple linear flow", () => {
    const nodes = [
      makeNode("1", "start", { label: "Start" }),
      makeNode("name-1", "name", { label: "Name", question: "What's your name?" }),
      makeNode("email-1", "email", { label: "Email" }),
    ]
    const edges = [
      makeEdge("1", "name-1"),
      makeEdge("name-1", "email-1"),
    ]
    const result = buildFlowGraphString(nodes, edges)
    expect(result).toContain("[1]")
    expect(result).toContain("[name-1]")
    expect(result).toContain("[email-1]")
    expect(result).toContain("What's your name?")
    expect(result).not.toContain("Disconnected")
  })

  it("shows button labels with handle IDs for quickReply nodes", () => {
    const nodes = [
      makeNode("1", "start", { label: "Start" }),
      makeNode("qr-1", "whatsappQuickReply", {
        label: "Quick Reply",
        question: "Choose one",
        buttons: [{ text: "Yes", id: "btn-0" }, { text: "No", id: "btn-1" }],
      }),
      makeNode("a-1", "address", { label: "Address" }),
      makeNode("m-1", "whatsappMessage", { label: "Message", text: "Thanks!" }),
    ]
    const edges = [
      makeEdge("1", "qr-1"),
      makeEdge("qr-1", "a-1", "button-0"),
      makeEdge("qr-1", "m-1", "button-1"),
    ]
    const result = buildFlowGraphString(nodes, edges)
    // Button list includes handle IDs
    expect(result).toContain('"Yes" (handle: btn-0)')
    expect(result).toContain('"No" (handle: btn-1)')
    // Edge labels include handle IDs
    expect(result).toContain('"Yes" [handle: button-0]')
    expect(result).toContain('"No" [handle: button-1]')
    expect(result).toContain("[a-1]")
    expect(result).toContain("[m-1]")
  })

  it("shows convergence with (see above)", () => {
    const nodes = [
      makeNode("1", "start", { label: "Start" }),
      makeNode("qr-1", "whatsappQuickReply", {
        label: "QR",
        buttons: [{ text: "A", id: "b0" }, { text: "B", id: "b1" }],
      }),
      makeNode("shared", "email", { label: "Email" }),
    ]
    const edges = [
      makeEdge("1", "qr-1"),
      makeEdge("qr-1", "shared", "button-0"),
      makeEdge("qr-1", "shared", "button-1"),
    ]
    const result = buildFlowGraphString(nodes, edges)
    expect(result).toContain("(see above)")
  })

  it("shows disconnected nodes", () => {
    const nodes = [
      makeNode("1", "start", { label: "Start" }),
      makeNode("name-1", "name", { label: "Name" }),
      makeNode("orphan", "email", { label: "Orphan Email" }),
    ]
    const edges = [
      makeEdge("1", "name-1"),
    ]
    const result = buildFlowGraphString(nodes, edges)
    expect(result).toContain("Disconnected Nodes:")
    expect(result).toContain("[orphan]")
  })

  it("detects cycles", () => {
    const nodes = [
      makeNode("1", "start", { label: "Start" }),
      makeNode("a", "name", { label: "A" }),
      makeNode("b", "email", { label: "B" }),
    ]
    const edges = [
      makeEdge("1", "a"),
      makeEdge("a", "b"),
      makeEdge("b", "a"), // cycle
    ]
    const result = buildFlowGraphString(nodes, edges)
    expect(result).toContain("(cycle)")
  })

  it("handles flow with only start node", () => {
    const nodes = [makeNode("1", "start", { label: "Start" })]
    const result = buildFlowGraphString(nodes, [])
    expect(result).toContain("[1]")
    expect(result).not.toContain("Disconnected")
  })

  it("handles real-world Pedigree flow with button ID sourceHandles", () => {
    // Real flow: start → name → email → question → quickReply(breed) → branches → question(gut) → address → quickReply(delivery) → messages → homeDelivery → ...
    const nodes = [
      makeNode("1", "start", { label: "Start" }),
      makeNode("plan-name-1", "name", { label: "Name", question: "What's your name?" }),
      makeNode("plan-email-2", "email", { label: "Email", question: "Can I have your email address?" }),
      makeNode("plan-question-3", "whatsappQuestion", { label: "WhatsApp Question", question: "How old is your dog?" }),
      makeNode("plan-quickReply-4", "whatsappQuickReply", {
        label: "WhatsApp Quick Reply",
        question: "What breed is your dog?",
        buttons: [
          { text: "Labrador", id: "btn-veh6x" },
          { text: "Beagle", id: "btn-y4htb" },
          { text: "Bulldog", id: "btn-eufq9" },
        ],
      }),
      makeNode("edit-quickReply-1", "whatsappQuickReply", {
        label: "WhatsApp Quick Reply",
        question: "Do you use any other brand besides Pedigree?",
        buttons: [
          { text: "Royal Canin", id: "btn-l592a" },
          { text: "Hill's Science", id: "btn-x6u49" },
          { text: "Other", id: "btn-44xlk" },
        ],
      }),
      makeNode("plan-question-5", "whatsappQuestion", { label: "WhatsApp Question", question: "Does your dog have any digestive or gut concerns?" }),
      makeNode("plan-address-6", "address", { label: "Address", question: "Please provide your full delivery address." }),
      makeNode("plan-quickReply-7", "whatsappQuickReply", {
        label: "WhatsApp Quick Reply",
        question: "Choose a delivery slot for your sample.",
        buttons: [
          { text: "Morning", id: "btn-sk9rt" },
          { text: "Afternoon", id: "btn-7ygro" },
          { text: "Evening", id: "btn-kgjn3" },
        ],
      }),
      makeNode("plan-whatsappMessage-8", "whatsappMessage", { label: "WhatsApp Message", text: "Morning slot confirmed!" }),
      makeNode("plan-whatsappMessage-9", "whatsappMessage", { label: "WhatsApp Message", text: "Afternoon slot confirmed!" }),
      makeNode("plan-whatsappMessage-10", "whatsappMessage", { label: "WhatsApp Message", text: "Evening slot confirmed!" }),
      makeNode("plan-homeDelivery-11", "homeDelivery", { label: "At-home Delivery" }),
      makeNode("plan-question-12", "whatsappQuestion", { label: "WhatsApp Question", question: "How would you rate your experience with the sample?" }),
      makeNode("plan-whatsappMessage-13", "whatsappMessage", { label: "WhatsApp Message", text: "Thank you for your feedback!" }),
      makeNode("plan-metaAudience-14", "metaAudience", { label: "Meta Audience" }),
    ]

    const edges = [
      makeEdge("1", "plan-name-1"),
      makeEdge("plan-name-1", "plan-email-2"),
      makeEdge("plan-email-2", "plan-question-3"),
      makeEdge("plan-question-3", "plan-quickReply-4"),
      // Breed buttons: Labrador & Beagle → question-5, Bulldog → brand quickReply
      makeEdge("plan-quickReply-4", "plan-question-5", "btn-veh6x"),
      makeEdge("plan-quickReply-4", "plan-question-5", "btn-y4htb"),
      makeEdge("plan-quickReply-4", "edit-quickReply-1", "button-2"),
      // Brand quickReply → gut concerns question
      makeEdge("edit-quickReply-1", "plan-question-5"),
      makeEdge("plan-question-5", "plan-address-6"),
      makeEdge("plan-address-6", "plan-quickReply-7"),
      // Delivery slot buttons
      makeEdge("plan-quickReply-7", "plan-whatsappMessage-8", "btn-sk9rt"),
      makeEdge("plan-quickReply-7", "plan-whatsappMessage-9", "btn-7ygro"),
      makeEdge("plan-quickReply-7", "plan-whatsappMessage-10", "btn-kgjn3"),
      makeEdge("plan-whatsappMessage-8", "plan-homeDelivery-11"),
      makeEdge("plan-whatsappMessage-9", "plan-homeDelivery-11"),
      makeEdge("plan-whatsappMessage-10", "plan-homeDelivery-11"),
      makeEdge("plan-homeDelivery-11", "plan-question-12"),
      makeEdge("plan-question-12", "plan-whatsappMessage-13"),
      makeEdge("plan-whatsappMessage-13", "plan-metaAudience-14"),
    ]

    const result = buildFlowGraphString(nodes, edges)

    // Tree should start from start node
    expect(result).toContain("[1]")

    // Should show the linear chain
    expect(result).toContain("[plan-name-1]")
    expect(result).toContain("[plan-email-2]")
    expect(result).toContain("[plan-question-3]")

    // Breed quickReply should show button labels with handle IDs
    expect(result).toContain('"Labrador" (handle: btn-veh6x)')
    expect(result).toContain('"Beagle" (handle: btn-y4htb)')
    expect(result).toContain('"Bulldog" (handle: btn-eufq9)')

    // Edge labels should show actual sourceHandle used
    expect(result).toContain('"Labrador" [handle: btn-veh6x]')
    expect(result).toContain('"Bulldog" [handle: button-2]')

    // Convergence: question-5 reached from multiple buttons
    expect(result).toContain("(see above)")

    // Brand quickReply buttons with handle IDs
    expect(result).toContain('"Royal Canin" (handle: btn-l592a)')
    expect(result).toContain('"Hill\'s Science" (handle: btn-x6u49)')

    // Delivery slot buttons with handle IDs
    expect(result).toContain('"Morning" (handle: btn-sk9rt)')
    expect(result).toContain('"Morning" [handle: btn-sk9rt]')

    // No disconnected nodes
    expect(result).not.toContain("Disconnected")

    // Snapshot the output for inspection
    console.log("--- Real flow tree output ---")
    console.log(result)
    console.log("--- End ---")
  })
})
