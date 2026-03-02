/**
 * buildFlowFromPlan — converts a semantic FlowPlan into valid ReactFlow nodes + edges.
 *
 * Algorithm:
 *  1. Walk plan.steps in order.
 *  2. NodeStep  → createNode() via factory, merge content, create edge from previous.
 *  3. BranchStep → edge from last multi-output node with sourceHandle, recurse.
 *  4. Enforce BUTTON_LIMITS per platform (trim excess branches).
 */

import type { Node, Edge } from "@xyflow/react"
import type { Platform, ButtonData, OptionData } from "@/types"
import type { FlowPlan, FlowStep, NodeStep, BranchStep, NodeContent, EditFlowPlan, EditChain, NodeUpdate, EdgeReference, NewEdge } from "@/types/flow-plan"
import { VALID_BASE_NODE_TYPES } from "@/types/flow-plan"
import { createNode } from "./node-factory"
import { createButtonData, createOptionData } from "./node-operations"
import { FlowLayoutManager, HORIZONTAL_GAP, BASE_Y } from "./flow-layout"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { NODE_TEMPLATES } from "@/constants/node-categories"

// ──────────────────────────────────────────
// Public API
// ──────────────────────────────────────────

export interface BuildFlowResult {
  nodes: Node[]
  edges: Edge[]
  nodeOrder: string[]
}

export function buildFlowFromPlan(
  plan: FlowPlan,
  platform: Platform
): BuildFlowResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const nodeOrder: string[] = []
  const layout = new FlowLayoutManager()

  let previousNodeId: string = "1" // start node
  let lastMultiOutputNodeId: string | null = null

  walkSteps(plan.steps, {
    nodes,
    edges,
    nodeOrder,
    layout,
    platform,
    previousNodeId,
    lastMultiOutputNodeId,
    branchEndpoints: [],
    maxBranchX: 0,
  })

  return { nodes, edges: deduplicateEdges(edges), nodeOrder }
}

export interface BuildEditFlowResult {
  newNodes: Node[]
  newEdges: Edge[]
  nodeOrder: string[]
  nodeUpdates: Array<{ nodeId: string; data: Record<string, unknown> }>
  removeNodeIds: string[]
  removeEdges: EdgeReference[]
}

/**
 * buildEditFlowFromPlan — converts an EditFlowPlan into new nodes/edges
 * to merge onto an existing canvas.
 *
 * Each "chain" attaches to an existing node (by ID) and appends new nodes.
 * nodeUpdates modify data on existing nodes without replacing them.
 */
export function buildEditFlowFromPlan(
  plan: EditFlowPlan,
  platform: Platform,
  existingNodes: Node[]
): BuildEditFlowResult {
  const newNodes: Node[] = []
  const newEdges: Edge[] = []
  const nodeOrder: string[] = []
  const nodeUpdates: BuildEditFlowResult["nodeUpdates"] = []

  // Process nodeUpdates — convert content to node data, preserving existing button/option IDs
  if (plan.nodeUpdates) {
    for (const update of plan.nodeUpdates) {
      const existingNode = existingNodes.find((n) => n.id === update.nodeId)
      if (!existingNode) continue

      const baseType = existingNode.type || ""
      const data = contentToNodeData(update.content, baseType)

      // Preserve existing button IDs where possible (match by index position)
      if (data.buttons && existingNode.data.buttons) {
        const existingButtons = existingNode.data.buttons as ButtonData[]
        data.buttons = (data.buttons as ButtonData[]).map((btn, i) => ({
          ...btn,
          id: i < existingButtons.length && existingButtons[i].id
            ? existingButtons[i].id
            : btn.id,
        }))
      }
      // Same for options
      if (data.options && existingNode.data.options) {
        const existingOptions = existingNode.data.options as OptionData[]
        data.options = (data.options as OptionData[]).map((opt, i) => ({
          ...opt,
          id: i < existingOptions.length && existingOptions[i].id
            ? existingOptions[i].id
            : opt.id,
        }))
      }

      nodeUpdates.push({ nodeId: update.nodeId, data })
    }
  }

  // Process chains — each chain attaches to an existing node
  for (const chain of plan.chains) {
    const anchorNode = existingNodes.find((n) => n.id === chain.attachTo)
    if (!anchorNode) {
      console.warn(`[buildEditFlowFromPlan] attachTo node "${chain.attachTo}" not found, skipping chain`)
      continue
    }

    // Calculate starting position: to the right of the anchor
    const startX = anchorNode.position.x + HORIZONTAL_GAP
    const startY = anchorNode.position.y
    const layout = new FlowLayoutManager(startX, startY)

    const ctx: WalkContext = {
      nodes: newNodes,
      edges: newEdges,
      nodeOrder,
      layout,
      platform,
      previousNodeId: chain.attachTo,
      lastMultiOutputNodeId: null,
      branchEndpoints: [],
      maxBranchX: 0,
    }

    // If attaching via a button handle, the first step gets that sourceHandle
    if (chain.attachHandle && chain.steps.length > 0) {
      const firstStep = chain.steps[0]
      if (firstStep.step === "node") {
        if (!isNodeTypeValidForPlatform(firstStep.nodeType, platform)) continue

        const position = layout.getNextSequentialPosition()
        const nodeId = `edit-${firstStep.nodeType}-${newNodes.length + 1}`

        let node: Node
        try {
          node = createNode(firstStep.nodeType, platform, position, nodeId)
        } catch {
          continue
        }

        if (firstStep.content) {
          node.data = { ...node.data, ...contentToNodeData(firstStep.content, firstStep.nodeType) }
        }

        newNodes.push(node)
        nodeOrder.push(nodeId)

        // Resolve attachHandle: "button-N" → actual button ID from the anchor node
        let resolvedHandle = chain.attachHandle
        const buttonMatch = resolvedHandle.match(/^button-(\d+)$/)
        if (buttonMatch) {
          const idx = parseInt(buttonMatch[1], 10)
          const anchorButtons = (anchorNode.data?.buttons as ButtonData[] | undefined) || []
          const anchorOptions = (anchorNode.data?.options as OptionData[] | undefined) || []
          const resolved = anchorButtons[idx]?.id || anchorOptions[idx]?.id
          if (resolved) {
            console.log(`[buildEditFlow] Resolved attachHandle "${resolvedHandle}" → "${resolved}" (button[${idx}] on ${chain.attachTo})`)
            resolvedHandle = resolved
          } else {
            console.warn(`[buildEditFlow] Could not resolve attachHandle "${resolvedHandle}" on ${chain.attachTo} — no button at index ${idx}`)
          }
        }

        newEdges.push({
          id: `e-${chain.attachTo}-${nodeId}-${resolvedHandle}`,
          source: chain.attachTo,
          sourceHandle: resolvedHandle,
          target: nodeId,
          type: "default",
          style: { stroke: "#6366f1", strokeWidth: 2 },
        } as Edge)

        ctx.previousNodeId = nodeId
        if (isMultiOutputNode(firstStep.nodeType)) {
          ctx.lastMultiOutputNodeId = nodeId
        }

        // Walk remaining steps
        if (chain.steps.length > 1) {
          walkSteps(chain.steps.slice(1), ctx)
        }
      }
    } else {
      // No attachHandle — walk all steps normally
      walkSteps(chain.steps, ctx)
    }

    // connectTo: link the last node in this chain to an existing node
    if (chain.connectTo) {
      const lastNodeId = ctx.previousNodeId
      // Don't connect back to the anchor itself
      if (lastNodeId !== chain.attachTo) {
        newEdges.push({
          id: `e-${lastNodeId}-${chain.connectTo}`,
          source: lastNodeId,
          target: chain.connectTo,
          type: "default",
          style: { stroke: "#6366f1", strokeWidth: 2 },
        } as Edge)
      }
    }
  }

  // Process addEdges — create new edges between existing or newly-created nodes
  if (plan.addEdges) {
    const allNodes = [...existingNodes, ...newNodes]
    // Also apply nodeUpdates for button ID lookup
    const updatedNodeData = new Map(nodeUpdates.map(u => [u.nodeId, u.data]))

    for (const newEdge of plan.addEdges) {
      let sourceHandle = newEdge.sourceHandle

      // Resolve buttonIndex → actual button ID
      if (newEdge.sourceButtonIndex !== undefined && !sourceHandle) {
        const sourceNode = allNodes.find(n => n.id === newEdge.source)
        if (sourceNode) {
          // Check updated data first, then existing node data
          const updatedData = updatedNodeData.get(newEdge.source)
          const buttons = (updatedData?.buttons || sourceNode.data?.buttons) as ButtonData[] | undefined
          const options = (updatedData?.options || sourceNode.data?.options) as OptionData[] | undefined
          sourceHandle = buttons?.[newEdge.sourceButtonIndex]?.id
            || options?.[newEdge.sourceButtonIndex]?.id
            || `button-${newEdge.sourceButtonIndex}`
        }
      }

      newEdges.push({
        id: `e-${newEdge.source}-${newEdge.target}-${sourceHandle || 'default'}`,
        source: newEdge.source,
        target: newEdge.target,
        sourceHandle,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      } as Edge)
    }
  }

  return {
    newNodes,
    newEdges: deduplicateEdges(newEdges),
    nodeOrder,
    nodeUpdates,
    removeNodeIds: plan.removeNodeIds || [],
    removeEdges: plan.removeEdges || [],
  }
}

// ──────────────────────────────────────────
// Internal walk context
// ──────────────────────────────────────────

interface WalkContext {
  nodes: Node[]
  edges: Edge[]
  nodeOrder: string[]
  layout: FlowLayoutManager
  platform: Platform
  previousNodeId: string
  lastMultiOutputNodeId: string | null
  branchEndpoints: string[]  // last node ID from each completed branch
  maxBranchX: number          // rightmost X across all branches (for positioning)
}

function walkSteps(steps: FlowStep[], ctx: WalkContext): void {
  for (const step of steps) {
    if (step.step === "node") {
      processNodeStep(step, ctx)
    } else if (step.step === "branch") {
      processBranchStep(step, ctx)
    }
  }
}

// ──────────────────────────────────────────
// Node step
// ──────────────────────────────────────────

function processNodeStep(step: NodeStep, ctx: WalkContext): void {
  const { platform } = ctx

  // Validate type for platform
  if (!isNodeTypeValidForPlatform(step.nodeType, platform)) {
    return // skip invalid nodes silently
  }

  let position = ctx.layout.getNextSequentialPosition()
  const nodeId = `plan-${step.nodeType}-${ctx.nodes.length + 1}`

  let node: Node
  try {
    node = createNode(step.nodeType, platform, position, nodeId)
  } catch {
    return // unknown type → skip
  }

  // Merge content from the plan
  if (step.content) {
    node.data = { ...node.data, ...contentToNodeData(step.content, step.nodeType) }
  }

  ctx.nodes.push(node)
  ctx.nodeOrder.push(nodeId)

  // Edge from previous node — handle convergence modes
  if (ctx.previousNodeId === ctx.lastMultiOutputNodeId && ctx.branchEndpoints.length > 0) {
    // BRANCH CONVERGENCE: branches existed, now connect all branch endpoints → this shared node
    // Reposition after the longest branch so shared nodes don't overlap
    if (ctx.maxBranchX > 0) {
      const parentNode = ctx.nodes.find(n => n.id === ctx.lastMultiOutputNodeId)
      ctx.layout = new FlowLayoutManager(ctx.maxBranchX + HORIZONTAL_GAP, parentNode?.position.y ?? BASE_Y)
      position = ctx.layout.getNextSequentialPosition()  // recalculate position
      node.position = position
    }
    for (const endpointId of ctx.branchEndpoints) {
      if (endpointId === ctx.lastMultiOutputNodeId) continue
      ctx.edges.push({
        id: `e-${endpointId}-${nodeId}`,
        source: endpointId,
        target: nodeId,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      } as Edge)
    }
    // Reset convergence state
    ctx.branchEndpoints = []
    ctx.lastMultiOutputNodeId = null
    ctx.maxBranchX = 0

  } else if (ctx.previousNodeId === ctx.lastMultiOutputNodeId) {
    // DIRECT CONVERGENCE: no branches were created, all buttons → same node
    const parentNode = ctx.nodes.find(n => n.id === ctx.lastMultiOutputNodeId)
    const buttons = (parentNode?.data?.buttons as ButtonData[] | undefined) || []
    const options = (parentNode?.data?.options as OptionData[] | undefined) || []
    const handleCount = buttons.length || options.length || 1
    for (let i = 0; i < handleCount; i++) {
      const handleId = buttons[i]?.id || options[i]?.id || `button-${i}`
      ctx.edges.push({
        id: `e-${ctx.lastMultiOutputNodeId}-${nodeId}-btn${i}`,
        source: ctx.lastMultiOutputNodeId,
        sourceHandle: handleId,
        target: nodeId,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      } as Edge)
    }
    // Reset multi-output state
    ctx.lastMultiOutputNodeId = null

  } else {
    // Normal sequential edge
    const edgeId = `e-${ctx.previousNodeId}-${nodeId}`
    ctx.edges.push({
      id: edgeId,
      source: ctx.previousNodeId,
      target: nodeId,
      type: "default",
      style: { stroke: "#6366f1", strokeWidth: 2 },
    } as Edge)
  }

  // Advance pointer
  ctx.previousNodeId = nodeId

  // Track multi-output nodes
  if (isMultiOutputNode(step.nodeType)) {
    ctx.lastMultiOutputNodeId = nodeId
  }
}

// ──────────────────────────────────────────
// Branch step
// ──────────────────────────────────────────

function processBranchStep(step: BranchStep, ctx: WalkContext): void {
  const parentId = ctx.lastMultiOutputNodeId
  if (!parentId) return // no parent to branch from

  const buttonLimit = BUTTON_LIMITS[ctx.platform]
  if (step.buttonIndex >= buttonLimit) return // exceeds platform limit

  // Find the parent node to determine branch layout
  const parentNode = ctx.nodes.find((n) => n.id === parentId)
  if (!parentNode) return

  // Calculate branch positions: we need to determine how many branches exist
  // for this parent. We use the parent position as the basis.
  const branchX = parentNode.position.x + HORIZONTAL_GAP
  const branchY = parentNode.position.y + step.buttonIndex * 250 - 250 * (Math.min(buttonLimit, 3) - 1) / 2

  const branchLayout = ctx.layout.createBranchLayout(branchX, branchY)

  // Walk the branch sub-tree
  let branchPreviousId = parentId
  const branchCtx: WalkContext = {
    nodes: ctx.nodes,
    edges: ctx.edges,
    nodeOrder: ctx.nodeOrder,
    layout: branchLayout,
    platform: ctx.platform,
    previousNodeId: branchPreviousId,
    lastMultiOutputNodeId: null,
    branchEndpoints: [],
    maxBranchX: 0,
  }

  // Process the first step in the branch with a sourceHandle edge
  const branchSteps = step.steps
  if (branchSteps.length === 0) return

  const firstStep = branchSteps[0]
  if (firstStep.step === "node") {
    if (!isNodeTypeValidForPlatform(firstStep.nodeType, ctx.platform)) return

    const position = branchLayout.getNextSequentialPosition()
    const nodeId = `plan-${firstStep.nodeType}-${ctx.nodes.length + 1}`

    let node: Node
    try {
      node = createNode(firstStep.nodeType, ctx.platform, position, nodeId)
    } catch {
      return
    }

    if (firstStep.content) {
      node.data = { ...node.data, ...contentToNodeData(firstStep.content, firstStep.nodeType) }
    }

    ctx.nodes.push(node)
    ctx.nodeOrder.push(nodeId)

    // Edge from parent with sourceHandle (use stable button ID if available)
    const parentButtons = (parentNode.data?.buttons as ButtonData[] | undefined) || []
    const parentOptions = (parentNode.data?.options as OptionData[] | undefined) || []
    const handleId = parentButtons[step.buttonIndex]?.id
      || parentOptions[step.buttonIndex]?.id
      || `button-${step.buttonIndex}`
    const edgeId = `e-${parentId}-${nodeId}-btn${step.buttonIndex}`
    ctx.edges.push({
      id: edgeId,
      source: parentId,
      sourceHandle: handleId,
      target: nodeId,
      type: "default",
      style: { stroke: "#6366f1", strokeWidth: 2 },
    } as Edge)

    branchCtx.previousNodeId = nodeId

    if (isMultiOutputNode(firstStep.nodeType)) {
      branchCtx.lastMultiOutputNodeId = nodeId
    }
  }

  // Process remaining steps in the branch
  if (branchSteps.length > 1) {
    walkSteps(branchSteps.slice(1), branchCtx)
  }

  // Record branch endpoint for convergence
  if (branchCtx.previousNodeId !== parentId) {
    ctx.branchEndpoints.push(branchCtx.previousNodeId)
    const lastNode = ctx.nodes.find(n => n.id === branchCtx.previousNodeId)
    if (lastNode) {
      ctx.maxBranchX = Math.max(ctx.maxBranchX, lastNode.position.x)
    }
  }
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/**
 * Checks whether a base node type is valid for the given platform.
 */
export function isNodeTypeValidForPlatform(
  nodeType: string,
  platform: Platform
): boolean {
  // Check against NODE_TEMPLATES for platform support
  const template = NODE_TEMPLATES.find((t) => t.type === nodeType)
  if (template) {
    return template.platforms.includes(platform)
  }

  // If not in templates, check if it's a known base type
  return (VALID_BASE_NODE_TYPES as readonly string[]).includes(nodeType)
}

/**
 * Convert plan content fields to node data format.
 * Converts string buttons → ButtonData[], string options → OptionData[], etc.
 */
export function contentToNodeData(
  content: NodeContent,
  nodeType: string
): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  if (content.label) data.label = content.label
  if (content.question) data.question = content.question
  if (content.text) data.text = content.text
  if (content.comment) data.comment = content.comment
  if (content.message) data.message = content.message
  if (content.listTitle) data.listTitle = content.listTitle

  // Convert string buttons → ButtonData[]
  if (content.buttons && content.buttons.length > 0) {
    data.buttons = content.buttons.map(
      (text, i): ButtonData => createButtonData(text, i)
    )
  }

  // Convert string options → OptionData[]
  if (content.options && content.options.length > 0) {
    data.options = content.options.map(
      (text, i): OptionData => createOptionData(text, i)
    )
  }

  return data
}

/**
 * Node types that can have multiple outputs (buttons / options).
 */
function isMultiOutputNode(nodeType: string): boolean {
  return ["quickReply", "interactiveList"].includes(nodeType)
}

/**
 * Deduplicate edges so each source+sourceHandle pair has exactly one outgoing edge.
 * Keeps the first edge encountered for each key (first-wins).
 */
function deduplicateEdges(edges: Edge[]): Edge[] {
  const seen = new Map<string, Edge>()
  for (const edge of edges) {
    const key = `${edge.source}-${edge.sourceHandle || "default"}`
    if (!seen.has(key)) {
      seen.set(key, edge)
    }
  }
  return Array.from(seen.values())
}
