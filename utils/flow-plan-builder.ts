/**
 * buildFlowFromPlan — converts a semantic FlowPlan into valid ReactFlow nodes + edges.
 *
 * Algorithm:
 *  1. Walk plan.steps in order.
 *  2. NodeStep  → createNode() via factory, merge content, create edge from previous.
 *  3. BranchStep → edge from last multi-output node with sourceHandle, recurse.
 *  4. Enforce BUTTON_LIMITS per platform (trim excess branches).
 */
import { DEFAULT_EDGE_STYLE } from "@/constants/edge-styles"

import type { Node, Edge } from "@xyflow/react"
import type { Platform, ChoiceData, TemplateResolver } from "@/types"
import type { FlowPlan, FlowStep, NodeStep, BranchStep, NodeContent, EditFlowPlan, EditChain, NodeUpdate, EdgeReference, NewEdge } from "@/types/flow-plan"
import { VALID_BASE_NODE_TYPES } from "@/types/flow-plan"

/**
 * Normalize sourceHandle values. "default" is not a real Handle ID —
 * single-output nodes render with sourceHandle: undefined in ReactFlow.
 * This ensures edges created by the plan builder match the actual DOM handles.
 */
function normalizeHandle(handle: string | undefined | null): string | undefined {
  if (!handle || handle === "default") return undefined
  return handle
}

/**
 * Read a node's choice items from `data.choices`, falling back to
 * `data.buttons` for templateMessage nodes (which were intentionally
 * excluded from the data.choices unification — different schema).
 * Only quick_reply buttons get output handles, so we filter to those.
 */
function readChoices(node: { data?: any } | undefined | null): ChoiceData[] {
  if (!node?.data) return []
  if (node.data.choices?.length) return node.data.choices
  if (node.data.buttons?.length) {
    return node.data.buttons
      .filter((btn: any) => btn.type === "quick_reply")
      .map((btn: any, idx: number) => ({
        id: btn.id || `btn-${idx}`,
        text: btn.text || "",
      }))
  }
  return []
}
import { createNode, createFlowTemplateNode } from "./node-factory"
import { createChoiceData, shouldConvertToList } from "./node-operations"
import { FlowLayoutManager, HORIZONTAL_GAP, BASE_Y } from "./flow-layout"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { NODE_TEMPLATES } from "@/constants/node-categories"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import { isMultiOutputType, getFixedHandles, getBaseNodeType } from "./platform-helpers"
import { autoStoreAs, collectFlowVariables } from "./flow-variables"
import { extractTemplateVariables } from "./template-helpers"

/**
 * Compute the outgoing handle IDs a node of `nodeType` will expose AFTER
 * a nodeUpdate is applied with the given data. Used by classifyTypeChange
 * to decide whether the old outgoing edges can be preserved, collapsed,
 * or must be refused.
 */
function computeOutgoingHandles(
  nodeType: string,
  data: Record<string, any>,
  _platform: Platform
): string[] {
  const baseType = getBaseNodeType(nodeType)

  // Fixed-handle types (apiFetch → ["success", "error"] etc.)
  const fixed = getFixedHandles(nodeType)
  if (fixed) return fixed

  // Choice-bearing types: one handle per choice (stable by index)
  if (baseType === "quickReply" || baseType === "list") {
    const choices = (data.choices || []) as ChoiceData[]
    return choices.map((c, i) => c.id || `button-${i}`)
  }

  // Single-output types (question, message, name, email, etc.) render a
  // handleless default edge; we model that as one "default" handle here
  // so contraction-to-default cases can route to it.
  return ["default"]
}

/**
 * Discriminated classification of what to do with a node's outgoing edges
 * when an AI nodeUpdate switches the node to a new type in place.
 */
type TypeChangeClassification =
  | { kind: "no-edges" }
  | { kind: "preserve" }
  | { kind: "fanout"; sharedTarget: string; newHandles: string[] }
  | { kind: "collapse"; sharedTarget: string; defaultHandle?: string }
  | {
      kind: "ambiguous"
      reason: string
      oldTargets: Array<{ handle: string; target: string }>
      newHandles: string[]
    }

/**
 * Decide how to rewire an existing node's outgoing edges when its type
 * changes via a nodeUpdate.
 *
 * Rules (in order):
 *  1. No outgoing edges → no work.
 *  2. Same base type (e.g. whatsappQuestion → instagramQuestion, or
 *     quickReply ↔ interactiveList which both live on data.choices with
 *     identical handle IDs) → preserve all edges as-is.
 *  3. Contraction with all-same-target → collapse old edges to a single
 *     edge on the new type's default handle.
 *  4. Otherwise (multiple distinct targets, shape mismatch, or new type
 *     has fewer handles than the old node used) → ambiguous. Caller
 *     should refuse the nodeUpdate and push an `ambiguous_type_change`
 *     warning so apply_edit surfaces a question to the user.
 */
function classifyTypeChange(
  existingNode: Node,
  newType: string,
  updatedData: Record<string, any>,
  platform: Platform,
  existingEdges: Edge[]
): TypeChangeClassification {
  const outgoing = existingEdges.filter((e) => e.source === existingNode.id)
  if (outgoing.length === 0) return { kind: "no-edges" }

  const oldBaseType = getBaseNodeType(existingNode.type || "")
  const newBaseType = getBaseNodeType(newType)

  // Same-family: both types are choice-bearing (quickReply ↔ interactiveList).
  // Both read data.choices the same way, so handle IDs are preserved by the
  // data replacement in applyNodeUpdates — preserve all edges.
  const choiceBearingBaseTypes = new Set(["quickReply", "list"])
  if (
    choiceBearingBaseTypes.has(oldBaseType) &&
    choiceBearingBaseTypes.has(newBaseType)
  ) {
    return { kind: "preserve" }
  }

  // Cross-platform same base type (e.g. whatsappQuestion → instagramQuestion)
  // has identical topology.
  if (oldBaseType === newBaseType) {
    return { kind: "preserve" }
  }

  // Figure out the new type's outgoing handles after the update.
  const newHandles = computeOutgoingHandles(newType, updatedData, platform)

  // Figure out which handles the old edges actually use, and where they go.
  const oldHandleUsage = new Map<string, string>() // handle → target
  for (const edge of outgoing) {
    const handle = edge.sourceHandle || "default"
    oldHandleUsage.set(handle, edge.target)
  }

  const uniqueTargets = new Set(Array.from(oldHandleUsage.values()))

  // Expansion (Case C): the old node had a single outgoing edge (typically
  // on the default handle, e.g. question → msg-N), and the new type exposes
  // MORE handles than the old node used. Fan out: wire every new handle to
  // the same target so the flow stays reachable. The user can differentiate
  // buttons afterwards.
  // Common case: question (1 default edge → msg-N) → quickReply with 3
  // choices produces 3 edges: choice-0→msg-N, choice-1→msg-N, choice-2→msg-N.
  if (outgoing.length === 1 && newHandles.length > 1) {
    const sharedTarget = Array.from(uniqueTargets)[0]
    return {
      kind: "fanout",
      sharedTarget,
      newHandles,
    }
  }

  // Contraction with all-same-target: collapse to the new default handle.
  // Common case: quickReply (3 buttons all → msg-N) → question = 1 edge.
  if (uniqueTargets.size === 1) {
    const sharedTarget = Array.from(uniqueTargets)[0]
    return {
      kind: "collapse",
      sharedTarget,
      defaultHandle: newHandles[0], // first handle of the new type
    }
  }

  // Multiple distinct targets in the old outgoing edges.
  // If the new type has fewer handles than the old node used, contraction
  // is ambiguous because we'd have to drop some targets.
  if (newHandles.length < oldHandleUsage.size) {
    return {
      kind: "ambiguous",
      reason: `new type "${newType}" has fewer outgoing handles (${newHandles.length}) than the existing node's used handles (${oldHandleUsage.size}), and edges point to different targets`,
      oldTargets: Array.from(oldHandleUsage.entries()).map(([handle, target]) => ({
        handle,
        target,
      })),
      newHandles,
    }
  }

  // Multiple distinct targets AND enough new handles to fit them — still
  // ambiguous because we don't know which old target maps to which new
  // handle. Refuse and ask the user.
  return {
    kind: "ambiguous",
    reason: `cannot determine which old edge should map to which new handle on "${newType}"`,
    oldTargets: Array.from(oldHandleUsage.entries()).map(([handle, target]) => ({
      handle,
      target,
    })),
    newHandles,
  }
}

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
  platform: Platform,
  templateResolver?: TemplateResolver,
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
    templateResolver,
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
  existingEdges: Edge[] = [],
  templateResolver?: TemplateResolver,
): BuildEditFlowResult {
  const newNodes: Node[] = []
  const newEdges: Edge[] = []
  const nodeOrder: string[] = []
  const nodeUpdates: BuildEditFlowResult["nodeUpdates"] = []
  const warnings: string[] = []
  const positionShiftMap = new Map<string, number>() // nodeId → total dx

  // Map from step.localId → generated node ID, populated as chains are
  // walked. Resolved in addEdges processing below so the AI can reference
  // a newly-created chain node by a stable handle before its real ID
  // has been generated. Valid only within this single apply_edit plan.
  const localIdMap = new Map<string, string>()

  // Seeded from plan.removeEdges, extended by topology handling below
  // (e.g. cross-type nodeUpdate collapse).
  const removeEdges: EdgeReference[] = [...(plan.removeEdges || [])]

  // Normalize AI aliases in chain steps
  if (plan.chains) {
    plan = { ...plan, chains: plan.chains.map((c) => ({ ...c, steps: normalizeSteps(c.steps, platform) })) }
  }

  // Process nodeUpdates — convert content to node data, preserving existing
  // choice IDs by index. With the unified data.choices field, there's no
  // longer any buttons-vs-options coercion to do — contentToNodeData always
  // produces data.choices regardless of which input field the AI used.
  if (plan.nodeUpdates) {
    for (const update of plan.nodeUpdates) {
      const existingNode = existingNodes.find((n) => n.id === update.nodeId)
      if (!existingNode) {
        warnings.push(`nodeUpdate target "${update.nodeId}" not found — skipped`)
        continue
      }

      // If the AI supplied newType, treat this as a type change: the target
      // type is what newType says. Otherwise it's a content-only update,
      // and the target type is the existing node's type. contentToNodeData
      // uses the target type to decide which data shape to produce.
      const targetType = update.newType ?? existingNode.type ?? ""
      const baseNodeType = getBaseNodeType(targetType)
      const existingBaseType = getBaseNodeType(existingNode.type || "")
      const data = contentToNodeData(update.content, targetType)

      // Same-family choice-bearing conversions (quickReply ↔ interactiveList):
      // if the AI sent listTitle/label without resending choices, backfill
      // from the existing node so applyNodeUpdates' factory-reset overlay
      // keeps the user's data. Must run BEFORE the ID-preservation block
      // below so the existing IDs flow through to the output.
      const choiceBearingBaseTypes = new Set(["quickReply", "list"])
      if (
        choiceBearingBaseTypes.has(existingBaseType) &&
        choiceBearingBaseTypes.has(baseNodeType)
      ) {
        const existingChoices = (existingNode.data as any).choices
        if (Array.isArray(existingChoices) && !Array.isArray((data as any).choices)) {
          ;(data as any).choices = existingChoices
        }
      }

      // Preserve existing choice IDs where possible (match by index)
      if (data.choices && existingNode.data.choices) {
        const existingChoices = existingNode.data.choices as ChoiceData[]
        data.choices = (data.choices as ChoiceData[]).map((c, i) => ({
          ...c,
          id: i < existingChoices.length && existingChoices[i].id
            ? existingChoices[i].id
            : c.id,
        }))
      }

      // Cross-type edge topology handling. When this nodeUpdate crosses
      // types (AI supplied a newType different from the existing node's
      // type), classify what to do with the node's outgoing edges:
      //   • preserve / no-edges → no edge work
      //   • collapse → drop old outgoing edges and add one new edge on
      //     the new type's default handle (for same-target contraction)
      //   • ambiguous → refuse the nodeUpdate, push an
      //     `ambiguous_type_change` warning so apply_edit fails loud and
      //     the AI has to ask the user which old targets map to which
      //     new handles.
      if (update.newType && update.newType !== existingNode.type) {
        const classification = classifyTypeChange(
          existingNode,
          update.newType,
          data,
          platform,
          existingEdges
        )

        if (classification.kind === "ambiguous") {
          warnings.push(
            `ambiguous_type_change "${update.nodeId}": ${classification.reason}. ` +
            `Old edges: ${classification.oldTargets.map((t) => `${t.handle}→${t.target}`).join(", ")}. ` +
            `New handles: ${classification.newHandles.join(", ")}. ` +
            `Ask the user which old targets should map to which new handles (or which should be dropped), ` +
            `then retry with the correct addEdges/removeEdges in the same plan.`
          )
          continue // skip this nodeUpdate entirely
        }

        if (classification.kind === "fanout") {
          // Expansion: drop the old single outgoing edge and wire every new
          // handle to the same target. Keeps the flow reachable after
          // question → quickReply-style expansions.
          const oldOutgoing = existingEdges.filter((e) => e.source === existingNode.id)
          for (const e of oldOutgoing) {
            removeEdges.push({
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle || undefined,
            })
          }
          for (const handle of classification.newHandles) {
            const normalized = normalizeHandle(handle)
            newEdges.push({
              id: `e-${existingNode.id}-${classification.sharedTarget}-${normalized || "fanout"}`,
              source: existingNode.id,
              sourceHandle: normalized,
              target: classification.sharedTarget,
              type: "default",
              style: DEFAULT_EDGE_STYLE,
            } as Edge)
          }
          warnings.push(
            `nodeUpdate "${update.nodeId}": type changed ${existingNode.type} → ${update.newType}. ` +
            `Added ${classification.newHandles.length} new handles — all wired to the same target ${classification.sharedTarget}. ` +
            `Differentiate them if needed.`
          )
        }

        if (classification.kind === "collapse") {
          // Drop the old handle-specific outgoing edges and add a single
          // new edge on the new type's default handle pointing to the
          // shared target.
          const oldOutgoing = existingEdges.filter((e) => e.source === existingNode.id)
          for (const e of oldOutgoing) {
            removeEdges.push({
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle || undefined,
            })
          }
          newEdges.push({
            id: `e-${existingNode.id}-${classification.sharedTarget}-collapse`,
            source: existingNode.id,
            sourceHandle: normalizeHandle(classification.defaultHandle),
            target: classification.sharedTarget,
            type: "default",
            style: DEFAULT_EDGE_STYLE,
          } as Edge)
          warnings.push(
            `nodeUpdate "${update.nodeId}": type changed ${existingNode.type} → ${update.newType}. ` +
            `Collapsed ${oldOutgoing.length} outgoing edges to a single edge on the new default handle → ${classification.sharedTarget}.`
          )
        }

        // kind === 'preserve' or 'no-edges' → no edge work needed
      }

      // Auto-convert quickReply → interactiveList when choices exceed the
      // platform's button limit. Only the node TYPE changes — data.choices
      // is left untouched so handle IDs and labels survive the conversion.
      // The auto-convert's newType wins over any AI-supplied newType here,
      // because it's a stricter platform constraint.
      if (baseNodeType === "quickReply" && data.choices) {
        const choices = data.choices as ChoiceData[]
        const conversion = shouldConvertToList(choices.length, platform)
        if (conversion.shouldConvert) {
          nodeUpdates.push({
            nodeId: update.nodeId,
            data: {
              ...data,
              listTitle: (data as any).listTitle || "Select an option",
              label: conversion.newLabel,
            },
            newType: conversion.newNodeType,
          })
          warnings.push(`nodeUpdate "${update.nodeId}": quickReply auto-converted to interactiveList (${choices.length} choices exceeds ${platform} limit)`)
          continue
        }
      }

      nodeUpdates.push({
        nodeId: update.nodeId,
        data,
        ...(update.newType ? { newType: update.newType } : {}),
      })
    }
  }

  // Build a map of updated node data so chains can see newly-added buttons
  const updatedNodeDataMap = new Map<string, Record<string, unknown>>()
  for (const u of nodeUpdates) {
    updatedNodeDataMap.set(u.nodeId, u.data)
  }

  // Process chains — each chain attaches to an existing node
  for (const chain of plan.chains || []) {
    let anchorNode = existingNodes.find((n) => n.id === chain.attachTo)
    if (!anchorNode) {
      const msg = `Chain attachTo node "${chain.attachTo}" not found — skipped`
      console.warn(`[buildEditFlowFromPlan] ${msg}`)
      warnings.push(msg)
      continue
    }

    // Merge pending nodeUpdates into anchor so handle resolution sees new buttons
    const pendingData = updatedNodeDataMap.get(chain.attachTo)
    if (pendingData) {
      anchorNode = { ...anchorNode, data: { ...anchorNode.data, ...pendingData } }
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
      templateResolver,
      localIdMap,
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
        recordLocalId(firstStep, nodeId, localIdMap, warnings)

        // Resolve attachHandle: "button-N" → actual button ID from the anchor node
        let resolvedHandle = chain.attachHandle
        const buttonMatch = resolvedHandle.match(/^button-(\d+)$/)
        if (buttonMatch) {
          const idx = parseInt(buttonMatch[1], 10)
          const anchorChoices = readChoices(anchorNode)
          const resolved = anchorChoices[idx]?.id
          if (resolved) {
            console.log(`[buildEditFlow] Resolved attachHandle "${resolvedHandle}" → "${resolved}" (button[${idx}] on ${chain.attachTo})`)
            resolvedHandle = resolved
          } else {
            console.warn(`[buildEditFlow] Could not resolve attachHandle "${resolvedHandle}" on ${chain.attachTo} — no button at index ${idx}`)
          }
        }
        const normalizedAttachHandle = normalizeHandle(resolvedHandle)

        newEdges.push({
          id: `e-${chain.attachTo}-${nodeId}-${normalizedAttachHandle || "chain"}`,
          source: chain.attachTo,
          sourceHandle: normalizedAttachHandle,
          target: nodeId,
          type: "default",
          style: DEFAULT_EDGE_STYLE,
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
      // If so, auto-resolve to a free button/option handle (never use "sync-next")
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
        recordLocalId(firstStep, nodeId, localIdMap, warnings)

        // Resolve to a free button/option handle — never use "sync-next" for multi-output nodes
        const freeHandle = findFreeHandle(anchorNode, existingEdges, newEdges)
        if (freeHandle) {
          console.log(`[buildEditFlow] Auto-resolved free handle "${freeHandle}" for chain from multi-output node ${chain.attachTo}`)
        } else {
          console.warn(`[buildEditFlow] No free button/option handle on multi-output node ${chain.attachTo} — all handles occupied`)
          warnings.push(`Chain from "${chain.attachTo}": all button/option handles occupied, edge may be misplaced`)
        }
        newEdges.push({
          id: `e-${chain.attachTo}-${nodeId}-${freeHandle || "chain"}`,
          source: chain.attachTo,
          sourceHandle: normalizeHandle(freeHandle),
          target: nodeId,
          type: "default",
          style: DEFAULT_EDGE_STYLE,
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
        // If the last node in the chain is a multi-output node, connect ALL free
        // button/option handles to the target — connectTo means "all outputs → target"
        const lastNode = newNodes.find(n => n.id === lastNodeId)
        const lastNodeIsMultiOutput = lastNode?.type ? isMultiOutputType(lastNode.type) : false

        if (lastNodeIsMultiOutput && lastNode) {
          const lastFixedHandles = getFixedHandles(lastNode.type || "")
          const occupied = new Set(
            [...existingEdges, ...newEdges]
              .filter(e => e.source === lastNodeId && e.sourceHandle)
              .map(e => e.sourceHandle!)
          )

          if (lastFixedHandles) {
            // Fixed-handle nodes (apiFetch): use fixed handle IDs
            for (const handle of lastFixedHandles) {
              if (!occupied.has(handle)) {
                newEdges.push({
                  id: `e-${lastNodeId}-${chain.connectTo}-${handle}`,
                  source: lastNodeId,
                  sourceHandle: handle,
                  target: chain.connectTo,
                  type: "default",
                  style: DEFAULT_EDGE_STYLE,
                } as Edge)
              }
            }
          } else {
            // Button/option nodes: use dynamic button/option IDs
            const handles = readChoices(lastNode)
            for (let i = 0; i < handles.length; i++) {
              const handleId = handles[i]?.id || `button-${i}`
              if (!occupied.has(handleId)) {
                newEdges.push({
                  id: `e-${lastNodeId}-${chain.connectTo}-btn${i}`,
                  source: lastNodeId,
                  sourceHandle: handleId,
                  target: chain.connectTo,
                  type: "default",
                  style: DEFAULT_EDGE_STYLE,
                } as Edge)
              }
            }
          }
        } else {
          newEdges.push({
            id: `e-${lastNodeId}-${chain.connectTo}`,
            source: lastNodeId,
            target: chain.connectTo,
            type: "default",
            style: DEFAULT_EDGE_STYLE,
          } as Edge)
        }

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
      // Resolve localId:X references to actual node IDs before any
      // validation runs, so the downstream "source/target not found"
      // checks operate on real IDs. A `localId:` prefix that doesn't
      // match any chain step short-circuits this edge with a dedicated
      // warning — we do NOT fall through to the generic not-found
      // message, because that one tells the AI a different fix
      // (use connectTo / newType) that doesn't apply here.
      let resolvedSource = newEdge.source
      let resolvedTarget = newEdge.target

      if (resolvedSource.startsWith("localId:")) {
        const key = resolvedSource.slice("localId:".length)
        const mapped = localIdMap.get(key)
        if (mapped) {
          resolvedSource = mapped
        } else {
          warnings.push(
            `addEdge ${newEdge.source} → ${newEdge.target} skipped: localId "${key}" not found in this plan. ` +
            `Either the localId was never defined on any chain's step, or it was mistyped. ` +
            `Make sure the chain step has \`localId: "${key}"\` exactly.`
          )
          continue
        }
      }
      if (resolvedTarget.startsWith("localId:")) {
        const key = resolvedTarget.slice("localId:".length)
        const mapped = localIdMap.get(key)
        if (mapped) {
          resolvedTarget = mapped
        } else {
          warnings.push(
            `addEdge ${newEdge.source} → ${newEdge.target} skipped: localId "${key}" not found in this plan. ` +
            `Either the localId was never defined on any chain's step, or it was mistyped. ` +
            `Make sure the chain step has \`localId: "${key}"\` exactly.`
          )
          continue
        }
      }

      // Validate source/target existence and reject self-loops
      const sourceExists = allNodes.some(n => n.id === resolvedSource)
      const targetExists = allNodes.some(n => n.id === resolvedTarget)
      if (!sourceExists || !targetExists) {
        const missing: string[] = []
        if (!sourceExists) missing.push(`source "${resolvedSource}"`)
        if (!targetExists) missing.push(`target "${resolvedTarget}"`)
        console.warn(`[buildEditFlow] Skipping addEdge: ${missing.join(" and ")} not found`)
        warnings.push(
          `addEdge ${resolvedSource} → ${resolvedTarget} skipped: ${missing.join(" and ")} not found. ` +
          `IDs assigned to newly-created nodes (from chains) are NOT derived from removed node IDs — ` +
          `they are generated fresh. To fan-in multiple existing nodes to a new node you CANNOT reference ` +
          `the new node by ID in addEdges until it exists. Use either (a) one chain per fan-in source with ` +
          `attachTo set and connectTo pointing at the shared target, or (b) nodeUpdates with newType to ` +
          `change an existing node in place so its ID and incoming edges are preserved, or (c) assign a ` +
          `localId on the chain step that creates the new node and reference it as "localId:<name>" in ` +
          `this addEdge.`
        )
        continue
      }
      if (resolvedSource === resolvedTarget) {
        console.warn(`[buildEditFlow] Skipping self-loop addEdge: ${resolvedSource} → ${resolvedTarget}`)
        warnings.push(`addEdge ${resolvedSource} → ${resolvedTarget} skipped: self-loops are not allowed.`)
        continue
      }

      let sourceHandle = newEdge.sourceHandle

      // Resolve buttonIndex → actual button ID
      if (newEdge.sourceButtonIndex !== undefined && !sourceHandle) {
        const sourceNode = allNodes.find(n => n.id === resolvedSource)
        if (sourceNode) {
          // Check updated data first, then existing node data
          const updatedData = updatedNodeData.get(resolvedSource)
          const choices = (updatedData?.choices ?? readChoices(sourceNode)) as ChoiceData[]
          sourceHandle = choices[newEdge.sourceButtonIndex]?.id
            || `button-${newEdge.sourceButtonIndex}`
        }
      }

      // Also resolve "button-N" style sourceHandle to actual button ID
      if (sourceHandle) {
        const buttonMatch = sourceHandle.match(/^button-(\d+)$/)
        if (buttonMatch) {
          const idx = parseInt(buttonMatch[1], 10)
          const sourceNode = allNodes.find(n => n.id === resolvedSource)
          if (sourceNode) {
            const updatedData = updatedNodeData.get(resolvedSource)
            const choices = (updatedData?.choices ?? readChoices(sourceNode)) as ChoiceData[]
            const resolved = choices[idx]?.id
            if (resolved) {
              console.log(`[buildEditFlow] Resolved addEdge sourceHandle "${sourceHandle}" → "${resolved}"`)
              sourceHandle = resolved
            }
          }
        }
      }

      const normalizedAddHandle = normalizeHandle(sourceHandle)
      newEdges.push({
        id: `e-${resolvedSource}-${resolvedTarget}-${normalizedAddHandle || 'edge'}`,
        source: resolvedSource,
        target: resolvedTarget,
        sourceHandle: normalizedAddHandle,
        type: "default",
        style: DEFAULT_EDGE_STYLE,
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
      removeEdges.map(e => `${e.source}-${e.target}`)
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
    removeEdges,
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
  templateResolver?: TemplateResolver
  /**
   * Map from step.localId → generated node ID. Only set by
   * buildEditFlowFromPlan — buildFlowFromPlan leaves it undefined since
   * localId is an edit-plan-only feature. Entries are recorded at every
   * site that creates a new node from a NodeStep with `localId` set.
   */
  localIdMap?: Map<string, string>
}

/**
 * Record a step.localId → nodeId mapping, warning on duplicates (second
 * occurrence wins, matching the documented behavior). No-op when the
 * context has no localIdMap (i.e. called from buildFlowFromPlan).
 */
function recordLocalId(
  step: NodeStep,
  nodeId: string,
  localIdMap: Map<string, string> | undefined,
  warnings: string[]
): void {
  if (!localIdMap || !step.localId) return
  if (localIdMap.has(step.localId)) {
    warnings.push(
      `duplicate localId "${step.localId}" — second occurrence on node ${nodeId} overwrites the first`
    )
  }
  localIdMap.set(step.localId, nodeId)
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

  // Handle flowTemplate nodes — look up the template by ID
  if (step.nodeType === "flowTemplate" && step.content?.templateId) {
    const templateId = step.content.templateId
    // Check default templates first
    const defaultTpl = DEFAULT_TEMPLATES.find(t => t.id === templateId)
    // Then try the resolver for user templates
    const resolvedData = !defaultTpl && ctx.templateResolver
      ? ctx.templateResolver(templateId)
      : null

    const tplNodes = defaultTpl?.nodes ?? resolvedData?.nodes
    const tplEdges = defaultTpl?.edges ?? resolvedData?.edges
    const tplName = defaultTpl?.name ?? step.content?.label ?? "Template"

    if (tplNodes) {
      let position = ctx.layout.getNextSequentialPosition()
      const nodeId = `plan-flowTemplate-${ctx.nodes.length + 1}-${rand4()}`
      const node = createFlowTemplateNode(platform, position, {
        sourceTemplateId: templateId,
        templateName: tplName,
        internalNodes: tplNodes,
        internalEdges: tplEdges || [],
      }, nodeId)

      ctx.nodes.push(node)
      ctx.nodeOrder.push(nodeId)
      recordLocalId(step, nodeId, ctx.localIdMap, ctx.warnings)

      const edgeId = `e-${ctx.previousNodeId}-${nodeId}`
      ctx.edges.push({
        id: edgeId,
        source: ctx.previousNodeId,
        target: nodeId,
        type: "default",
        style: DEFAULT_EDGE_STYLE,
      } as Edge)

      ctx.previousNodeId = nodeId
      return
    }

    // Template not found anywhere
    ctx.warnings.push(`Template "${templateId}" not found — skipped`)
    return
  }

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
  recordLocalId(step, nodeId, ctx.localIdMap, ctx.warnings)

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
      // If the branch endpoint is a multi-output node, create edges for all handles
      const endpointNode = ctx.nodes.find(n => n.id === endpointId)
      const endpointType = endpointNode?.type || ""
      const endpointFixedHandles = endpointNode?.type ? getFixedHandles(endpointNode.type) : null

      if (endpointFixedHandles) {
        // Fixed-handle nodes (apiFetch): use fixed handle IDs
        for (const handle of endpointFixedHandles) {
          ctx.edges.push({
            id: `e-${endpointId}-${nodeId}-${handle}`,
            source: endpointId,
            sourceHandle: handle,
            target: nodeId,
            type: "default",
            style: DEFAULT_EDGE_STYLE,
          } as Edge)
        }
      } else if (endpointNode && isMultiOutputType(endpointType)) {
        // Button/option nodes: use dynamic button/option IDs
        const handles = readChoices(endpointNode)
        for (let i = 0; i < handles.length; i++) {
          const handleId = handles[i]?.id || `button-${i}`
          ctx.edges.push({
            id: `e-${endpointId}-${nodeId}-btn${i}`,
            source: endpointId,
            sourceHandle: handleId,
            target: nodeId,
            type: "default",
            style: DEFAULT_EDGE_STYLE,
          } as Edge)
        }
      } else {
        ctx.edges.push({
          id: `e-${endpointId}-${nodeId}`,
          source: endpointId,
          target: nodeId,
          type: "default",
          style: DEFAULT_EDGE_STYLE,
        } as Edge)
      }
    }
    // Reset convergence state
    ctx.branchEndpoints = []
    ctx.lastMultiOutputNodeId = null
    ctx.maxBranchX = 0

  } else if (ctx.previousNodeId === ctx.lastMultiOutputNodeId) {
    // DIRECT CONVERGENCE: no branches were created, all outputs → same node
    const parentNode = ctx.nodes.find(n => n.id === ctx.lastMultiOutputNodeId)
    const fixedHandles = parentNode?.type ? getFixedHandles(parentNode.type) : null

    if (fixedHandles) {
      // Fixed-handle nodes (apiFetch): use fixed handle IDs
      for (let i = 0; i < fixedHandles.length; i++) {
        ctx.edges.push({
          id: `e-${ctx.lastMultiOutputNodeId}-${nodeId}-${fixedHandles[i]}`,
          source: ctx.lastMultiOutputNodeId,
          sourceHandle: fixedHandles[i],
          target: nodeId,
          type: "default",
          style: DEFAULT_EDGE_STYLE,
        } as Edge)
      }
    } else {
      // Button/option nodes: use dynamic button/option IDs
      const choices = readChoices(parentNode)
      const handleCount = choices.length || 1
      for (let i = 0; i < handleCount; i++) {
        const handleId = choices[i]?.id || `button-${i}`
        ctx.edges.push({
          id: `e-${ctx.lastMultiOutputNodeId}-${nodeId}-btn${i}`,
          source: ctx.lastMultiOutputNodeId,
          sourceHandle: handleId,
          target: nodeId,
          type: "default",
          style: DEFAULT_EDGE_STYLE,
        } as Edge)
      }
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
      style: DEFAULT_EDGE_STYLE,
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
  if (step.buttonIndex < 0 || step.buttonIndex >= buttonLimit) return // invalid or exceeds platform limit

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
    localIdMap: ctx.localIdMap,
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
    recordLocalId(firstStep, nodeId, ctx.localIdMap, ctx.warnings)

    // Edge from parent with sourceHandle
    // Fixed-handle nodes (apiFetch): use fixed handle IDs (e.g. "success"/"error")
    // Button/option nodes: use stable button/option ID if available
    const fixedHandles = getFixedHandles(parentNode.type || "")
    let handleId: string
    if (fixedHandles && step.buttonIndex < fixedHandles.length) {
      handleId = fixedHandles[step.buttonIndex]
    } else {
      const parentChoices = readChoices(parentNode)
      handleId = parentChoices[step.buttonIndex]?.id || `button-${step.buttonIndex}`
    }
    const edgeId = `e-${parentId}-${nodeId}-btn${step.buttonIndex}`
    ctx.edges.push({
      id: edgeId,
      source: parentId,
      sourceHandle: handleId,
      target: nodeId,
      type: "default",
      style: DEFAULT_EDGE_STYLE,
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
  // flowTemplate is valid for all platforms
  if (nodeType === "flowTemplate") return true

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
 * Maps any of content.choices / content.buttons / content.options →
 * ChoiceData[] at data.choices. Auto-generates storeAs from label/question
 * for storable node types.
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

  // Map content.choices → data.choices. Canonical field for both
  // whatsappQuickReply and whatsappInteractiveList items.
  const rawChoices = content.choices
  if (rawChoices && rawChoices.length > 0) {
    data.choices = rawChoices.map((text, i): ChoiceData => createChoiceData(text, i))
  }

  // apiFetch fields
  if (content.url) data.url = content.url
  if (content.method) data.method = content.method
  if (content.headers) data.headers = content.headers
  if (content.body) data.body = content.body
  if (content.responseMapping) data.responseMapping = content.responseMapping
  if (content.fallbackMessage) data.fallbackMessage = content.fallbackMessage

  // templateMessage — Meta-approved WhatsApp templates
  if (nodeType === "templateMessage") {
    if (content.templateId) data.templateId = content.templateId
    if (content.templateName) data.templateName = content.templateName
    if (content.displayName) data.displayName = content.displayName
    if (content.language) data.language = content.language
    if (content.category) data.category = content.category
    if (content.headerType) data.headerType = content.headerType
    if (content.bodyPreview) data.bodyPreview = content.bodyPreview

    if (content.templateButtons) {
      data.buttons = content.templateButtons.map((b, i) => ({
        ...b,
        type: String(b.type || "").toLowerCase(),
        id: b.id || `btn-${i}`,
      }))
    }

    if (content.parameterMappings) {
      data.parameterMappings = content.parameterMappings
    } else if (content.bodyPreview) {
      data.parameterMappings = extractTemplateVariables(content.bodyPreview)
        .map((v) => ({ templateVar: v, flowValue: "" }))
    }
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
 * Auto-convert quickReply → interactiveList when choices exceed platform
 * limit. Only the node TYPE is swapped — data.choices is left untouched so
 * handle IDs and labels survive the conversion. Mutates the node in place.
 * Returns the effective base nodeType after conversion.
 */
function maybeAutoConvertToList(
  node: Node,
  originalType: string,
  platform: Platform,
  warnings: string[]
): string {
  if (originalType !== "quickReply") return originalType

  const choices = readChoices(node)
  const limit = BUTTON_LIMITS[platform]

  if (choices.length <= limit) return originalType

  const conversion = shouldConvertToList(choices.length, platform)

  if (!conversion.shouldConvert) {
    // Can't convert (e.g., web doesn't have interactiveList) — trim choices
    node.data = { ...node.data, choices: choices.slice(0, limit) }
    warnings.push(`quickReply trimmed from ${choices.length} to ${limit} choices (${platform} limit)`)
    return originalType
  }

  // Convert: swap node type, keep data.choices intact
  try {
    const listNode = createNode("interactiveList", platform, node.position, node.id)
    node.type = listNode.type
    node.data = {
      ...listNode.data,
      ...node.data,
      listTitle: (node.data as any)?.listTitle || "Select an option",
    }
  } catch {
    // Fallback: trim choices if createNode fails
    node.data = { ...node.data, choices: choices.slice(0, limit) }
    warnings.push(`quickReply trimmed from ${choices.length} to ${limit} choices (createNode fallback)`)
    return originalType
  }

  warnings.push(`quickReply auto-converted to interactiveList: ${choices.length} choices exceeds ${platform} limit of ${limit}`)
  return "interactiveList"
}

/**
 * For multi-output nodes (quickReply / interactiveList), find the first
 * button or option handle that doesn't already have an outgoing edge.
 * Returns undefined if all handles are occupied (caller should skip the edge
 * or fall back to a warning — never use "sync-next").
 */
function findFreeHandle(
  anchorNode: Node,
  existingEdges: Edge[],
  newEdges: Edge[]
): string | undefined {
  const choices = readChoices(anchorNode)
  const allHandles = choices.map(c => c.id).filter(Boolean) as string[]
  if (allHandles.length === 0) return undefined

  const occupied = new Set<string>()
  for (const e of existingEdges) {
    if (e.source === anchorNode.id && e.sourceHandle) occupied.add(e.sourceHandle)
  }
  for (const e of newEdges) {
    if (e.source === anchorNode.id && e.sourceHandle) occupied.add(e.sourceHandle)
  }

  return allHandles.find(h => !occupied.has(h))
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
    const key = `${edge.source}-${edge.sourceHandle || ""}`
    if (!seen.has(key)) {
      seen.set(key, edge)
    }
  }
  return Array.from(seen.values())
}
