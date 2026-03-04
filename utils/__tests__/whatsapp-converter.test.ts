import { describe, it, expect } from "vitest"
import { convertToFsWhatsApp, convertFromFsWhatsApp, type FsWhatsAppFlow } from "../whatsapp-converter"
import type { Node, Edge } from "@xyflow/react"

// --- Test Helpers ---

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
    id: `e-${source}-${target}-${sourceHandle || ""}`,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  }
}

// --- Forward Conversion ---

describe("convertToFsWhatsApp", () => {
  it("returns empty steps when no start node", () => {
    const result = convertToFsWhatsApp([], [], "Test Flow")
    expect(result.name).toBe("Test Flow")
    expect(result.steps).toEqual([])
  })

  it("converts a simple linear flow (start → question → message)", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Ask Name", question: "What is your name?", storeAs: "user_name" }),
      node("m1", "whatsappMessage", { label: "Thanks", text: "Thank you!" }),
    ]
    const edges = [
      edge("start-1", "q1"),
      edge("q1", "m1"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Test Flow", "A test")
    expect(result.name).toBe("Test Flow")
    expect(result.description).toBe("A test")
    expect(result.enabled).toBe(true)
    expect(result.steps).toHaveLength(2)

    const step1 = result.steps[0]
    expect(step1.message).toBe("What is your name?")
    expect(step1.message_type).toBe("text")
    expect(step1.input_type).toBe("text")
    expect(step1.store_as).toBe("user_name")
    expect(step1.step_order).toBe(1)
    expect(step1.next_step).toBeDefined()

    const step2 = result.steps[1]
    expect(step2.message).toBe("Thank you!")
    expect(step2.message_type).toBe("text")
    expect(step2.input_type).toBe("none")
    expect(step2.store_as).toBeUndefined()
  })

  it("converts quick reply with button routing", () => {
    const nodes = [
      node("start-1", "start"),
      node("qr1", "whatsappQuickReply", {
        label: "Pick Color",
        question: "What color?",
        storeAs: "color_choice",
        buttons: [
          { id: "btn-red", text: "Red" },
          { id: "btn-blue", text: "Blue" },
        ],
      }),
      node("m-red", "whatsappMessage", { label: "Red chosen", text: "You picked red!" }),
      node("m-blue", "whatsappMessage", { label: "Blue chosen", text: "You picked blue!" }),
    ]
    const edges = [
      edge("start-1", "qr1"),
      edge("qr1", "m-red", "btn-red"),
      edge("qr1", "m-blue", "btn-blue"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Color Flow")
    expect(result.steps).toHaveLength(3)

    const qrStep = result.steps[0]
    expect(qrStep.message_type).toBe("buttons")
    expect(qrStep.input_type).toBe("button")
    expect(qrStep.buttons).toHaveLength(2)
    expect(qrStep.buttons![0].title).toBe("Red")
    expect(qrStep.buttons![1].title).toBe("Blue")
    expect(qrStep.conditional_next).toBeDefined()
    expect(qrStep.conditional_next!["btn-red"]).toBeDefined()
    expect(qrStep.conditional_next!["btn-blue"]).toBeDefined()
    expect(qrStep.store_as).toBe("color_choice")
  })

  it("converts interactive list with option routing", () => {
    const nodes = [
      node("start-1", "start"),
      node("list1", "whatsappInteractiveList", {
        label: "Pick Fruit",
        question: "Choose a fruit",
        options: [
          { id: "opt-apple", text: "Apple" },
          { id: "opt-banana", text: "Banana" },
        ],
      }),
      node("m1", "whatsappMessage", { label: "Apple", text: "Apple selected" }),
      node("m2", "whatsappMessage", { label: "Banana", text: "Banana selected" }),
    ]
    const edges = [
      edge("start-1", "list1"),
      edge("list1", "m1", "opt-apple"),
      edge("list1", "m2", "opt-banana"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Fruit Flow")
    const listStep = result.steps[0]
    expect(listStep.message_type).toBe("buttons")
    expect(listStep.input_type).toBe("select")
    expect(listStep.buttons).toHaveLength(2)
    expect(listStep.conditional_next).toBeDefined()
    expect(listStep.conditional_next!["opt-apple"]).toBeDefined()
  })

  it("converts super nodes with correct input types", () => {
    const nodes = [
      node("start-1", "start"),
      node("n1", "name", { label: "Name", question: "Your name?", storeAs: "user_name" }),
      node("e1", "email", { label: "Email", question: "Your email?", storeAs: "user_email" }),
      node("d1", "dob", { label: "DOB", question: "Your DOB?", storeAs: "user_dob" }),
    ]
    const edges = [
      edge("start-1", "n1"),
      edge("n1", "e1"),
      edge("e1", "d1"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Super Nodes")
    expect(result.steps).toHaveLength(3)
    expect(result.steps[0].input_type).toBe("text")
    expect(result.steps[0].store_as).toBe("user_name")
    expect(result.steps[1].input_type).toBe("email")
    expect(result.steps[1].store_as).toBe("user_email")
    expect(result.steps[2].input_type).toBe("date")
    expect(result.steps[2].store_as).toBe("user_dob")
  })

  it("converts condition node with groups and else", () => {
    const nodes = [
      node("start-1", "start"),
      node("cond1", "condition", {
        label: "Check Age",
        conditionGroups: [
          { id: "group-1", label: "Adult", logic: "AND", rules: [{ field: "age", operator: ">=", value: "18" }] },
          { id: "group-2", label: "Minor", logic: "AND", rules: [{ field: "age", operator: "<", value: "18" }] },
        ],
      }),
      node("m-adult", "whatsappMessage", { label: "Adult", text: "You are an adult" }),
      node("m-minor", "whatsappMessage", { label: "Minor", text: "You are a minor" }),
      node("m-else", "whatsappMessage", { label: "Fallback", text: "Unknown age" }),
    ]
    const edges = [
      edge("start-1", "cond1"),
      edge("cond1", "m-adult", "group-1"),
      edge("cond1", "m-minor", "group-2"),
      edge("cond1", "m-else", "else"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Condition Flow")
    const condStep = result.steps[0]
    expect(condStep.message_type).toBe("conditional_routing")
    expect(condStep.input_type).toBe("none")
    expect(condStep.conditional_routes).toHaveLength(3) // 2 groups + 1 default catch-all
    expect(condStep.conditional_routes![0].target).toBeDefined()
    expect(condStep.next_step).toBeDefined() // else branch
  })

  it("applies validation presets per input type", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Answer?" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "Validation Test")
    const step = result.steps[0]
    expect(step.validation_regex).toBeDefined()
    expect(step.validation_error).toBe("Please enter a valid response")
    expect(step.retry_on_invalid).toBe(true)
    expect(step.max_retries).toBe(3)
  })

  it("generates panel_config from steps with store_as", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Name?", storeAs: "user_name" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "Panel Config Test")
    expect(result.panel_config).toBeDefined()
    expect(result.panel_config!["user_name"]).toBeDefined()
    expect(result.panel_config!["user_name"].input_type).toBe("text")
  })

  it("skips comment and start nodes", () => {
    const nodes = [
      node("start-1", "start"),
      node("c1", "comment", { comment: "This is a note" }),
      node("q1", "whatsappQuestion", { label: "Q", question: "What?" }),
    ]
    const edges = [
      edge("start-1", "q1"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Skip Test")
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0].message).toBe("What?")
  })

  it("generates unique step names", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1-abc123", "whatsappQuestion", { label: "Question", question: "Q1?" }),
      node("q2-def456", "whatsappQuestion", { label: "Question", question: "Q2?" }),
    ]
    const edges = [
      edge("start-1", "q1-abc123"),
      edge("q1-abc123", "q2-def456"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Unique Names")
    const names = result.steps.map((s) => s.step_name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("includes trigger_keywords when triggerIds provided", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Hi?" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "Trigger Test", undefined, ["whatsapp-message", "whatsapp-ctwa"])
    // triggerIds determine activation type, not keywords — so they are not mapped
    expect(result.trigger_keywords).toBeUndefined()
  })

  it("omits trigger_keywords when no triggerIds and no custom keywords", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Hi?" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "No Trigger Test")
    expect(result.trigger_keywords).toBeUndefined()
  })

  it("merges custom triggerKeywords with mapped triggerIds", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Hi?" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "Merge Test", undefined, ["whatsapp-message"], ["hi", "hello", "menu"])
    // Only custom triggerKeywords are used; triggerIds are not mapped to keywords
    expect(result.trigger_keywords).toEqual(["hi", "hello", "menu"])
  })

  it("includes only custom triggerKeywords when no triggerIds", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Hi?" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "Custom Only", undefined, undefined, ["start", "begin"])
    expect(result.trigger_keywords).toEqual(["start", "begin"])
  })

  it("deduplicates custom keywords that overlap with mapped ones", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Q", question: "Hi?" }),
    ]
    const edges = [edge("start-1", "q1")]

    const result = convertToFsWhatsApp(nodes, edges, "Dedup Test", undefined, ["whatsapp-message"], ["message", "hi"])
    expect(result.trigger_keywords).toEqual(["message", "hi"])
  })

  it("uses question text for step names instead of label", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1-abc123", "whatsappQuestion", { label: "Ask Name", question: "What is your name?" }),
    ]
    const edges = [edge("start-1", "q1-abc123")]

    const result = convertToFsWhatsApp(nodes, edges, "Step Name Test")
    expect(result.steps[0].step_name).toContain("what_is_your_name")
  })

  it("handles quick reply next-step fallthrough", () => {
    const nodes = [
      node("start-1", "start"),
      node("qr1", "whatsappQuickReply", {
        label: "QR",
        question: "Pick one",
        buttons: [{ id: "btn-a", text: "A" }],
      }),
      node("m1", "whatsappMessage", { label: "Next", text: "After QR" }),
    ]
    const edges = [
      edge("start-1", "qr1"),
      edge("qr1", "m1", "next-step"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Fallthrough Test")
    const qrStep = result.steps[0]
    expect(qrStep.next_step).toBeDefined()
  })
})

// --- Reverse Conversion ---

describe("convertFromFsWhatsApp", () => {
  it("creates start node and step nodes", () => {
    const flow: FsWhatsAppFlow = {
      name: "Test",
      steps: [
        {
          step_name: "ask_name",
          step_order: 1,
          message: "What is your name?",
          message_type: "text",
          input_type: "text",
          store_as: "user_name",
        },
        {
          step_name: "thanks",
          step_order: 2,
          message: "Thank you!",
          message_type: "text",
          input_type: "none",
        },
      ],
    }

    const { nodes, edges } = convertFromFsWhatsApp(flow)
    expect(nodes).toHaveLength(3) // start + 2 steps
    expect(nodes[0].type).toBe("start")
    expect(nodes[1].type).toBe("whatsappQuestion")
    expect(nodes[1].data.storeAs).toBe("user_name")
    expect(nodes[2].type).toBe("whatsappMessage")

    // start → first step edge
    expect(edges.length).toBeGreaterThanOrEqual(1)
    expect(edges[0].source).toBe(nodes[0].id)
    expect(edges[0].target).toBe(nodes[1].id)
  })

  it("creates quick reply nodes from button steps", () => {
    const flow: FsWhatsAppFlow = {
      name: "Button Flow",
      steps: [
        {
          step_name: "pick_color",
          step_order: 1,
          message: "Pick a color",
          message_type: "buttons",
          input_type: "button",
          buttons: [
            { id: "btn-red", title: "Red" },
            { id: "btn-blue", title: "Blue" },
          ],
          conditional_next: {
            Red: "red_msg",
            Blue: "blue_msg",
          },
        },
        {
          step_name: "red_msg",
          step_order: 2,
          message: "Red picked!",
          message_type: "text",
          input_type: "none",
        },
        {
          step_name: "blue_msg",
          step_order: 3,
          message: "Blue picked!",
          message_type: "text",
          input_type: "none",
        },
      ],
    }

    const { nodes, edges } = convertFromFsWhatsApp(flow)
    expect(nodes).toHaveLength(4) // start + 3
    expect(nodes[1].type).toBe("whatsappQuickReply")
    expect((nodes[1].data.buttons as any[]).length).toBe(2)

    // Should have edges for conditional routing
    const buttonEdges = edges.filter((e) => e.sourceHandle)
    expect(buttonEdges.length).toBeGreaterThanOrEqual(1)
  })

  it("creates list nodes from select steps", () => {
    const flow: FsWhatsAppFlow = {
      name: "List Flow",
      steps: [
        {
          step_name: "pick_fruit",
          step_order: 1,
          message: "Pick a fruit",
          message_type: "buttons",
          input_type: "select",
          buttons: [
            { id: "opt-apple", title: "Apple" },
            { id: "opt-banana", title: "Banana" },
          ],
        },
      ],
    }

    const { nodes } = convertFromFsWhatsApp(flow)
    expect(nodes[1].type).toBe("whatsappInteractiveList")
    expect((nodes[1].data.options as any[]).length).toBe(2)
  })

  it("creates condition nodes from conditional_routing steps", () => {
    const flow: FsWhatsAppFlow = {
      name: "Condition Flow",
      steps: [
        {
          step_name: "check_age",
          step_order: 1,
          message: "Check Age",
          message_type: "conditional_routing",
          input_type: "none",
          conditional_routes: [
            { operator: "AND", value: "age >= 18", target: "adult_msg" },
          ],
          next_step: "fallback_msg",
        },
        {
          step_name: "adult_msg",
          step_order: 2,
          message: "Welcome adult",
          message_type: "text",
          input_type: "none",
        },
        {
          step_name: "fallback_msg",
          step_order: 3,
          message: "Fallback",
          message_type: "text",
          input_type: "none",
        },
      ],
    }

    const { nodes, edges } = convertFromFsWhatsApp(flow)
    expect(nodes[1].type).toBe("condition")
    expect((nodes[1].data.conditionGroups as any[]).length).toBe(1)

    // Should have edges for conditional route + next_step (else)
    const condEdges = edges.filter((e) => e.source === nodes[1].id)
    expect(condEdges.length).toBeGreaterThanOrEqual(1)
  })

  it("handles empty flow", () => {
    const flow: FsWhatsAppFlow = { name: "Empty", steps: [] }
    const { nodes, edges } = convertFromFsWhatsApp(flow)
    expect(nodes).toHaveLength(1) // just start
    expect(edges).toHaveLength(0)
  })

  it("positions nodes vertically with spacing", () => {
    const flow: FsWhatsAppFlow = {
      name: "Spaced",
      steps: [
        { step_name: "s1", step_order: 1, message: "A", message_type: "text", input_type: "text" },
        { step_name: "s2", step_order: 2, message: "B", message_type: "text", input_type: "text" },
        { step_name: "s3", step_order: 3, message: "C", message_type: "text", input_type: "text" },
      ],
    }

    const { nodes } = convertFromFsWhatsApp(flow)
    // Start + 3 step nodes, each should have increasing y
    for (let i = 1; i < nodes.length - 1; i++) {
      expect(nodes[i + 1].position.y).toBeGreaterThan(nodes[i].position.y)
    }
  })
})

// --- Round-trip ---

describe("round-trip conversion", () => {
  it("forward then reverse preserves step count and types", () => {
    const nodes = [
      node("start-1", "start"),
      node("q1", "whatsappQuestion", { label: "Ask", question: "What?", storeAs: "answer" }),
      node("m1", "whatsappMessage", { label: "Reply", text: "Thanks!" }),
    ]
    const edges = [
      edge("start-1", "q1"),
      edge("q1", "m1"),
    ]

    const fsFlow = convertToFsWhatsApp(nodes, edges, "Round Trip")
    expect(fsFlow.steps).toHaveLength(2)

    const { nodes: rtNodes } = convertFromFsWhatsApp(fsFlow)
    // start + same number of steps
    expect(rtNodes).toHaveLength(3)
    expect(rtNodes[1].type).toBe("whatsappQuestion")
    expect(rtNodes[2].type).toBe("whatsappMessage")
    expect(rtNodes[1].data.storeAs).toBe("answer")
  })

  it("converts template message node with parameter mappings", () => {
    const nodes = [
      node("start-1", "start"),
      node("tpl1", "templateMessage", {
        label: "Order Confirm",
        templateName: "order_confirmation",
        language: "en",
        category: "UTILITY",
        parameterMappings: [
          { templateVar: "1", flowValue: "{{customer_name}}" },
          { templateVar: "2", flowValue: "{{order_id}}" },
        ],
      }),
      node("m1", "whatsappMessage", { text: "Thanks!" }),
    ]
    const edges = [
      edge("start-1", "tpl1"),
      edge("tpl1", "m1", "next-step"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Template Flow")
    expect(result.steps).toHaveLength(2)

    const tplStep = result.steps[0]
    expect(tplStep.message_type).toBe("template")
    expect(tplStep.input_type).toBe("button") // always wait for user reply (24h window)
    expect(tplStep.message).toBe("order_confirmation")
    expect(tplStep.input_config).toBeDefined()
    expect(tplStep.input_config!.template_name).toBe("order_confirmation")
    expect(tplStep.input_config!.language).toBe("en")
    expect(tplStep.input_config!.body_parameters).toEqual(["{{customer_name}}", "{{order_id}}"])
    expect(tplStep.next_step).toBeDefined()
    expect(tplStep.next_step).not.toBe("__complete__")
  })

  it("converts template message node with no params", () => {
    const nodes = [
      node("start-1", "start"),
      node("tpl1", "templateMessage", {
        label: "Welcome",
        templateName: "welcome_msg",
        language: "en",
        parameterMappings: [],
      }),
    ]
    const edges = [
      edge("start-1", "tpl1"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Simple Template")
    expect(result.steps).toHaveLength(1)

    const tplStep = result.steps[0]
    expect(tplStep.message_type).toBe("template")
    expect(tplStep.input_config!.body_parameters).toEqual([])
    expect(tplStep.next_step).toBe("__complete__")
  })

  it("converts template message node with quick reply buttons", () => {
    const nodes = [
      node("start-1", "start"),
      node("tpl1", "templateMessage", {
        label: "Promo",
        templateName: "promo_offer",
        language: "en",
        buttons: [
          { id: "btn-0", type: "quick_reply", text: "Yes" },
          { id: "btn-1", type: "quick_reply", text: "No" },
          { id: "btn-url", type: "url", text: "Learn More", url: "https://example.com" },
        ],
        parameterMappings: [],
      }),
      node("m1", "whatsappMessage", { text: "Great!" }),
      node("m2", "whatsappMessage", { text: "Maybe next time." }),
    ]
    const edges = [
      edge("start-1", "tpl1"),
      edge("tpl1", "m1", "btn-0"),
      edge("tpl1", "m2", "btn-1"),
    ]

    const result = convertToFsWhatsApp(nodes, edges, "Promo Flow")
    const tplStep = result.steps[0]
    expect(tplStep.message_type).toBe("template")
    expect(tplStep.input_type).toBe("button") // processor must wait for quick reply response
    expect(tplStep.buttons).toHaveLength(3) // all buttons including URL
    expect(tplStep.buttons![0].title).toBe("Yes")
    expect(tplStep.buttons![0].type).toBe("reply")
    expect(tplStep.buttons![1].title).toBe("No")
    expect(tplStep.buttons![1].type).toBe("reply")
    expect(tplStep.buttons![2].title).toBe("Learn More")
    expect(tplStep.buttons![2].type).toBe("url")
    expect(tplStep.conditional_next).toBeDefined()
    // Template conditional_next is keyed by button TEXT (not ID) because
    // WhatsApp template quick reply responses send button text as payload
    expect(tplStep.conditional_next!["Yes"]).toBeDefined()
    expect(tplStep.conditional_next!["No"]).toBeDefined()
  })
})
