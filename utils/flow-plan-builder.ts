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
import { createButtonData, createOptionData, shouldConvertToList, convertButtonsToOptions } from "./node-operations"
import { FlowLayoutManager, HORIZONTAL_GAP, BASE_Y } from "./flow-layout"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { NODE_TEMPLATES } from "@/constants/node-categories"
import { isMultiOutputType, getBaseNodeType } from "./platform-helpers"
import { autoStoreAs, collectFlowVariables } from "./flow-variables"

// AI models sometimes output shorthand type names — normalize to canonical types
const COMMON_ALIASES: Record<string, string> = {
  list: "interactiveList",
}

const PLATFORM_ALIASES: Record<string, Record<string, string>> = {
  whatsapp: { message: "whatsappMessage" },
  instagram: { message: "instagramDM" },
  web: {},
}

function normalizeNodeType(nodeType: string, platform: Platform): string {
  return PLATFORM_ALIASES[platform]?.[nodeType] || COMMON_ALIASES[nodeType] || nodeType
}

function normalizeSteps(steps: FlowStep[], platform: Platform): FlowStep[] {
  return steps.map((step) => {
    if (step.step === "node") {
      return { ...step, nodeType: normalizeNodeType(step.nodeType, platform) }
    }
    if (step.step === "branch") {
      return { ...step, steps: normalizeSteps(step.steps, platform) }
    }
    return step
  })
}

// ──────────────────────────────────────────
// Public API
// ──────────────────────────────────────────

export interface BuildFlowResult {
  nodes: Node[]
  edges: Edge[]
  nodeOrder: string[]
  warnings: string[]
}

export function buildFlowFromPlan(
  plan: FlowPlan,
  platform: Platform
): BuildFlowResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const nodeOrder: string[] = []
  const warnings: string[] = []
  const layout = new FlowLayoutManager()

  let previousNodeId: string = "1" // start node
  let lastMultiOutputNodeId: string | null = null

  walkSteps(normalizeSteps(plan.steps, platform), {
    nodes,
    edges,
    nodeOrder,
    layout,
    platform,
    previousNodeId,
    lastMultiOutputNodeId,
    branchEndpoints: [],
    maxBranchX: 0,
    warnings,
  })

  autoPopulateStoreAs(nodes)

  // Validate node dependencies from NODE_TEMPLATES metadata
  validateDependencies(nodes, warnings)

  return { nodes, edges: deduplicateEdges(edges), nodeOrder, warnings }
}

export interface BuildEditFlowResult {
  newNodes: Node[]
  newEdges: Edge[]
  nodeOrder: string[]
  nodeUpdates: Array<{ nodeId: string; data: Record<string, unknown>; newType?: string }>
  removeNodeIds: string[]
  removeEdges: EdgeReference[]
  positionShifts: Array<{ nodeId: string; dx: number }>
  warnings: string[]
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
  existingNodes: Node[],
  existingEdges: Edge[] = []
): BuildEditFlowResult {
  const newNodes: Node[] = []
  const newEdges: Edge[] = []
  const nodeOrder: string[] = []
  const nodeUpdates: BuildEditFlowResult["nodeUpdates"] = []
  const warnings: string[] = []
  const positionShiftMap = new Map<string, number>() // nodeId → total dx

  // Normalize AI aliases in chain steps
  if (plan.chains) {
    plan = { ...plan, chains: plan.chains.map((c) => ({ ...c, steps: normalizeSteps(c.steps, platform) })) }
  }

  // Process nodeUpdates — convert content to node data, preserving existing button/option IDs
  if (plan.nodeUpdates) {
    for (const update of plan.nodeUpdates) {
      const existingNode = existingNodes.find((n) => n.id === update.nodeId)
      if (!existingNode) {
        warnings.push(`nodeUpdate target "${update.nodeId}" not found — skipped`)
        continue
      }

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

      // Auto-convert quickReply → interactiveList if nodeUpdate pushes buttons over the limit
      const baseNodeType = getBaseNodeType(baseType)
      if (baseNodeType === "quickReply" && data.buttons) {
        const buttons = data.buttons as ButtonData[]
        const conversion = shouldConvertToList(buttons.length, platform)
        if (conversion.shouldConvert) {
          const options = convertButtonsToOptions(buttons)
          const { buttons: _removed, ...restData } = data
          const convertedData: Record<string, unknown> = {
            ...restData,
            options,
            listTitle: (restData as any).listTitle || "Select an option",
            label: conversion.newLabel,
          }
          nodeUpdates.push({ nodeId: update.nodeId, data: convertedData, newType: conversion.newNodeType })
          warnings.push(`nodeUpdate "${update.nodeId}": quickReply auto-converted to interactiveList (${buttons.length} buttons exceeds ${platform} limit)`)
          continue
        }
      }

      nodeUpdates.push({ nodeId: update.nodeId, data })
    }
  }

  // Process chains — each chain attaches to an existing node
  for (const chain of plan.chains || []) {
    const anchorNode = existingNodes.find((n) => n.id === chain.attachTo)
    if (!anchorNode) {
      const msg = `Chain attachTo node "${chain.attachTo}" not found — skipped`
      console.warn(`[buildEditFlowFromPlan] ${msg}`)
      warnings.push(msg)
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
      warnings,
    }

    // If attaching via a button handle, the first step gets that sourceHandle
    if (chain.attachHandle && chain.steps.length > 0) {
      const firstStep = chain.steps[0]
      if (firstStep.step === "node") {
        if (!isNodeTypeValidForPlatform(firstStep.nodeType, platform)) continue

        const position = layout.getNextSequentialPosition()
        const nodeId = `edit-${firstStep.nodeType}-${newNodes.length + 1}-${rand4()}`

        let node: Node
        try {
          node = createNode(firstStep.nodeType, platform, position, nodeId)
        } catch {
          continue
        }

        if (firstStep.content) {
          node.data = { ...node.data, ...contentToNodeData(firstStep.content, firstStep.nodeType) }
        }

        // Auto-convert quickReply → interactiveList if buttons exceed platform limit
        const effectiveFirstType = maybeAutoConvertToList(node, firstStep.nodeType, platform, warnings)

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
        if (isMultiOutputType(effectiveFirstType)) {
          ctx.lastMultiOutputNodeId = nodeId
        }

        // Walk remaining steps
        if (chain.steps.length > 1) {
          walkSteps(chain.steps.slice(1), ctx)
        }
      }
    } else {
      // No attachHandle — check if anchor is a multi-output node (quickReply/list)
      // If so, use "next-step" handle to avoid creating ambiguous handleless edges
      const anchorType = anchorNode.type || ""
      const anchorIsMultiOutput = isMultiOutputType(anchorType)

      if (anchorIsMultiOutput && chain.steps.length > 0 && chain.steps[0].step === "node") {
        const firstStep = chain.steps[0]
        if (!isNodeTypeValidForPlatform(firstStep.nodeType, platform)) continue

        const position = layout.getNextSequentialPosition()
        const nodeId = `edit-${firstStep.nodeType}-${newNodes.length + 1}-${rand4()}`

        let node: Node
        try {
          node = createNode(firstStep.nodeType, platform, position, nodeId)
        } catch {
          continue
        }

        if (firstStep.content) {
          node.data = { ...node.data, ...contentToNodeData(firstStep.content, firstStep.nodeType) }
        }

        // Auto-convert quickReply → interactiveList if buttons exceed platform limit
        const effectiveAnchorType = maybeAutoConvertToList(node, firstStep.nodeType, platform, warnings)

        newNodes.push(node)
        nodeOrder.push(nodeId)

        // Use "next-step" handle for multi-output nodes to avoid handleless ambiguity
        console.log(`[buildEditFlow] Using "next-step" handle for chain from multi-output node ${chain.attachTo}`)
        newEdges.push({
          id: `e-${chain.attachTo}-${nodeId}-next`,
          source: chain.attachTo,
          sourceHandle: "next-step",
          target: nodeId,
          type: "default",
          style: { stroke: "#6366f1", strokeWidth: 2 },
        } as Edge)

        ctx.previousNodeId = nodeId
        if (isMultiOutputType(effectiveAnchorType)) {
          ctx.lastMultiOutputNodeId = nodeId
        }

        if (chain.steps.length > 1) {
          walkSteps(chain.steps.slice(1), ctx)
        }
      } else {
        // Regular node — walk all steps normally (creates sequential handleless edges)
        walkSteps(chain.steps, ctx)
      }
    }

    // connectTo: link the last node in this chain to an existing node
    if (chain.connectTo) {
      const lastNodeId = ctx.previousNodeId
      // Don't connect back to the anchor itself
      if (lastNodeId !== chain.attachTo && lastNodeId !== chain.connectTo) {
        // If the last node in the chain is a multi-output node, use "next-step" handle
        // to avoid ambiguous handleless edges (which cause "two edges from one button" bugs)
        const lastNode = newNodes.find(n => n.id === lastNodeId)
        const lastNodeIsMultiOutput = lastNode?.type ? isMultiOutputType(lastNode.type) : false
        const connectHandle = lastNodeIsMultiOutput ? "next-step" : undefined

        newEdges.push({
          id: `e-${lastNodeId}-${chain.connectTo}${connectHandle ? `-${connectHandle}` : ""}`,
          source: lastNodeId,
          sourceHandle: connectHandle,
          target: chain.connectTo,
          type: "default",
          style: { stroke: "#6366f1", strokeWidth: 2 },
        } as Edge)

        // Compute position shifts: count new nodes in this chain and shift
        // all existing nodes at or to the right of connectTo's position
        const connectToNode = existingNodes.find(n => n.id === chain.connectTo)
        if (connectToNode) {
          const shiftDx = countChainNodes(chain) * HORIZONTAL_GAP

          if (shiftDx > 0) {
            const removedSet = new Set(plan.removeNodeIds || [])
            const newNodeIds = new Set(newNodes.map(n => n.id))
            const threshold = connectToNode.position.x
            for (const node of existingNodes) {
              if (removedSet.has(node.id)) continue
              if (newNodeIds.has(node.id)) continue
              if (node.position.x >= threshold) {
                const existing = positionShiftMap.get(node.id) || 0
                positionShiftMap.set(node.id, existing + shiftDx)
              }
            }
          }
        }
      }
    }
  }

  // Process addEdges — create new edges between existing or newly-created nodes
  if (plan.addEdges) {
    const allNodes = [...existingNodes, ...newNodes]
    // Also apply nodeUpdates for button ID lookup
    const updatedNodeData = new Map(nodeUpdates.map(u => [u.nodeId, u.data]))

    for (const newEdge of plan.addEdges) {
      // Validate source/target existence and reject self-loops
      const sourceExists = allNodes.some(n => n.id === newEdge.source)
      const targetExists = allNodes.some(n => n.id === newEdge.target)
      if (!sourceExists || !targetExists) {
        console.warn(`[buildEditFlow] Skipping addEdge: source "${newEdge.source}" or target "${newEdge.target}" not found`)
        continue
      }
      if (newEdge.source === newEdge.target) {
        console.warn(`[buildEditFlow] Skipping self-loop addEdge: ${newEdge.source} → ${newEdge.target}`)
        continue
      }

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

      // Also resolve "button-N" style sourceHandle to actual button ID
      if (sourceHandle) {
        const buttonMatch = sourceHandle.match(/^button-(\d+)$/)
        if (buttonMatch) {
          const idx = parseInt(buttonMatch[1], 10)
          const sourceNode = allNodes.find(n => n.id === newEdge.source)
          if (sourceNode) {
            const updatedData = updatedNodeData.get(newEdge.source)
            const buttons = (updatedData?.buttons || sourceNode.data?.buttons) as ButtonData[] | undefined
            const options = (updatedData?.options || sourceNode.data?.options) as OptionData[] | undefined
            const resolved = buttons?.[idx]?.id || options?.[idx]?.id
            if (resolved) {
              console.log(`[buildEditFlow] Resolved addEdge sourceHandle "${sourceHandle}" → "${resolved}"`)
              sourceHandle = resolved
            }
          }
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

  // ── Backward edge detection (heuristic: position-based) ──
  const allNodesForWarnings = [...existingNodes, ...newNodes]
  for (const edge of newEdges) {
    const sourceNode = allNodesForWarnings.find(n => n.id === edge.source)
    const targetNode = allNodesForWarnings.find(n => n.id === edge.target)
    if (sourceNode && targetNode && targetNode.position.x < sourceNode.position.x - 50) {
      warnings.push(`Possible backward edge: ${edge.source} → ${edge.target}`)
    }
  }

  // ── Orphan detection after removeNodeIds ──
  if (plan.removeNodeIds && plan.removeNodeIds.length > 0 && existingEdges.length > 0) {
    const removedSet = new Set(plan.removeNodeIds)
    const removedEdgeSet = new Set(
      (plan.removeEdges || []).map(e => `${e.source}-${e.target}`)
    )
    // Find nodes that were ONLY fed by removed nodes or removed edges
    const allNodeIds = new Set(allNodesForWarnings.map(n => n.id))
    for (const node of existingNodes) {
      if (removedSet.has(node.id)) continue // skip removed nodes themselves
      if (node.type === "start") continue

      // Gather all incoming edges for this node
      const incomingEdges = existingEdges.filter(e => e.target === node.id)
      if (incomingEdges.length === 0) continue // already had no incoming edges

      // Check if ALL incoming edges are now gone (source removed or edge explicitly removed)
      const allIncomingGone = incomingEdges.every(e =>
        removedSet.has(e.source) || removedEdgeSet.has(`${e.source}-${e.target}`)
      )

      // Check if any new edges target this node (from chains or addEdges)
      const hasNewIncoming = newEdges.some(e => e.target === node.id)

      if (allIncomingGone && !hasNewIncoming) {
        warnings.push(`Possibly orphaned node: "${node.id}" lost all incoming connections`)
      }
    }
  }

  // Convert positionShiftMap to array
  const positionShifts = Array.from(positionShiftMap.entries()).map(
    ([nodeId, dx]) => ({ nodeId, dx })
  )

  autoPopulateStoreAs(newNodes)

  // Validate node dependencies — check new nodes against both existing and new nodes
  const removedSet = new Set(plan.removeNodeIds || [])
  const allNodesForDeps = [
    ...existingNodes.filter(n => !removedSet.has(n.id)),
    ...newNodes,
  ]
  validateDependencies(allNodesForDeps, warnings, newNodes)

  return {
    newNodes,
    newEdges: deduplicateEdges(newEdges),
    nodeOrder,
    nodeUpdates,
    removeNodeIds: plan.removeNodeIds || [],
    removeEdges: plan.removeEdges || [],
    positionShifts,
    warnings,
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
  warnings: string[]
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
    ctx.warnings.push(`Node type "${step.nodeType}" not valid for ${platform} — skipped`)
    return
  }

  let position = ctx.layout.getNextSequentialPosition()
  const nodeId = `plan-${step.nodeType}-${ctx.nodes.length + 1}-${rand4()}`

  let node: Node
  try {
    node = createNode(step.nodeType, platform, position, nodeId)
  } catch {
    ctx.warnings.push(`Unknown node type "${step.nodeType}" — skipped`)
    return
  }

  // Merge content from the plan
  if (step.content) {
    node.data = { ...node.data, ...contentToNodeData(step.content, step.nodeType) }
  }

  // Auto-convert quickReply → interactiveList if buttons exceed platform limit
  const effectiveType = maybeAutoConvertToList(node, step.nodeType, ctx.platform, ctx.warnings)

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
  if (isMultiOutputType(effectiveType)) {
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
    warnings: ctx.warnings,
  }

  // Process the first step in the branch with a sourceHandle edge
  const branchSteps = step.steps
  if (branchSteps.length === 0) return

  const firstStep = branchSteps[0]
  if (firstStep.step === "node") {
    if (!isNodeTypeValidForPlatform(firstStep.nodeType, ctx.platform)) return

    const position = branchLayout.getNextSequentialPosition()
    const nodeId = `plan-${firstStep.nodeType}-${ctx.nodes.length + 1}-${rand4()}`

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

    if (isMultiOutputType(firstStep.nodeType)) {
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
 * Auto-generates storeAs from label/question for storable node types.
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
  if (content.storeAs) data.storeAs = content.storeAs

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
 * Post-process all built nodes to auto-populate storeAs for storable types.
 * Deduplicates variable names across the entire set.
 */
export function autoPopulateStoreAs(nodes: Node[]): void {
  const existing = collectFlowVariables(nodes)
  for (const node of nodes) {
    const generated = autoStoreAs(node, existing)
    if (generated) {
      ;(node.data as Record<string, any>).storeAs = generated
      if (!existing.includes(generated)) {
        existing.push(generated)
      }
    }
  }
}

// isMultiOutputType is imported from platform-helpers.ts

/**
 * Auto-convert quickReply → interactiveList when buttons exceed platform limit.
 * WhatsApp/Instagram quickReply supports max 3 buttons; interactiveList supports up to 10.
 * Mutates the node in place. Returns the effective base nodeType after conversion.
 */
function maybeAutoConvertToList(
  node: Node,
  originalType: string,
  platform: Platform,
  warnings: string[]
): string {
  if (originalType !== "quickReply") return originalType

  const buttons = (node.data?.buttons as ButtonData[]) || []
  const limit = BUTTON_LIMITS[platform]

  if (buttons.length <= limit) return originalType

  const conversion = shouldConvertToList(buttons.length, platform)

  if (!conversion.shouldConvert) {
    // Can't convert (e.g., web doesn't have interactiveList) — trim buttons
    node.data = { ...node.data, buttons: buttons.slice(0, limit) }
    warnings.push(`quickReply trimmed from ${buttons.length} to ${limit} buttons (${platform} limit)`)
    return originalType
  }

  // Convert: buttons → options, change type to interactiveList
  const options = convertButtonsToOptions(buttons)
  try {
    const listNode = createNode("interactiveList", platform, node.position, node.id)
    // Preserve content fields (question, label, etc.) but swap buttons → options
    const { buttons: _removedButtons, ...contentData } = node.data as Record<string, unknown>
    node.type = listNode.type
    node.data = {
      ...listNode.data,
      ...contentData,
      options,
      listTitle: (contentData as any).listTitle || "Select an option",
    }
  } catch {
    // Fallback: trim buttons if createNode fails for interactiveList
    node.data = { ...node.data, buttons: buttons.slice(0, limit) }
    warnings.push(`quickReply trimmed from ${buttons.length} to ${limit} buttons (createNode fallback)`)
    return originalType
  }

  warnings.push(`quickReply auto-converted to interactiveList: ${buttons.length} buttons exceeds ${platform} limit of ${limit}`)
  return "interactiveList"
}

/** Count the number of node steps in a chain (including nested branches) */
function countChainNodes(chain: EditChain): number {
  let count = 0
  for (const step of chain.steps) {
    if (step.step === "node") count++
    if (step.step === "branch") {
      for (const s of step.steps) {
        if (s.step === "node") count++
      }
    }
  }
  return count
}

/** Generate a short random suffix for node IDs to prevent collisions on duplicate runs */
function rand4(): string {
  return Math.random().toString(36).slice(2, 6)
}

/**
 * Validate node dependencies from NODE_TEMPLATES metadata.
 * If a node has dependencies that aren't present in the flow, emit a warning.
 * @param allNodes - all nodes in the flow (existing + new)
 * @param warnings - mutable warnings array
 * @param onlyCheck - if provided, only validate these nodes (useful for edit mode to only warn about new nodes)
 */
function validateDependencies(allNodes: Node[], warnings: string[], onlyCheck?: Node[]): void {
  const allBaseTypes = new Set(
    allNodes.map(n => getBaseNodeType(n.type || "").toLowerCase())
  )
  const nodesToCheck = onlyCheck || allNodes
  for (const node of nodesToCheck) {
    const baseType = getBaseNodeType(node.type || "")
    const template = NODE_TEMPLATES.find(t => t.type === baseType)
    if (template?.ai?.dependencies) {
      for (const dep of template.ai.dependencies) {
        if (!allBaseTypes.has(dep.toLowerCase())) {
          warnings.push(`"${baseType}" requires "${dep}" but it's missing from the flow`)
        }
      }
    }
  }
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
