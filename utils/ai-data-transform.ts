import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { getBaseNodeType } from "./platform-helpers"
import { createNode } from "./node-factory"

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
        return {
          id: `btn-${Date.now()}-${index}`,
          text,
          label: text,
        }
      })
      delete transformed.options
    }
    // Also handle if buttons are provided as strings
    if (Array.isArray(transformed.buttons) && transformed.buttons.length > 0) {
      transformed.buttons = transformed.buttons.map((btn: string | any, index: number) => {
        if (typeof btn === "string") {
          return {
            id: `btn-${Date.now()}-${index}`,
            text: btn,
            label: btn,
          }
        }
        return {
          id: btn.id || `btn-${Date.now()}-${index}`,
          text: btn.text || btn.label || "",
          label: btn.label || btn.text || "",
        }
      })
    }
  } else if (baseType === "list") {
    // Transform options to proper format for list nodes
    if (Array.isArray(transformed.options)) {
      transformed.options = transformed.options.map((opt: string | any) => ({
        text: typeof opt === "string" ? opt : (opt.text || opt.label || ""),
      }))
    }
  }

  return transformed
}

/**
 * Normalize a generic AI node type to a platform-specific type
 */
export function normalizeAiNodeType(type: string, platform: Platform): string {
  const baseType = getBaseNodeType(type)

  if (baseType === "list") {
    return platform === "whatsapp" ? "whatsappList"
      : platform === "instagram" ? "instagramList"
        : "whatsappList"
  } else if (baseType === "question" && !type.includes(platform)) {
    return platform === "whatsapp" ? "whatsappQuestion"
      : platform === "instagram" ? "instagramQuestion"
        : "webQuestion"
  } else if (baseType === "quickReply" && !type.includes(platform)) {
    return platform === "whatsapp" ? "whatsappQuickReply"
      : platform === "instagram" ? "instagramQuickReply"
        : "webQuickReply"
  }

  return type
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
      console.error(`[processAiNodes] Error creating node ${aiNode.type}:`, error)
      processedNodes.push({
        id: aiNode.id,
        type: aiNode.type,
        position: aiNode.position || { x: 250, y: 200 },
        data: {
          platform: (aiNode.data?.platform as Platform) || platform,
          ...(aiNode.data || {}),
        },
      } as Node)
    }
  }

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
