import { useState, useCallback, useEffect, useRef } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, NodeData, ButtonData, OptionData } from "@/types"
import {
  getPlatformSpecificNodeType,
  getPlatformSpecificLabel,
} from "@/utils/platform-helpers"
import {
  isValidNodeId,
  createButtonData,
  createOptionData,
} from "@/utils"
import {
  areButtonsWithinNodeLimits,
  areOptionsWithinNodeLimits,
} from "@/constants"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { shouldConvertToList, convertButtonsToOptions } from "@/utils/node-operations"
import { changeTracker } from "@/utils/change-tracker"
import { updateFlow } from "@/utils/flow-storage"
import type { FlowData } from "@/utils/flow-storage"
import { toast } from "sonner"
import { useReactFlow } from "@xyflow/react"

interface UseNodeOperationsParams {
  flowId: string
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setPlatform: (platform: Platform) => void
  onNodesChangeOriginal: (changes: any[]) => void
  onEdgesChangeOriginal: (changes: any[]) => void
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
  flowLoaded: boolean
  setFlowLoaded: (val: boolean) => void
}

export function useNodeOperations({
  flowId,
  nodes,
  edges,
  platform,
  setNodes,
  setEdges,
  setPlatform,
  onNodesChangeOriginal,
  onEdgesChangeOriginal,
  isEditMode,
  autoEnterEditMode,
  updateDraftChanges,
  currentFlow,
  setCurrentFlow,
  flowLoaded,
  setFlowLoaded,
}: UseNodeOperationsParams) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false)
  const [nodeToFocus, setNodeToFocus] = useState<string | null>(null)

  const { fitView } = useReactFlow()

  // Use ref for nodes to avoid recreating onNodesChange on every drag frame
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  /** Helper: auto-enter edit mode if not already in it */
  const withEditTracking = useCallback(() => {
    if (!isEditMode) {
      autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
    }
  }, [isEditMode, autoEnterEditMode, setNodes, setEdges, setPlatform, nodes, edges, platform])

  // Custom onNodesChange to prevent deletion of start nodes
  // Uses nodesRef to avoid recreating callback on every drag frame
  const onNodesChange = useCallback(
    (changes: any[]) => {
      const filteredChanges = changes.filter((change) => {
        if (change.type === "remove") {
          const nodeToRemove = nodesRef.current.find((n) => n.id === change.id)
          if (nodeToRemove?.type === "start") {
            toast.error("Start node cannot be deleted")
            return false
          }
        }
        return true
      })
      onNodesChangeOriginal(filteredChanges)
    },
    [onNodesChangeOriginal]
  )

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nodeToDelete = nodes.find((n) => n.id === nodeId)

      if (nodeToDelete?.type === "start") {
        toast.error("Start node cannot be deleted")
        return
      }

      if (nodeToDelete) {
        withEditTracking()
        changeTracker.trackNodeDelete(nodeId, nodeToDelete.type, nodeToDelete.data?.label as string | undefined)
        updateDraftChanges()
      }

      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null)
        setIsPropertiesPanelOpen(false)
      }

      if (nodeToDelete) {
        toast.success(`"${nodeToDelete.data.label || nodeToDelete.type}" deleted`)
      }
    },
    [setNodes, setEdges, selectedNode, nodes, withEditTracking, updateDraftChanges]
  )

  const addButtonToNode = useCallback(
    (nodeId: string) => {
      try {
        const node = nodes.find((n) => n.id === nodeId)
        if (!node) {
          console.warn(`[v0] Node with id ${nodeId} not found`)
          return
        }

        // Handle question nodes (convert to quick reply)
        if (
          node.type === "question" ||
          node.type === "webQuestion" ||
          node.type === "whatsappQuestion" ||
          node.type === "instagramQuestion"
        ) {
          const nodePlatform = (node.data.platform as Platform) || "web"
          const newType = getPlatformSpecificNodeType("quickReply", nodePlatform)

          withEditTracking()
          changeTracker.trackNodeUpdate(
            nodeId,
            node.data,
            { ...node.data, label: "Quick Reply", buttons: [createButtonData("Option 1", 0)] },
            node.type,
            newType
          )
          updateDraftChanges()

          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    type: newType,
                    data: { ...n.data, label: "Quick Reply", buttons: [createButtonData("Option 1", 0)] },
                  }
                : n
            )
          )
          setNodeToFocus(nodeId)
        }
        // Handle quick reply nodes (add button or convert to list)
        else if (
          node.type === "quickReply" ||
          node.type === "webQuickReply" ||
          node.type === "whatsappQuickReply" ||
          node.type === "instagramQuickReply"
        ) {
          const currentButtons: ButtonData[] = (node.data.buttons as ButtonData[]) || []
          const nodePlatform = (node.data.platform as Platform) || "web"

          const conversion = shouldConvertToList(currentButtons.length + 1, nodePlatform)

          if (conversion.shouldConvert) {
            const convertedOptions = convertButtonsToOptions(currentButtons)
            const newOptions = [...convertedOptions, createOptionData("", currentButtons.length)] as OptionData[]

            withEditTracking()
            changeTracker.trackNodeUpdate(
              nodeId,
              node.data,
              { ...node.data, label: conversion.newLabel, options: newOptions, buttons: undefined },
              node.type,
              conversion.newNodeType
            )
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      type: conversion.newNodeType,
                      data: { ...n.data, label: conversion.newLabel, options: newOptions, buttons: undefined },
                    }
                  : n
              )
            )

            console.log(
              `[v0] Auto-converted Quick Reply to List (${currentButtons.length} → ${newOptions.length} options)`
            )
            toast.success(`Upgraded to ${conversion.newLabel}!`, {
              description: `You can now add up to 10 options (was limited to ${currentButtons.length} buttons)`,
            })
            setNodeToFocus(nodeId)
          } else {
            const newButtons = [...currentButtons, createButtonData("", currentButtons.length)] as ButtonData[]

            withEditTracking()
            changeTracker.trackNodeUpdate(nodeId, node.data, { ...node.data, buttons: newButtons }, node.type, node.type)
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, buttons: newButtons } } : n
              )
            )
          }
        }
        // Handle list nodes (add option)
        else if (
          node.type === "interactiveList" ||
          node.type === "whatsappInteractiveList"
        ) {
          const currentOptions: OptionData[] = (node.data.options as OptionData[]) || []
          const nodePlatform = (node.data.platform as Platform) || "web"

          const canAddOption = areOptionsWithinNodeLimits(currentOptions.length + 1, node.type, nodePlatform)

          if (canAddOption.valid) {
            const newOptions = [...currentOptions, createOptionData("", currentOptions.length)] as OptionData[]

            withEditTracking()
            changeTracker.trackNodeUpdate(
              nodeId,
              node.data,
              { ...node.data, options: newOptions },
              node.type,
              node.type
            )
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, options: newOptions } } : n
              )
            )
          }
        }
      } catch (error) {
        console.error(`[v0] Error adding button to node ${nodeId}:`, error)
      }
    },
    [nodes, setNodes, withEditTracking, updateDraftChanges]
  )

  const removeButtonFromNode = useCallback(
    (nodeId: string, buttonIndex: number) => {
      try {
        const node = nodes.find((n) => n.id === nodeId)
        if (!node) {
          console.warn(`[v0] Node with id ${nodeId} not found`)
          return
        }

        const nodePlatform = (node.data.platform as Platform) || "web"
        const currentButtons: ButtonData[] = (node.data.buttons as ButtonData[]) || []
        const currentOptions: OptionData[] = (node.data.options as OptionData[]) || []

        if (
          node.type === "interactiveList" ||
          node.type === "whatsappInteractiveList"
        ) {
          const newOptions = currentOptions.filter((_, i) => i !== buttonIndex)
          const buttonLimit = BUTTON_LIMITS[nodePlatform]

          if (newOptions.length <= buttonLimit) {
            const newType = getPlatformSpecificNodeType("quickReply", nodePlatform)
            const buttonsFromOptions = newOptions.map((opt) => ({
              text: opt.text || "",
              id: opt.id || `btn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            }))

            withEditTracking()
            changeTracker.trackNodeUpdate(
              nodeId,
              node.data,
              { ...node.data, label: "Quick Reply", buttons: buttonsFromOptions, options: undefined },
              node.type,
              newType
            )
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      type: newType,
                      data: { ...n.data, label: "Quick Reply", buttons: buttonsFromOptions, options: undefined },
                    }
                  : n
              )
            )
          } else {
            withEditTracking()
            changeTracker.trackNodeUpdate(
              nodeId,
              node.data,
              { ...node.data, options: newOptions },
              node.type,
              node.type
            )
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, options: newOptions } } : n
              )
            )
          }
        } else if (
          node.type === "quickReply" ||
          node.type === "webQuickReply" ||
          node.type === "whatsappQuickReply" ||
          node.type === "instagramQuickReply"
        ) {
          const newButtons = currentButtons.filter((_, i) => i !== buttonIndex)

          if (newButtons.length === 0) {
            const newType = getPlatformSpecificNodeType("question", nodePlatform)

            withEditTracking()
            changeTracker.trackNodeUpdate(
              nodeId,
              node.data,
              { ...node.data, label: "Question" },
              node.type,
              newType
            )
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? { ...n, type: newType, data: { ...n.data, label: "Question" } }
                  : n
              )
            )
          } else {
            withEditTracking()
            changeTracker.trackNodeUpdate(
              nodeId,
              node.data,
              { ...node.data, buttons: newButtons },
              node.type,
              node.type
            )
            updateDraftChanges()

            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId ? { ...n, data: { ...n.data, buttons: newButtons } } : n
              )
            )
          }
        }
      } catch (error) {
        console.error(`[v0] Error removing button from node ${nodeId}:`, error)
      }
    },
    [nodes, setNodes, withEditTracking, updateDraftChanges]
  )

  const addConnectedNode = useCallback(
    (sourceNodeId: string) => {
      const newNodeId = `${Date.now()}`
      const sourceNode = nodes.find((n) => n.id === sourceNodeId)
      if (!sourceNode) return

      const newNode: Node = {
        id: newNodeId,
        type: "question",
        position: { x: sourceNode.position.x + 300, y: sourceNode.position.y },
        data: { label: "New Question", question: "What would you like to know?" },
      }

      const newEdge: Edge = {
        id: `e${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      }

      withEditTracking()
      changeTracker.trackNodeAdd(newNode)
      changeTracker.trackEdgeAdd(newEdge)
      updateDraftChanges()

      setNodes((nds) => [...nds, newNode])
      setEdges((eds) => [...eds, newEdge])
      setNodeToFocus(newNodeId)
    },
    [nodes, setNodes, setEdges, withEditTracking, updateDraftChanges]
  )

  const updateNodeData = useCallback(
    (nodeId: string, updates: any, shouldFocus: boolean = false) => {
      try {
        if (!isValidNodeId(nodeId)) {
          console.error("[v0] Invalid nodeId provided to updateNodeData:", nodeId)
          return
        }

        console.log("[v0] Updating node data:", nodeId, updates)

        const oldNode = nodes.find((n) => n.id === nodeId)
        if (oldNode) {
          withEditTracking()
          const oldData = { ...oldNode.data }
          const newData = { ...oldData, ...updates }
          changeTracker.trackNodeUpdate(nodeId, oldData, newData, oldNode.type, oldNode.type)
          updateDraftChanges()
        }

        setNodes((nds) => {
          const updatedNodes = nds.map((node) => {
            if (node.id === nodeId) {
              const updatedNode = {
                ...node,
                data: { ...node.data, ...updates },
                _timestamp: Date.now(),
              }

              if (node.type === "start" && updates.triggerIds && flowId) {
                updateFlow(flowId, {
                  triggerIds: updates.triggerIds,
                  triggerId: updates.triggerIds[0],
                })
              }
              if (node.type === "start" && updates.flowDescription !== undefined && flowId) {
                updateFlow(flowId, { description: updates.flowDescription })
                setCurrentFlow((prev) => (prev ? { ...prev, description: updates.flowDescription } : null))
              }

              return updatedNode
            }
            return node
          })
          return updatedNodes
        })
        setSelectedNode((prev) =>
          prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...updates } } : prev
        )

        if (shouldFocus) {
          setNodeToFocus(nodeId)
        }
      } catch (error) {
        console.error(`[v0] Error updating node data for ${nodeId}:`, error)
      }
    },
    [setNodes, nodes, withEditTracking, updateDraftChanges, flowId, setCurrentFlow]
  )

  const convertNode = useCallback(
    (nodeId: string, newNodeType: string, updatedData: any) => {
      try {
        if (!isValidNodeId(nodeId)) {
          console.error("[v0] Invalid nodeId provided to convertNode:", nodeId)
          return
        }

        console.log("[v0] Converting node:", nodeId, "to", newNodeType)

        const oldNode = nodes.find((n) => n.id === nodeId)
        if (oldNode) {
          withEditTracking()
          changeTracker.trackNodeUpdate(nodeId, oldNode.data, updatedData, oldNode.type, newNodeType)
          updateDraftChanges()
        }

        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                type: newNodeType,
                data: { ...node.data, ...updatedData },
                _timestamp: Date.now(),
              }
            }
            return node
          })
        )

        console.log("[v0] Node converted successfully")
      } catch (error) {
        console.error(`[v0] Error converting node ${nodeId}:`, error)
      }
    },
    [setNodes, nodes, withEditTracking, updateDraftChanges]
  )

  // Custom onEdgesChange to handle condition node disconnection
  const onEdgesChange = useCallback(
    (changes: any[]) => {
      changes.forEach((change) => {
        if (change.type === "remove") {
          const edgeToRemove = edges.find((e) => e.id === change.id)
          if (edgeToRemove) {
            const targetNode = nodes.find((n) => n.id === edgeToRemove.target)
            if (targetNode?.type === "condition") {
              console.log("[v0] Clearing connected node data from condition node")
              updateNodeData(edgeToRemove.target, {
                connectedNode: null,
                conditionRules: [],
              })
            }
          }
        }
      })
      onEdgesChangeOriginal(changes)
    },
    [edges, nodes, onEdgesChangeOriginal, updateNodeData]
  )

  const convertNodesToPlatform = useCallback(
    (newPlatform: Platform) => {
      console.log("[v0] Converting nodes to platform:", newPlatform)

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.type === "start" || node.type === "comment") {
            return { ...node, data: { ...node.data, platform: newPlatform } as NodeData }
          }

          let newType = node.type
          const newData: any = { ...node.data, platform: newPlatform }

          // Convert question nodes
          if (
            node.type === "question" ||
            node.type === "webQuestion" ||
            node.type === "whatsappQuestion" ||
            node.type === "instagramQuestion"
          ) {
            switch (newPlatform) {
              case "web":
                newType = "webQuestion"
                newData.label = "Web Message"
                break
              case "whatsapp":
                newType = "whatsappQuestion"
                newData.label = "WhatsApp Message"
                break
              case "instagram":
                newType = "instagramQuestion"
                newData.label = "Instagram Message"
                break
              default:
                newType = "webQuestion"
                newData.label = "Question"
            }
          }

          // Convert quick reply nodes
          if (
            node.type === "quickReply" ||
            node.type === "webQuickReply" ||
            node.type === "whatsappQuickReply" ||
            node.type === "instagramQuickReply"
          ) {
            switch (newPlatform) {
              case "web":
                newType = "webQuickReply"
                newData.label = "Web Actions"
                break
              case "whatsapp":
                newType = "whatsappQuickReply"
                newData.label = "WhatsApp Actions"
                break
              case "instagram":
                newType = "instagramQuickReply"
                newData.label = "Instagram Actions"
                break
              default:
                newType = "webQuickReply"
                newData.label = "Quick Reply"
            }
          }

          // Convert list nodes
          if (
            node.type === "interactiveList" ||
            node.type === "whatsappInteractiveList"
          ) {
            switch (newPlatform) {
              case "whatsapp":
                newType = "whatsappInteractiveList"
                newData.label = "WhatsApp List"
                break
              default:
                newType = "interactiveList"
                newData.label = "Interactive List"
            }
          }

          // Convert message/DM/story nodes
          if (
            node.type === "whatsappMessage" ||
            node.type === "instagramDM" ||
            node.type === "instagramStory"
          ) {
            switch (newPlatform) {
              case "whatsapp":
                newType = "whatsappMessage"
                newData.label = "WhatsApp Message"
                if (!newData.text && newData.question) {
                  newData.text = newData.question
                }
                break
              case "instagram":
                newType = "instagramDM"
                newData.label = "Instagram DM"
                if (!newData.text && newData.question) {
                  newData.text = newData.question
                }
                break
              default:
                newType = "question"
                newData.label = "Question"
                if (!newData.question && newData.text) {
                  newData.question = newData.text
                }
            }
          }

          return { ...node, type: newType, data: newData }
        })
      )
    },
    [setNodes]
  )

  const handlePlatformChange = useCallback(
    (newPlatform: Platform) => {
      console.log("[v0] Platform changed to:", newPlatform)

      withEditTracking()
      changeTracker.trackPlatformChange(platform, newPlatform)
      updateDraftChanges()

      setPlatform(newPlatform)
      convertNodesToPlatform(newPlatform)
    },
    [convertNodesToPlatform, platform, withEditTracking, updateDraftChanges, setPlatform]
  )

  // Sync condition nodes after flow loads
  useEffect(() => {
    if (nodes.length <= 1 || flowLoaded) return

    const conditionNodes = nodes.filter((n) => n.type === "condition")
    if (conditionNodes.length === 0) {
      setFlowLoaded(true)
      return
    }

    let needsSync = false
    conditionNodes.forEach((conditionNode) => {
      const incomingEdge = edges.find((e) => e.target === conditionNode.id && !e.targetHandle)
      if (incomingEdge && !conditionNode.data?.connectedNode) {
        needsSync = true
      }
    })

    if (needsSync) {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type !== "condition") return node

          const incomingEdge = edges.find((e) => e.target === node.id && !e.targetHandle)
          if (incomingEdge && !node.data?.connectedNode) {
            const sourceNode = nds.find((n) => n.id === incomingEdge.source)
            if (sourceNode) {
              return {
                ...node,
                data: {
                  ...node.data,
                  connectedNode: {
                    id: sourceNode.id,
                    type: sourceNode.type,
                    label: sourceNode.data?.label || sourceNode.type,
                  },
                },
              }
            }
          }
          return node
        })
      )
    }

    setFlowLoaded(true)
  }, [nodes, edges, flowLoaded, setNodes, setFlowLoaded])

  // Update selected node when nodes change
  useEffect(() => {
    if (selectedNode) {
      const updatedNode = nodes.find((n) => n.id === selectedNode.id)
      if (updatedNode && updatedNode !== selectedNode) {
        setSelectedNode(updatedNode)
      }
    }
  }, [nodes, selectedNode])

  // Handle focusing on newly created nodes
  useEffect(() => {
    if (nodeToFocus) {
      const node = nodes.find((n) => n.id === nodeToFocus)

      if (node && node.type !== "comment") {
        setTimeout(() => {
          fitView({
            nodes: [{ id: nodeToFocus }],
            duration: 1200,
            padding: 0.2,
            minZoom: 0.5,
            maxZoom: 2.0,
          })
          setSelectedNode(node)
          setIsPropertiesPanelOpen(true)
        }, 100)
      }

      setNodeToFocus(null)
    }
  }, [nodes, nodeToFocus, fitView])

  return {
    selectedNode,
    setSelectedNode,
    isPropertiesPanelOpen,
    setIsPropertiesPanelOpen,
    nodeToFocus,
    setNodeToFocus,
    onNodesChange,
    onEdgesChange,
    deleteNode,
    addButtonToNode,
    removeButtonFromNode,
    addConnectedNode,
    updateNodeData,
    convertNode,
    convertNodesToPlatform,
    handlePlatformChange,
  }
}
