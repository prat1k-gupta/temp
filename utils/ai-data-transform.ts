import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { getBaseNodeType } from "./platform-helpers"
import { createNode } from "./node-factory"
import { createChoiceData } from "./node-operations"
import { autoPopulateStoreAs } from "./flow-plan-builder"

/**
 * Transform AI node data — normalizes any input shape (choices / buttons /
 * options / string[]) into the canonical data.choices array for quickReply
 * and interactiveList nodes. Non-choice fields pass through untouched.
 */
export function transformAiNodeData(aiData: Record<string, any>, baseType: string): Record<string, any> {
  const transformed = { ...aiData }

  if (baseType !== "quickReply" && baseType !== "list") {
    return transformed
  }

  // Precedence: choices > buttons > options. The AI may still emit the
  // legacy field names; we coerce them all into data.choices.
  const raw = transformed.choices ?? transformed.buttons ?? transformed.options
  delete transformed.buttons
  delete transformed.options

  if (!Array.isArray(raw)) {
    return transformed
  }

  transformed.choices = raw.map((entry: string | any, index: number) => {
    const text = typeof entry === "string"
      ? entry
      : entry?.text ?? entry?.label ?? ""
    const base = createChoiceData(text, index)
    if (typeof entry === "object" && entry?.id) {
      return { ...base, id: entry.id }
    }
    return base
  })

  return transformed
}

/**
 * Normalize a generic AI node type to a base type.
 * Always returns base types — the factory (createNode) handles platform mapping internally.
 */
export function normalizeAiNodeType(type: string, _platform: Platform): string {
  const baseType = getBaseNodeType(type)
  if (baseType === "list") return "interactiveList"
  return baseType
}

/**
 * Process AI-generated nodes into proper ReactFlow nodes
 */
export function processAiNodes(
  aiNodes: any[],
  platform: Platform,
  existingStartNode?: Node
): Node[] {
  const processedNodes: Node[] = []

  if (existingStartNode) {
    processedNodes.push(existingStartNode)
  }

  for (const aiNode of aiNodes || []) {
    if (!aiNode.id || !aiNode.type) {
      console.warn("[processAiNodes] Skipping node without id or type:", aiNode)
      continue
    }

    if (aiNode.type === "start") {
      continue
    }

    try {
      const nodePlatform = (aiNode.data?.platform as Platform) || platform
      const nodePosition = aiNode.position || { x: 250, y: 200 }
      const nodeTypeToCreate = normalizeAiNodeType(aiNode.type, platform)
      const baseType = getBaseNodeType(aiNode.type)

      const newNode = createNode(nodeTypeToCreate, nodePlatform, nodePosition, aiNode.id)

      const transformedAiData = transformAiNodeData(aiNode.data || {}, baseType)
      const mergedData = { ...newNode.data, ...transformedAiData }

      processedNodes.push({
        ...newNode,
        ...aiNode,
        data: mergedData,
        position: nodePosition,
      })
    } catch (error) {
      console.warn(`[processAiNodes] Skipping unrecognized node type "${aiNode.type}":`, error)
      continue
    }
  }

  autoPopulateStoreAs(processedNodes)

  return processedNodes
}

/**
 * Process AI-generated edges, filtering out invalid ones
 */
export function processAiEdges(aiEdges: any[], validNodeIds: Set<string>): Edge[] {
  const processedEdges: Edge[] = []

  for (const aiEdge of aiEdges || []) {
    if (!aiEdge.source || !aiEdge.target) {
      console.warn(`[processAiEdges] Skipping edge ${aiEdge.id}: missing source or target`)
      continue
    }

    if (aiEdge.source === aiEdge.target) {
      console.warn(`[processAiEdges] Skipping self-loop edge: ${aiEdge.source} → ${aiEdge.target}`)
      continue
    }

    if (validNodeIds.has(aiEdge.source) && validNodeIds.has(aiEdge.target)) {
      processedEdges.push({
        id: aiEdge.id || `e-${aiEdge.source}-${aiEdge.target}`,
        source: aiEdge.source,
        target: aiEdge.target,
        type: aiEdge.type || "default",
        sourceHandle: aiEdge.sourceHandle,
        targetHandle: aiEdge.targetHandle,
        style: aiEdge.style,
      } as Edge)
    } else {
      console.warn(`[processAiEdges] Skipping edge ${aiEdge.id}: source or target node not found`)
    }
  }

  return processedEdges
}
