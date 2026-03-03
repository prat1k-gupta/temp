import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { getBaseNodeType } from "./platform-helpers"
import { createNode } from "./node-factory"
import { createButtonData } from "./node-operations"
import { autoPopulateStoreAs } from "./flow-plan-builder"

/**
 * Transform AI node data - handles quickReply options→buttons conversion,
 * string→object normalization, and list option formatting
 */
export function transformAiNodeData(aiData: Record<string, any>, baseType: string): Record<string, any> {
  const transformed = { ...aiData }

  if (baseType === "quickReply") {
    // Convert options to buttons for quickReply nodes
    if (Array.isArray(transformed.options) && !transformed.buttons) {
      transformed.buttons = transformed.options.map((opt: string | any, index: number) => {
        const text = typeof opt === "string" ? opt : (opt.text || opt.label || "")
        return createButtonData(text, index)
      })
      delete transformed.options
    }
    // Also handle if buttons are provided as strings
    if (Array.isArray(transformed.buttons) && transformed.buttons.length > 0) {
      transformed.buttons = transformed.buttons.map((btn: string | any, index: number) => {
        if (typeof btn === "string") {
          return createButtonData(btn, index)
        }
        return {
          ...createButtonData(btn.text || btn.label || "", index),
          id: btn.id || createButtonData("", index).id,
          text: btn.text || btn.label || "",
        }
      })
    }
  } else if (baseType === "list") {
    // Transform options to proper format for list nodes, preserving stable IDs
    if (Array.isArray(transformed.options)) {
      transformed.options = transformed.options.map((opt: string | any) => {
        if (typeof opt === "string") return { text: opt }
        return { ...opt, text: opt.text || opt.label || "" }
      })
    }
  }

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
