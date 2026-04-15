import type { Node, Edge } from "@xyflow/react"
import { isMultiOutputType, getFixedHandles } from "@/utils/platform-helpers"

/**
 * Build a human-readable tree representation of the flow graph.
 * Walks the graph via DFS from the start node, showing button labels,
 * convergence points, cycles, and disconnected nodes.
 */
export function buildFlowGraphString(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) return "(empty flow)"

  // Build adjacency: source+sourceHandle → target
  const adjacency = new Map<string, Array<{ target: string; sourceHandle?: string }>>()
  for (const edge of edges) {
    const key = edge.source
    if (!adjacency.has(key)) adjacency.set(key, [])
    adjacency.get(key)!.push({ target: edge.target, sourceHandle: edge.sourceHandle || undefined })
  }

  const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]))

  // Find start node
  const startNode = nodes.find(n => n.type === "start")
  const startId = startNode?.id || "1"

  const visited = new Set<string>()
  const dfsStack = new Set<string>() // for cycle detection
  const lines: string[] = ["Flow Graph:\n"]

  function getNodeSummary(node: Node): string {
    const data = node.data as any
    const label = data?.label || ""
    const question = typeof data?.question === "string" ? data.question : ""
    const text = typeof data?.text === "string" ? data.text : ""
    const storeAs = typeof data?.storeAs === "string" ? data.storeAs : ""
    const displayText = question || text
    const labelPart = label ? ` ${label}` : ""
    const contentPart = displayText ? ` — "${displayText.substring(0, 60)}${displayText.length > 60 ? "..." : ""}"` : ""
    const storeAsPart = storeAs ? ` {storeAs: "${storeAs}"}` : ""

    // Flow template nodes: show as collapsed with internal node count
    if (node.type === "flowTemplate") {
      const templateName = data?.templateName || label
      const nodeCount = data?.nodeCount || data?.internalNodes?.length || 0
      return `[${node.id}] [Template: ${templateName}] (flowTemplate) — ${nodeCount} internal nodes`
    }

    return `[${node.id}]${labelPart} (${node.type})${contentPart}${storeAsPart}`
  }

  /**
   * Read the unified `data.choices` for a choice-bearing node.
   */
  function readChoices(node: Node): Array<{ text?: string; label?: string; id?: string }> {
    const data = node.data as any
    return data?.choices ?? []
  }

  function getButtonLabel(node: Node, sourceHandle: string | undefined): string | null {
    if (!sourceHandle) return null
    const choices = readChoices(node)
    // Match by handle ID like "button-0", "button-1"
    const match = sourceHandle.match(/^button-(\d+)$/)
    if (match) {
      const idx = parseInt(match[1], 10)
      if (idx < choices.length) {
        return choices[idx]?.text || choices[idx]?.label || `Button ${idx}`
      }
    }
    // Match by handle ID like "option-0", "option-1"
    const optMatch = sourceHandle.match(/^option-(\d+)$/)
    if (optMatch) {
      const idx = parseInt(optMatch[1], 10)
      if (idx < choices.length) {
        return choices[idx]?.text || `Option ${idx}`
      }
    }
    // Also try matching by choice.id
    const byId = choices.find(c => c.id === sourceHandle)
    if (byId) return byId.text || byId.label || sourceHandle
    // API fetch success/error handles
    if (sourceHandle === "success") return "Success"
    if (sourceHandle === "error") return "Error"
    // Handle "sync-next" or other named handles
    if (sourceHandle === "sync-next") return null
    return null
  }

  function getButtonIndex(node: Node, sourceHandle: string | undefined): number {
    if (!sourceHandle) return Infinity
    const choices = readChoices(node)
    // Check button-N index handles
    const btnMatch = sourceHandle.match(/^button-(\d+)$/)
    if (btnMatch) return parseInt(btnMatch[1], 10)
    // Check option-N index handles
    const optMatch = sourceHandle.match(/^option-(\d+)$/)
    if (optMatch) return parseInt(optMatch[1], 10)
    // Check by choice.id
    const idx = choices.findIndex(c => c.id === sourceHandle)
    if (idx !== -1) return idx
    return Infinity
  }

  function dfs(nodeId: string, prefix: string, connector: string) {
    const node = nodeMap.get(nodeId)
    if (!node) return

    // Cycle detection
    if (dfsStack.has(nodeId)) {
      lines.push(`${prefix}${connector} [${nodeId}] (cycle)`)
      return
    }

    // Already visited — convergence
    if (visited.has(nodeId)) {
      lines.push(`${prefix}${connector} ${getNodeSummary(node)} (see above)`)
      return
    }

    visited.add(nodeId)
    dfsStack.add(nodeId)

    lines.push(`${prefix}${connector} ${getNodeSummary(node)}`)

    // Get children
    const children = adjacency.get(nodeId) || []

    // Show output handles for multi-output nodes
    const isButtonNode = node.type ? isMultiOutputType(node.type) : false
    const fixedHandles = node.type ? getFixedHandles(node.type) : null
    const choices = readChoices(node)

    if (fixedHandles) {
      // Fixed-handle nodes (apiFetch): show "success" and "error" handles
      const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")
      lines.push(`${childPrefix}│ Handles: [${fixedHandles.map(h => `"${h}" (handle: ${h})`).join(", ")}]`)
    } else if (isButtonNode && choices.length > 0) {
      const seen = new Set<string>()
      const items: string[] = []
      for (let i = 0; i < choices.length; i++) {
        const c = choices[i]
        const handle = c.id || `button-${i}`
        if (!seen.has(handle)) {
          seen.add(handle)
          items.push(`"${c.text || c.label || "?"}" (handle: ${handle})`)
        }
      }
      const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")
      lines.push(`${childPrefix}│ Buttons: [${items.join(", ")}]`)
    }

    if (children.length === 0) {
      dfsStack.delete(nodeId)
      return
    }

    const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")

    // For button nodes: sort by button order, filter out redundant unlabeled edges
    // (stale edges whose target is already reached by a labeled button edge)
    let sortedChildren = children
    if (isButtonNode) {
      const labeledTargets = new Set(
        children
          .filter(c => getButtonLabel(node, c.sourceHandle) !== null)
          .map(c => c.target)
      )
      sortedChildren = children
        .filter(c => {
          // Keep all labeled edges; drop unlabeled edges to targets already covered
          if (getButtonLabel(node, c.sourceHandle) !== null) return true
          return !labeledTargets.has(c.target)
        })
        .sort((a, b) => {
          const aLabel = getButtonLabel(node, a.sourceHandle)
          const bLabel = getButtonLabel(node, b.sourceHandle)
          const aIdx = aLabel ? getButtonIndex(node, a.sourceHandle) : Infinity
          const bIdx = bLabel ? getButtonIndex(node, b.sourceHandle) : Infinity
          return aIdx - bIdx
        })
    }

    sortedChildren.forEach((child, idx) => {
      const isLast = idx === sortedChildren.length - 1
      const childConnector = isLast ? "└→ " : "├→ "
      const buttonLabel = getButtonLabel(node, child.sourceHandle)
      if (buttonLabel) {
        const labelPrefix = isLast ? "└─ " : "├─ "
        const handleInfo = child.sourceHandle ? ` [handle: ${child.sourceHandle}]` : ""
        lines.push(`${childPrefix}${labelPrefix}"${buttonLabel}"${handleInfo} →`)
        const deeperPrefix = childPrefix + (isLast ? "   " : "│  ")
        dfs(child.target, deeperPrefix, "└→ ")
      } else {
        dfs(child.target, childPrefix, childConnector)
      }
    })

    dfsStack.delete(nodeId)
  }

  // Walk from start
  dfs(startId, "", "")

  // Find disconnected nodes
  const disconnected = nodes.filter(n => !visited.has(n.id) && n.type !== "start")
  if (disconnected.length > 0) {
    lines.push("\nDisconnected Nodes:")
    for (const node of disconnected) {
      lines.push(`  ${getNodeSummary(node)}`)
    }
  }

  return lines.join("\n")
}
