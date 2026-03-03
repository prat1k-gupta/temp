import type { Node, Edge } from "@xyflow/react"
import type { WhatsAppInputType } from "@/types"
import { getImplicitInputType, VALIDATION_PRESETS } from "@/utils/validation-presets"

// --- Types matching fs-whatsapp Go models ---

export interface FsWhatsAppFlowStep {
  step_name: string
  step_order: number
  message: string
  message_type: "text" | "buttons" | "conditional_routing"
  input_type: WhatsAppInputType
  buttons?: Array<{ id: string; title: string }>
  store_as?: string
  validation_regex?: string
  validation_error?: string
  retry_on_invalid?: boolean
  max_retries?: number
  next_step?: string
  conditional_next?: Record<string, string>
  conditional_routes?: Array<{ operator: string; value: string; target: string }>
}

export interface FsWhatsAppFlow {
  name: string
  description?: string
  trigger_keywords?: string[]
  initial_message?: string
  completion_message?: string
  enabled?: boolean
  panel_config?: Record<string, any>
  steps: FsWhatsAppFlowStep[]
}

// --- Helpers ---

function sanitizeStepName(label: string, idSuffix: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return `${slug || "step"}_${idSuffix}`
}

function getIdSuffix(nodeId: string): string {
  return nodeId.slice(-6)
}

type EdgeMap = Map<string, string> // "sourceId_handleId" → targetId

function buildEdgeMap(edges: Edge[]): EdgeMap {
  const map = new Map<string, string>()
  for (const edge of edges) {
    const handle = edge.sourceHandle || ""
    const key = `${edge.source}_${handle}`
    map.set(key, edge.target)
  }
  return map
}

function resolveNextStep(
  nodeId: string,
  handleId: string,
  edgeMap: EdgeMap,
  nodeStepNames: Map<string, string>
): string | undefined {
  const targetId = edgeMap.get(`${nodeId}_${handleId}`)
  if (!targetId) return undefined
  return nodeStepNames.get(targetId)
}

const SKIP_NODE_TYPES = new Set(["start", "comment"])

// --- Forward Conversion: magicflow → fs-whatsapp ---

/**
 * Maps magicflow trigger IDs to fs-whatsapp trigger keywords.
 */
function mapTriggerKeywords(triggerIds?: string[]): string[] | undefined {
  if (!triggerIds || triggerIds.length === 0) return undefined
  const TRIGGER_KEYWORD_MAP: Record<string, string> = {
    "whatsapp-message": "message",
    "whatsapp-ctwa": "ctwa",
    "whatsapp-url": "url",
  }
  const keywords = triggerIds
    .map((id) => TRIGGER_KEYWORD_MAP[id])
    .filter(Boolean)
  return keywords.length > 0 ? keywords : undefined
}

export function convertToFsWhatsApp(
  nodes: Node[],
  edges: Edge[],
  flowName: string,
  flowDescription?: string,
  triggerIds?: string[],
  triggerKeywords?: string[]
): FsWhatsAppFlow {
  const edgeMap = buildEdgeMap(edges)

  // Find start node
  const startNode = nodes.find((n) => n.type === "start")
  if (!startNode) {
    return {
      name: flowName,
      description: flowDescription,
      steps: [],
    }
  }

  // Build node lookup
  const nodeMap = new Map<string, Node>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // DFS from start to determine traversal order
  const visited = new Set<string>()
  const ordered: Node[] = []

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return

    if (!SKIP_NODE_TYPES.has(node.type || "")) {
      ordered.push(node)
    }

    // Find all outgoing edges from this node
    for (const [key, targetId] of edgeMap.entries()) {
      if (key.startsWith(`${nodeId}_`)) {
        dfs(targetId)
      }
    }
  }

  // Start DFS from start node's first target
  const startTarget = edgeMap.get(`${startNode.id}_`)
  if (startTarget) {
    dfs(startTarget)
  }

  // Pre-compute step names for all ordered nodes
  // Use question text first for better identification, then label, then type
  const nodeStepNames = new Map<string, string>()
  for (const node of ordered) {
    const data = node.data as Record<string, any>
    const text = data.question || data.text || data.label || node.type || "step"
    const stepName = sanitizeStepName(text, getIdSuffix(node.id))
    nodeStepNames.set(node.id, stepName)
  }

  // Convert each node to a step
  const steps: FsWhatsAppFlowStep[] = []
  const panelConfig: Record<string, any> = {}

  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i]
    const data = node.data as Record<string, any>
    const nodeType = node.type || ""
    const stepName = nodeStepNames.get(node.id)!
    const inputType = getImplicitInputType(nodeType)
    const validation = VALIDATION_PRESETS[inputType]

    const step: FsWhatsAppFlowStep = {
      step_name: stepName,
      step_order: i + 1,
      message: data.question || data.text || data.message || "",
      message_type: "text",
      input_type: inputType,
    }

    // Apply storeAs
    if (data.storeAs) {
      step.store_as = data.storeAs
      panelConfig[data.storeAs] = { step: stepName, input_type: inputType }
    }

    // Apply validation presets
    if (validation.regex) step.validation_regex = validation.regex
    if (validation.errorMessage) step.validation_error = validation.errorMessage
    if (validation.retryOnInvalid) step.retry_on_invalid = validation.retryOnInvalid
    if (validation.maxRetries) step.max_retries = validation.maxRetries

    // Type-specific conversion
    switch (nodeType) {
      case "whatsappQuestion":
      case "question": {
        step.message_type = "text"
        // Default edge → next_step
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "whatsappQuickReply":
      case "quickReply": {
        step.message_type = "buttons"
        const buttons = (data.buttons || []) as Array<{ id?: string; text?: string; label?: string }>
        step.buttons = buttons.map((btn, idx) => ({
          id: btn.id || `btn-${idx}`,
          title: btn.text || btn.label || `Button ${idx + 1}`,
        }))

        // Button handle edges → conditional_next
        const conditionalNext: Record<string, string> = {}
        for (const btn of buttons) {
          const btnId = btn.id || ""
          const target = resolveNextStep(node.id, btnId, edgeMap, nodeStepNames)
          if (target) {
            conditionalNext[btn.text || btn.label || btnId] = target
          }
        }
        if (Object.keys(conditionalNext).length > 0) {
          step.conditional_next = conditionalNext
        }

        // next-step handle → fallthrough next_step
        step.next_step = resolveNextStep(node.id, "next-step", edgeMap, nodeStepNames)
        break
      }

      case "whatsappInteractiveList":
      case "interactiveList": {
        step.message_type = "buttons"
        const options = (data.options || []) as Array<{ id?: string; text?: string }>
        step.buttons = options.map((opt, idx) => ({
          id: opt.id || `opt-${idx}`,
          title: opt.text || `Option ${idx + 1}`,
        }))

        // Option handle edges → conditional_next
        const conditionalNext: Record<string, string> = {}
        for (const opt of options) {
          const optId = opt.id || ""
          const target = resolveNextStep(node.id, optId, edgeMap, nodeStepNames)
          if (target) {
            conditionalNext[opt.text || optId] = target
          }
        }
        if (Object.keys(conditionalNext).length > 0) {
          step.conditional_next = conditionalNext
        }

        // next-step handle → fallthrough next_step
        step.next_step = resolveNextStep(node.id, "next-step", edgeMap, nodeStepNames)
        break
      }

      case "whatsappMessage":
      case "message": {
        step.message_type = "text"
        step.message = data.text || ""
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "name":
      case "email":
      case "dob":
      case "address": {
        step.message_type = "text"
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "condition": {
        step.message_type = "conditional_routing"
        step.input_type = "none"
        step.message = data.label || "Condition"

        // Group handle edges → conditional_routes
        const groups = (data.conditionGroups || []) as Array<{
          id: string
          label: string
          logic: string
          rules: Array<{ field?: string; operator?: string; value?: string }>
        }>

        const conditionalRoutes: Array<{ operator: string; value: string; target: string }> = []
        for (const group of groups) {
          const target = resolveNextStep(node.id, group.id, edgeMap, nodeStepNames)
          if (target) {
            // Flatten group rules into a single operator/value representation
            const operator = group.logic || "AND"
            const value = group.rules
              .map((r) => `${r.field || ""} ${r.operator || "=="} ${r.value || ""}`)
              .join(` ${operator} `)
            conditionalRoutes.push({ operator, value: value || group.label, target })
          }
        }
        if (conditionalRoutes.length > 0) {
          step.conditional_routes = conditionalRoutes
        }

        // else handle → next_step
        step.next_step = resolveNextStep(node.id, "else", edgeMap, nodeStepNames)
        break
      }

      default: {
        // Generic fallback
        step.message_type = "text"
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }
    }

    steps.push(step)
  }

  // Merge mapped trigger type keywords with custom trigger keywords
  const mappedKeywords = mapTriggerKeywords(triggerIds) || []
  const customKeywords = (triggerKeywords || []).filter(k => !mappedKeywords.includes(k))
  const allKeywords = [...mappedKeywords, ...customKeywords]

  const flow: FsWhatsAppFlow = {
    name: flowName,
    description: flowDescription,
    trigger_keywords: allKeywords.length > 0 ? allKeywords : undefined,
    enabled: true,
    steps,
  }

  if (Object.keys(panelConfig).length > 0) {
    flow.panel_config = panelConfig
  }

  return flow
}

// --- Reverse Conversion: fs-whatsapp → magicflow ---

export function convertFromFsWhatsApp(flow: FsWhatsAppFlow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const VERTICAL_SPACING = 200
  const START_X = 200
  const START_Y = 100

  // Create start node
  const startNodeId = "start-1"
  nodes.push({
    id: startNodeId,
    type: "start",
    position: { x: START_X, y: START_Y },
    data: { platform: "whatsapp" as const, label: "Start" },
  })

  // Build step name → generated node ID map
  const stepNodeMap = new Map<string, string>()

  // Create nodes from steps
  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i]
    const nodeId = `node-${i + 1}-${Date.now()}-${i}`
    stepNodeMap.set(step.step_name, nodeId)

    const y = START_Y + (i + 1) * VERTICAL_SPACING
    const position = { x: START_X, y }

    const nodeType = inferNodeType(step)

    const data: Record<string, any> = {
      platform: "whatsapp" as const,
      label: step.step_name.replace(/_[a-z0-9]{6}$/, "").replace(/_/g, " "),
    }

    if (step.store_as) {
      data.storeAs = step.store_as
    }

    switch (nodeType) {
      case "whatsappQuestion":
        data.question = step.message
        break
      case "whatsappQuickReply":
        data.question = step.message
        data.buttons = (step.buttons || []).map((btn) => ({
          id: btn.id,
          text: btn.title,
          label: btn.title,
          value: btn.title.toLowerCase().replace(/\s+/g, "_"),
        }))
        break
      case "whatsappInteractiveList":
        data.question = step.message
        data.options = (step.buttons || []).map((btn) => ({
          id: btn.id,
          text: btn.title,
        }))
        break
      case "whatsappMessage":
        data.text = step.message
        break
      case "condition":
        data.conditionLogic = "AND"
        data.conditionGroups = (step.conditional_routes || []).map((route, idx) => ({
          id: `group-${idx + 1}`,
          label: route.value,
          logic: route.operator,
          rules: [],
        }))
        break
    }

    nodes.push({ id: nodeId, type: nodeType, position, data })
  }

  // Connect start to first step
  if (flow.steps.length > 0) {
    const firstStepId = stepNodeMap.get(flow.steps[0].step_name)
    if (firstStepId) {
      edges.push({
        id: `edge-start-${firstStepId}`,
        source: startNodeId,
        target: firstStepId,
        style: { stroke: "#6366f1", strokeWidth: 2 },
      })
    }
  }

  // Create edges from step routing
  for (const step of flow.steps) {
    const sourceId = stepNodeMap.get(step.step_name)
    if (!sourceId) continue

    // next_step → default edge
    if (step.next_step) {
      const targetId = stepNodeMap.get(step.next_step)
      if (targetId) {
        edges.push({
          id: `edge-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      }
    }

    // conditional_next → button/option edges
    if (step.conditional_next) {
      const buttons = step.buttons || []
      for (const [label, targetStepName] of Object.entries(step.conditional_next)) {
        const targetId = stepNodeMap.get(targetStepName)
        if (!targetId) continue
        const btn = buttons.find((b) => b.title === label)
        const handleId = btn?.id || ""
        edges.push({
          id: `edge-${sourceId}-${handleId}-${targetId}`,
          source: sourceId,
          sourceHandle: handleId,
          target: targetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      }
    }

    // conditional_routes → condition group edges
    if (step.conditional_routes) {
      step.conditional_routes.forEach((route, idx) => {
        const targetId = stepNodeMap.get(route.target)
        if (!targetId) return
        edges.push({
          id: `edge-${sourceId}-group-${idx + 1}-${targetId}`,
          source: sourceId,
          sourceHandle: `group-${idx + 1}`,
          target: targetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      })
    }
  }

  return { nodes, edges }
}

function inferNodeType(step: FsWhatsAppFlowStep): string {
  if (step.message_type === "conditional_routing") return "condition"
  if (step.message_type === "buttons") {
    if (step.input_type === "select") return "whatsappInteractiveList"
    return "whatsappQuickReply"
  }
  if (step.input_type === "none") return "whatsappMessage"
  return "whatsappQuestion"
}
