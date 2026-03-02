import { useState, useCallback, useEffect } from "react"
import type { Node, Edge } from "@xyflow/react"
import { addEdge } from "@xyflow/react"
import type { Platform } from "@/types"
import { getBaseNodeType } from "@/utils/platform-helpers"
import { createNode, createCommentNode } from "@/utils/node-factory"
import { processAiNodes, processAiEdges, transformAiNodeData, normalizeAiNodeType } from "@/utils/ai-data-transform"
import { changeTracker } from "@/utils/change-tracker"
import { updateFlow } from "@/utils/flow-storage"
import type { FlowData } from "@/utils/flow-storage"
import { useNodeSuggestions } from "@/hooks/use-node-suggestions"
import { toast } from "sonner"

interface UseFlowAIParams {
  flowId: string
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setPlatform: (platform: Platform) => void
  selectedNode: Node | null
  deleteNode: (nodeId: string) => void
  setNodeToFocus: (nodeId: string | null) => void
  isEditMode: boolean
  autoEnterEditMode: (
    setNodes: any,
    setEdges: any,
    setPlatform: any,
    nodes: Node[],
    edges: Edge[],
    platform: Platform
  ) => void
  updateDraftChanges: () => void
  currentFlow: FlowData | null
  setCurrentFlow: React.Dispatch<React.SetStateAction<FlowData | null>>
}

export function useFlowAI({
  flowId,
  nodes,
  edges,
  platform,
  setNodes,
  setEdges,
  setPlatform,
  selectedNode,
  deleteNode,
  setNodeToFocus,
  isEditMode,
  autoEnterEditMode,
  updateDraftChanges,
  currentFlow,
  setCurrentFlow,
}: UseFlowAIParams) {
  const [isAISuggestionsPanelOpen, setIsAISuggestionsPanelOpen] = useState(false)

  const { suggestions, loading: suggestionsLoading, fetchSuggestions, clearSuggestions } = useNodeSuggestions()

  /** Helper: auto-enter edit mode if not already in it */
  const withEditTracking = useCallback(() => {
    if (!isEditMode) {
      autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
    }
  }, [isEditMode, autoEnterEditMode, setNodes, setEdges, setPlatform, nodes, edges, platform])

  // Fetch suggestions when node is selected
  useEffect(() => {
    if (selectedNode && selectedNode.type && selectedNode.type !== "start" && selectedNode.type !== "comment") {
      setIsAISuggestionsPanelOpen(true)
      fetchSuggestions({
        currentNodeType: selectedNode.type,
        platform,
        flowContext: currentFlow?.description,
        existingNodes: nodes
          .filter((n) => n.type)
          .map((n) => ({ type: n.type!, label: n.data.label as string | undefined })),
        maxSuggestions: 2,
      })
    } else {
      setIsAISuggestionsPanelOpen(false)
      clearSuggestions()
    }

    return () => {
      clearSuggestions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, selectedNode?.type, platform, currentFlow?.description])

  const onAcceptAISuggestion = useCallback(
    (suggestion: { type: string; generatedContent?: any }) => {
      if (!selectedNode) {
        toast.error("No node selected")
        return
      }

      // Normalize node type
      let normalizedType = suggestion.type

      if (
        normalizedType === "list" ||
        normalizedType === "interactiveList" ||
        normalizedType === "whatsappInteractiveList"
      ) {
        normalizedType = "interactiveList"
      } else if (
        normalizedType === "whatsappQuestion" ||
        normalizedType === "instagramQuestion" ||
        normalizedType === "webQuestion"
      ) {
        normalizedType = "question"
      } else if (
        normalizedType === "whatsappQuickReply" ||
        normalizedType === "instagramQuickReply" ||
        normalizedType === "webQuickReply"
      ) {
        normalizedType = "quickReply"
      } else if (["whatsappMessage", "instagramDM", "instagramStory"].includes(normalizedType)) {
        // Keep as-is
      } else {
        const baseType = getBaseNodeType(suggestion.type)
        if (baseType !== suggestion.type) {
          normalizedType = baseType
        }
      }

      const newNodeId = `${suggestion.type}-${Date.now()}`
      let newNode: Node

      try {
        const nodePosition = {
          x: (selectedNode.position.x || 0) + 350,
          y: selectedNode.position.y || 0,
        }

        if (normalizedType === "comment") {
          newNode = createCommentNode(
            platform,
            nodePosition,
            newNodeId,
            (updates: any) => {
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === newNodeId
                    ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                    : node
                )
              )
            },
            () => deleteNode(newNodeId)
          )
        } else {
          newNode = createNode(normalizedType, platform, nodePosition, newNodeId)
        }

        // Populate with generated content
        if (suggestion.generatedContent) {
          const content = suggestion.generatedContent
          const updatedData: any = { ...newNode.data }

          if (content.label) {
            updatedData.label = content.label
          }

          if (["whatsappMessage", "instagramDM", "instagramStory"].includes(normalizedType)) {
            if (content.text) {
              updatedData.text = content.text
            } else if (content.question) {
              updatedData.text = content.question
            }
          } else {
            if (content.question) {
              updatedData.question = content.question
            }
            if (content.text) {
              updatedData.text = content.text
            }
          }

          if (content.buttons && Array.isArray(content.buttons)) {
            updatedData.buttons = content.buttons.map((btn: any, index: number) => ({
              id: `btn-${Date.now()}-${index}`,
              text: btn.text || btn.label || "",
              label: btn.label || btn.text || "",
            }))
          }
          if (content.options && Array.isArray(content.options)) {
            updatedData.options = content.options.map((opt: any) => ({
              text: opt.text || "",
            }))
          }

          newNode.data = updatedData
        }

        withEditTracking()
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])

        const newEdge: Edge = {
          id: `e-${selectedNode.id}-${newNodeId}`,
          source: selectedNode.id,
          target: newNodeId,
          type: "default",
          style: { stroke: "#6366f1", strokeWidth: 2 },
        }

        const existingConnection = edges.find(
          (edge) => edge.source === selectedNode.id && edge.target === newNodeId
        )

        if (!existingConnection) {
          setEdges((eds) => addEdge(newEdge, eds))
          changeTracker.trackEdgeAdd(newEdge)
          updateDraftChanges()
        }

        clearSuggestions()
        setIsAISuggestionsPanelOpen(false)

        setNodeToFocus(newNodeId)
        toast.success(`Added ${newNode.data.label || suggestion.type} node with AI-generated content`)
      } catch (error) {
        console.error(`[v0] Error creating suggested node ${suggestion.type}:`, error)
        toast.error(`Failed to add ${suggestion.type} node`)
      }
    },
    [selectedNode, platform, edges, setNodes, setEdges, deleteNode, withEditTracking, updateDraftChanges, clearSuggestions, setNodeToFocus]
  )

  const onAddNode = useCallback(
    (nodeType: string, position?: { x: number; y: number }) => {
      const newNodeId = `${nodeType}-${Date.now()}`
      let newNode: Node

      try {
        let nodePosition: { x: number; y: number }
        if (position) {
          nodePosition = position
        } else if (selectedNode) {
          nodePosition = {
            x: (selectedNode.position.x || 0) + 350,
            y: selectedNode.position.y || 0,
          }
        } else {
          nodePosition = { x: 250, y: 200 }
        }

        if (nodeType === "comment") {
          newNode = createCommentNode(
            platform,
            nodePosition,
            newNodeId,
            (updates: any) => {
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === newNodeId
                    ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                    : node
                )
              )
            },
            () => deleteNode(newNodeId)
          )
        } else {
          newNode = createNode(nodeType, platform, nodePosition, newNodeId)
        }

        withEditTracking()
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])
        setNodeToFocus(newNodeId)
      } catch (error) {
        console.error(`[v0] Error creating suggested node ${nodeType}:`, error)
        toast.error(`Failed to add ${nodeType} node`)
      }
    },
    [selectedNode, platform, setNodes, deleteNode, withEditTracking, updateDraftChanges, setNodeToFocus]
  )

  const handleApplyFlow = useCallback(
    (flowData: { nodes: Node[]; edges: Edge[] }) => {
      try {
        withEditTracking()

        const existingStartNode = nodes.find((n) => n.id === "1" && n.type === "start")
        const processedNodes = processAiNodes(flowData.nodes, platform, existingStartNode)
        const nodeIds = new Set(processedNodes.map((n) => n.id))
        const processedEdges = processAiEdges(flowData.edges, nodeIds)

        setNodes(processedNodes)
        setEdges(processedEdges)

        processedNodes.forEach((node) => {
          if (node.id !== "1") {
            changeTracker.trackNodeAdd(node)
          }
        })
        processedEdges.forEach((edge) => changeTracker.trackEdgeAdd(edge))
        updateDraftChanges()

        toast.success(
          `AI-generated flow applied successfully! Added ${processedNodes.length - (existingStartNode ? 1 : 0)} nodes and ${processedEdges.length} connections.`
        )
      } catch (error) {
        console.error("[handleApplyFlow] Error:", error)
        toast.error("Failed to apply AI-generated flow. Please try again.")
      }
    },
    [nodes, platform, setNodes, setEdges, withEditTracking, updateDraftChanges]
  )

  const handleUpdateFlow = useCallback(
    (updates: { nodes?: Node[]; edges?: Edge[]; description?: string }) => {
      try {
        withEditTracking()

        if (updates.nodes && updates.nodes.length > 0) {
          const processedNodes: Node[] = []

          for (const aiNode of updates.nodes) {
            if (!aiNode.id || !aiNode.type) {
              console.warn("[handleUpdateFlow] Skipping node without id or type:", aiNode)
              continue
            }

            const existingNode = nodes.find((n) => n.id === aiNode.id)
            const baseType = getBaseNodeType(aiNode.type)

            if (existingNode) {
              const transformedAiData = transformAiNodeData(aiNode.data || {}, baseType)
              const updatedData = { ...existingNode.data, ...transformedAiData }
              processedNodes.push({ ...existingNode, ...aiNode, data: updatedData })
            } else {
              try {
                const nodePlatform = (aiNode.data?.platform as Platform) || platform
                const nodePosition = aiNode.position || { x: 250, y: 200 }
                const nodeTypeToCreate = normalizeAiNodeType(aiNode.type, platform)

                const newNode = createNode(nodeTypeToCreate, nodePlatform, nodePosition, aiNode.id)
                const transformedAiData = transformAiNodeData(aiNode.data || {}, baseType)
                const mergedData = { ...newNode.data, ...transformedAiData }

                processedNodes.push({ ...newNode, ...aiNode, data: mergedData })
              } catch (error) {
                console.error(`[handleUpdateFlow] Error creating node ${aiNode.type}:`, error)
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
          }

          setNodes((nds) => {
            const existingIds = new Set(nds.map((n) => n.id))
            const newNodes = processedNodes.filter((n) => !existingIds.has(n.id))
            const updatedNodes = nds.map((node) => {
              const update = processedNodes.find((n) => n.id === node.id)
              return update || node
            })
            return [...updatedNodes, ...newNodes]
          })

          processedNodes.forEach((node) => {
            if (!nodes.find((n) => n.id === node.id)) {
              changeTracker.trackNodeAdd(node)
            }
          })

          console.log(`[handleUpdateFlow] Processed ${processedNodes.length} nodes`)
        }

        if (updates.edges && updates.edges.length > 0) {
          setEdges((eds) => {
            const existingIds = new Set(eds.map((e) => e.id))
            const newEdges: Edge[] = []

            for (const aiEdge of updates.edges!) {
              if (existingIds.has(aiEdge.id)) continue

              const sourceExists =
                nodes.some((n) => n.id === aiEdge.source) ||
                updates.nodes?.some((n) => n.id === aiEdge.source)
              const targetExists =
                nodes.some((n) => n.id === aiEdge.target) ||
                updates.nodes?.some((n) => n.id === aiEdge.target)

              if (!sourceExists || !targetExists) {
                console.warn(`[handleUpdateFlow] Skipping edge ${aiEdge.id}: source or target node not found`)
                continue
              }

              const newEdge: Edge = {
                id: aiEdge.id || `e-${aiEdge.source}-${aiEdge.target}`,
                source: aiEdge.source,
                target: aiEdge.target,
                type: aiEdge.type || "default",
                style: aiEdge.style || { stroke: "#6366f1", strokeWidth: 2 },
                animated: false,
              }

              newEdges.push(newEdge)
            }

            let updatedEdges = [...eds]
            for (const newEdge of newEdges) {
              const existingConnection = updatedEdges.find(
                (e) => e.source === newEdge.source && e.target === newEdge.target
              )
              if (!existingConnection) {
                updatedEdges = addEdge(newEdge, updatedEdges)
              }
            }

            return updatedEdges
          })

          updates.edges.forEach((edge) => {
            if (!edges.find((e) => e.id === edge.id)) {
              changeTracker.trackEdgeAdd(edge)
            }
          })

          console.log(`[handleUpdateFlow] Added ${updates.edges.length} edges`)
        }

        if (updates.description && flowId) {
          updateFlow(flowId, { description: updates.description })
          setCurrentFlow((prev) => (prev ? { ...prev, description: updates.description } : null))
        }

        updateDraftChanges()
        toast.success(
          `Flow updated successfully! ${updates.nodes?.length || 0} nodes, ${updates.edges?.length || 0} edges`
        )
      } catch (error) {
        console.error("[handleUpdateFlow] Error:", error)
        toast.error("Failed to apply updates. Please try again.")
      }
    },
    [nodes, edges, platform, flowId, setNodes, setEdges, withEditTracking, updateDraftChanges, setCurrentFlow]
  )

  return {
    isAISuggestionsPanelOpen,
    setIsAISuggestionsPanelOpen,
    suggestions,
    suggestionsLoading,
    clearSuggestions,
    onAcceptAISuggestion,
    onAddNode,
    handleApplyFlow,
    handleUpdateFlow,
  }
}
