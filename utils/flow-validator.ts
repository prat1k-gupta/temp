import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { validateFlowVariables } from "./flow-variables"
import { convertToFsWhatsApp } from "./whatsapp-converter"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { getFixedHandles, getBaseNodeType } from "./platform-helpers"

export interface FlowIssue {
  type:
    | "orphaned_node"
    | "undefined_variable"
    | "button_limit_exceeded"
    | "empty_content"
    | "unconnected_handle"
    | "unconnected_button"
    | "mixed_button_option_fields"
    | "converter_error"
  nodeId?: string
  nodeLabel?: string
  /** Short user-facing problem description. No node label prefix, no remediation. */
  detail: string
  /** Optional AI-only remediation hint. The UI does not display this. */
  hint?: string
}

export interface FlowValidationResult {
  isValid: boolean
  issues: FlowIssue[]
  summary: string
}

const SKIP_TYPES = new Set(["start", "comment", "flowComplete"])
const CONTENT_FIELDS = ["question", "text", "message"]

export function validateGeneratedFlow(
  nodes: Node[],
  edges: Edge[],
  platform: Platform
): FlowValidationResult {
  const issues: FlowIssue[] = []
  const contentNodes = nodes.filter((n) => !SKIP_TYPES.has(n.type || ""))

  // 1. Connectivity: orphaned nodes (no incoming edges, not directly from start)
  const incomingTargets = new Set(edges.map((e) => e.target))
  const startNodeIds = new Set(nodes.filter((n) => n.type === "start").map((n) => n.id))
  const startTargets = new Set(
    edges.filter((e) => startNodeIds.has(e.source)).map((e) => e.target)
  )
  for (const node of contentNodes) {
    if (startTargets.has(node.id)) continue
    if (!incomingTargets.has(node.id)) {
      issues.push({
        type: "orphaned_node",
        nodeId: node.id,
        nodeLabel: (node.data as any)?.label || node.type || "",
        detail: "No incoming connection — this node will never be reached.",
        hint: "Add an edge from an upstream node or remove the orphan.",
      })
    }
  }

  // 2. Unconnected handles on multi-output nodes (e.g. apiFetch success/error)
  const outgoingByNode = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!outgoingByNode.has(edge.source))
      outgoingByNode.set(edge.source, new Set())
    outgoingByNode.get(edge.source)!.add(edge.sourceHandle || "default")
  }
  for (const node of contentNodes) {
    const nodeType = node.type || ""
    const fixedHandles = getFixedHandles(nodeType)
    if (fixedHandles) {
      const connectedHandles = outgoingByNode.get(node.id) || new Set()
      for (const handle of fixedHandles) {
        if (!connectedHandles.has(handle)) {
          issues.push({
            type: "unconnected_handle",
            nodeId: node.id,
            nodeLabel: (node.data as any)?.label || nodeType,
            detail: `"${handle}" handle has no outgoing connection.`,
            hint: `Add an edge from the "${handle}" handle of this ${nodeType} node.`,
          })
        }
      }
    }
  }

  // 3. Variable consistency
  const varErrors = validateFlowVariables(nodes)
  for (const err of varErrors) {
    const vars = err.unknownVars.map((v) => `{{${v}}}`).join(", ")
    issues.push({
      type: "undefined_variable",
      nodeId: err.nodeId,
      nodeLabel: err.nodeLabel,
      detail: `References undefined ${err.unknownVars.length > 1 ? "variables" : "variable"}: ${vars}.`,
      hint: "Add a prior step that stores the variable, or fix the reference.",
    })
  }

  // 4. Button/option limits
  const buttonLimit = BUTTON_LIMITS[platform] || 3
  for (const node of contentNodes) {
    const baseType = getBaseNodeType(node.type || "")
    const data = node.data as Record<string, any>
    if (baseType === "quickReply" && Array.isArray(data.buttons)) {
      if (data.buttons.length > buttonLimit) {
        issues.push({
          type: "button_limit_exceeded",
          nodeId: node.id,
          nodeLabel: data.label || node.type || "",
          detail: `${data.buttons.length} buttons exceeds the ${platform} limit of ${buttonLimit}.`,
          hint: `Reduce to ${buttonLimit} buttons or convert to an interactiveList (up to 10).`,
        })
      }
    }
    if (baseType === "list" && Array.isArray(data.options)) {
      const optionLimit = 10 // WhatsApp max, applies to all platforms
      if (data.options.length > optionLimit) {
        issues.push({
          type: "button_limit_exceeded",
          nodeId: node.id,
          nodeLabel: data.label || node.type || "",
          detail: `${data.options.length} list options exceeds the limit of ${optionLimit}.`,
          hint: `Reduce to ${optionLimit} options.`,
        })
      }
    }
  }

  // 4a. A quickReply/list node must not carry BOTH buttons and options
  //     simultaneously — that's an invalid hybrid state that usually comes
  //     from the AI using the wrong field name in a nodeUpdate. The canvas
  //     renders whichever field the component expects and silently drops
  //     the other, so this is the only way the user would notice.
  for (const node of contentNodes) {
    const baseType = getBaseNodeType(node.type || "")
    if (baseType !== "quickReply" && baseType !== "list") continue
    const data = node.data as Record<string, any>
    const hasButtons = Array.isArray(data.buttons) && data.buttons.length > 0
    const hasOptions = Array.isArray(data.options) && data.options.length > 0
    if (hasButtons && hasOptions) {
      issues.push({
        type: "mixed_button_option_fields",
        nodeId: node.id,
        nodeLabel: data.label || node.type || "",
        detail: `Both buttons (${data.buttons.length}) and options (${data.options.length}) are set — invalid hybrid state.`,
        hint: "Use only content.buttons for quickReply or only content.options for interactiveList, never both.",
      })
    }
  }

  // 4b. Every button/option on a quickReply/list must have an outgoing edge
  //     from its own handle. Catches dangling buttons (e.g. AI added a new
  //     button but used the wrong handle ID in addEdges, leaving the new one
  //     without any onward connection).
  for (const node of contentNodes) {
    const baseType = getBaseNodeType(node.type || "")
    if (baseType !== "quickReply" && baseType !== "list") continue
    const data = node.data as Record<string, any>
    const choices: Array<{ id?: string; text?: string; label?: string }> =
      (data.buttons as any[]) || (data.options as any[]) || []
    if (choices.length === 0) continue
    const outgoingHandles = new Set(
      edges
        .filter((e) => e.source === node.id && e.sourceHandle)
        .map((e) => e.sourceHandle as string)
    )
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i]
      const handleId = c?.id
      if (!handleId) {
        // No id yet — plan-builder will assign one; skip.
        continue
      }
      if (!outgoingHandles.has(handleId)) {
        const labelText = c?.text || c?.label || `choice ${i + 1}`
        const choiceKind = baseType === "list" ? "option" : "button"
        issues.push({
          type: "unconnected_button",
          nodeId: node.id,
          nodeLabel: data.label || node.type || "",
          detail: `${choiceKind.charAt(0).toUpperCase() + choiceKind.slice(1)} "${labelText}" has no outgoing connection.`,
          hint: `Add an edge with sourceButtonIndex: ${i} (or chain with attachHandle: "button-${i}") to route it onward.`,
        })
      }
    }
  }

  // 5. flowTemplate integrity — must reference a real template with internalNodes
  for (const node of contentNodes) {
    if (node.type !== "flowTemplate") continue
    const data = node.data as Record<string, any>
    const hasInternal = Array.isArray(data.internalNodes) && data.internalNodes.length > 0
    if (!hasInternal) {
      issues.push({
        type: "empty_content",
        nodeId: node.id,
        nodeLabel: data.label || data.templateName || "flowTemplate",
        detail: "flowTemplate has no internal nodes.",
        hint: "Use a specific type instead (name, email, dob, address) or reference an existing template by ID.",
      })
    }
  }

  // 6. Empty content (skip types that don't need text)
  for (const node of contentNodes) {
    const data = node.data as Record<string, any>
    const baseType = getBaseNodeType(node.type || "")
    if (
      baseType === "action" ||
      baseType === "condition" ||
      baseType === "apiFetch" ||
      baseType === "transfer" ||
      node.type === "flowTemplate" // content lives in internalNodes, checked above
    )
      continue
    const hasContent = CONTENT_FIELDS.some(
      (f) => typeof data[f] === "string" && data[f].trim().length > 0
    )
    if (!hasContent) {
      issues.push({
        type: "empty_content",
        nodeId: node.id,
        nodeLabel: data.label || node.type || "",
        detail: "No message content.",
        hint: "Add a question or text.",
      })
    }
  }

  // 7. Converter trial — catches structural problems
  // Only run if a start node exists (AI-generated plans don't include it — the canvas adds it)
  const hasStartNode = nodes.some((n) => n.type === "start")
  if (hasStartNode) {
    try {
      const converted = convertToFsWhatsApp(nodes, edges, "validation_test")
      if (converted.steps.length === 0 && contentNodes.length > 0) {
        issues.push({
          type: "converter_error",
          detail: "Converter produced 0 steps from a non-empty flow.",
          hint: "Nodes may be disconnected from the start node.",
        })
      }
    } catch (err) {
      issues.push({
        type: "converter_error",
        detail: `Converter failed: ${err instanceof Error ? err.message : "Unknown error"}.`,
        hint: "The flow structure may be invalid.",
      })
    }
  }

  const summary =
    issues.length === 0
      ? ""
      : `Found ${issues.length} issue(s) in the generated flow:\n${issues
          .map((i, idx) => {
            const labelPrefix = i.nodeLabel ? `"${i.nodeLabel}" — ` : ""
            const hintSuffix = i.hint ? ` ${i.hint}` : ""
            return `${idx + 1}. [${i.type}] ${labelPrefix}${i.detail}${hintSuffix}`
          })
          .join("\n")}`

  return { isValid: issues.length === 0, issues, summary }
}
