import type { Node, Edge } from "@xyflow/react"
import { getNodeSourceHandles } from "@/constants/node-categories"

const MAX_DEPTH = 5

/**
 * Flatten flow template nodes by inlining their internal nodes/edges
 * into the parent flow. This is done at publish time so the runtime
 * receives a flat flow with no template wrappers.
 *
 * Exit logic (handle-level):
 * - Any unconnected source handle on any node → implicit exit,
 *   routed to the parent flow's next step
 * - Handles connected to flowComplete → dead-ends (converter resolves to __complete__)
 * - Handles connected to internal nodes → normal internal routing
 */
export function flattenFlow(
  nodes: Node[],
  edges: Edge[],
  depth: number = 0
): { nodes: Node[]; edges: Edge[] } {
  if (depth > MAX_DEPTH) {
    throw new Error(`[flattenFlow] Max nesting depth (${MAX_DEPTH}) exceeded — check for circular template references`)
  }

  const workingNodes: Node[] = []
  const workingEdges: Edge[] = [...edges]
  const templateNodeIds = new Set<string>()

  for (const node of nodes) {
    if (node.type !== "flowTemplate") {
      workingNodes.push(node)
      continue
    }

    templateNodeIds.add(node.id)
    const data = node.data as any
    const internalNodes: Node[] = data.internalNodes || []
    const internalEdges: Edge[] = data.internalEdges || []

    if (internalNodes.length === 0) continue

    // Prefix internal node IDs to avoid collisions
    const prefix = `${node.id}_`

    const prefixedNodes = internalNodes.map((n) => ({
      ...n,
      id: `${prefix}${n.id}`,
      position: {
        x: (node.position?.x || 0) + (n.position?.x || 0),
        y: (node.position?.y || 0) + (n.position?.y || 0),
      },
      data: { ...n.data },
    }))

    const prefixedEdges = internalEdges.map((e) => ({
      ...e,
      id: `${prefix}${e.id}`,
      source: `${prefix}${e.source}`,
      target: `${prefix}${e.target}`,
      // sourceHandle/targetHandle are component-defined handle IDs (e.g. "else", "group-1", "btn-xxx")
      // NOT node IDs — don't prefix them or the converter can't resolve routes
    }))

    // Identify flowComplete nodes (explicit terminators)
    const completeNodeIds = new Set(
      prefixedNodes
        .filter((n) => n.type === "flowComplete")
        .map((n) => n.id)
    )

    // Find entry node: first node with no incoming internal edges
    const internalTargets = new Set(internalEdges.map((e) => e.target))
    const entryNode = prefixedNodes.find(
      (n) => !internalTargets.has(n.id.replace(prefix, "").replace(prefix, ""))
        && !completeNodeIds.has(n.id)
    )
    // Fallback: just use the first prefixed node that isn't a flowComplete
    const entryNodeId = entryNode?.id
      || prefixedNodes.find((n) => !completeNodeIds.has(n.id))?.id

    // Build set of "source_handle" keys that have outgoing internal edges.
    // Handles connected to flowComplete are still "used" (intentional dead-ends).
    const usedSourceHandles = new Set(
      internalEdges.map((e) => `${e.source}_${e.sourceHandle || ""}`)
    )

    // Find all open exits: unconnected source handles across all non-complete nodes.
    // Each open exit becomes a route to the parent flow's next step.
    // "sync-next" (Sync Next) handles are excluded — they're synchronous follow-ups
    // that should not leak to the parent flow if unconnected inside the template.
    const openExits: Array<{ nodeId: string; sourceHandle: string | undefined }> = []

    for (const pNode of prefixedNodes) {
      if (completeNodeIds.has(pNode.id)) continue

      const origId = pNode.id.replace(prefix, "")
      const handles = getNodeSourceHandles(pNode.type || "", pNode.data)

      for (const handle of handles) {
        if (handle === "sync-next") continue
        if (!usedSourceHandles.has(`${origId}_${handle || ""}`)) {
          openExits.push({ nodeId: pNode.id, sourceHandle: handle })
        }
      }
    }

    // Reroute edges:
    // 1. Edges pointing TO the template node → point to entry node
    // 2. Edges pointing FROM the template node → duplicate for each open exit
    for (let i = workingEdges.length - 1; i >= 0; i--) {
      const edge = workingEdges[i]
      if (edge.target === node.id && entryNodeId) {
        workingEdges[i] = { ...edge, target: entryNodeId, targetHandle: undefined }
      }
      if (edge.source === node.id) {
        // Remove original edge from template node
        workingEdges.splice(i, 1)
        // Add one edge per open exit (handle-level)
        for (const exit of openExits) {
          workingEdges.push({
            ...edge,
            id: `${edge.id}_exit_${exit.nodeId}_${exit.sourceHandle || "default"}`,
            source: exit.nodeId,
            sourceHandle: exit.sourceHandle,
          })
        }
      }
    }

    // Exclude flowComplete nodes from output — they're markers, not runtime steps.
    // Edges pointing TO flowComplete stay as dead-ends (target won't exist in final
    // node set, so they get filtered out below → converter resolves to __complete__).
    const regularNodes = prefixedNodes.filter((n) => !completeNodeIds.has(n.id))
    workingNodes.push(...regularNodes)
    workingEdges.push(...prefixedEdges)
  }

  // Remove edges that still reference deleted template/flowComplete nodes
  const finalNodeIds = new Set(workingNodes.map((n) => n.id))
  const finalEdges = workingEdges.filter(
    (e) => finalNodeIds.has(e.source) && finalNodeIds.has(e.target)
  )

  // Check if any remaining nodes are still templates (nested templates)
  const hasNestedTemplates = workingNodes.some((n) => n.type === "flowTemplate")
  if (hasNestedTemplates) {
    return flattenFlow(workingNodes, finalEdges, depth + 1)
  }

  return { nodes: workingNodes, edges: finalEdges }
}
