import { useState, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import { addEdge } from "@xyflow/react"
import type { Platform, ButtonData, OptionData } from "@/types"
import type { EditFlowPlan, NodeContent } from "@/types/flow-plan"
import { getBaseNodeType, isMultiOutputType } from "@/utils/platform-helpers"
import { createNode, createCommentNode } from "@/utils/node-factory"
import { shouldConvertToList, convertButtonsToOptions } from "@/utils/node-operations"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { processAiNodes, processAiEdges, transformAiNodeData, normalizeAiNodeType } from "@/utils/ai-data-transform"
import { buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import { changeTracker } from "@/utils/change-tracker"
import { DEFAULT_EDGE_STYLE } from "@/constants/edge-styles"
import { updateFlow } from "@/utils/flow-storage"
import type { FlowData } from "@/utils/flow-storage"
import { useNodeSuggestions } from "@/hooks/use-node-suggestions"
import { toast } from "sonner"
import { sendDebugLog } from "@/utils/ai-debug-logger"
import type { AiDebugEntry } from "@/utils/ai-debug-logger"

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
  // Undo/redo — wired in Task 3, used in Task 6
  undoSnapshot?: () => void
  undoResumeTracking?: () => void
  abortAIStaggerRef?: React.MutableRefObject<boolean>
}

/**
 * Check if an edge is a duplicate of an existing edge.
 * Compares source + target + sourceHandle (not just source + target)
 * so that different buttons on the same node pointing to the same target are allowed.
 */
function isEdgeDuplicate(existing: Edge[], candidate: Edge): boolean {
  const isDup = existing.some(
    (e) =>
      e.source === candidate.source &&
      e.target === candidate.target &&
      (e.sourceHandle || "") === (candidate.sourceHandle || "")
  )
  if (isDup) {
    console.log(`[EdgeDedup] Skipping duplicate edge: ${candidate.source} → ${candidate.target} (handle: ${candidate.sourceHandle || "default"})`)
  }
  return isDup
}

/**
 * Remove any existing edge that has the exact same source+sourceHandle but a different target.
 * Enforces one outgoing edge per button handle.
 * Does NOT touch handleless edges — those are resolved to actual button handles
 * by the normalization pass (resolveHandlelessEdges) which has access to node data.
 */
function removeConflictingEdges(edges: Edge[], newEdge: Edge): Edge[] {
  if (!newEdge.sourceHandle) return edges
  const filtered = edges.filter((e) => {
    if (e.source !== newEdge.source) return true
    // Only remove if exact same handle is being reassigned to a different target
    if (e.sourceHandle && e.sourceHandle === newEdge.sourceHandle && e.target !== newEdge.target) {
      console.log(`[EdgeDedup] Removing conflicting edge: ${e.source} → ${e.target} (handle ${e.sourceHandle} reassigned to ${newEdge.target})`)
      return false
    }
    return true
  })
  return filtered
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
  undoSnapshot,
  undoResumeTracking,
  abortAIStaggerRef,
}: UseFlowAIParams) {
  const [isAISuggestionsPanelOpen, setIsAISuggestionsPanelOpen] = useState(false)

  const { suggestions, loading: suggestionsLoading, fetchSuggestions, clearSuggestions } = useNodeSuggestions()

  /** Helper: auto-enter edit mode if not already in it */
  const withEditTracking = useCallback(() => {
    if (!isEditMode) {
      autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
    }
  }, [isEditMode, autoEnterEditMode, setNodes, setEdges, setPlatform, nodes, edges, platform])

  // TODO: Re-enable auto-suggestions once AI is aware of new node types (tagging, API success/failure, WhatsApp Flows)
  // Disabled temporarily — suggestions fire on every node selection and slow down editing
  /*
  // Fetch suggestions when node is selected (debounced)
  useEffect(() => {
    if (selectedNode && selectedNode.type && selectedNode.type !== "start" && selectedNode.type !== "comment") {
      setIsAISuggestionsPanelOpen(true)

      const timer = setTimeout(() => {
        fetchSuggestions({
          currentNodeType: selectedNode.type!,
          currentNodeId: selectedNode.id,
          platform,
          flowContext: currentFlow?.description,
          existingNodes: nodes
            .filter((n) => n.type)
            .map((n) => ({
              id: n.id,
              type: n.type!,
              label: n.data.label as string | undefined,
              question: n.data.question as string | undefined,
              text: n.data.text as string | undefined,
              buttons: n.data.buttons as Array<{ text?: string; id?: string }> | undefined,
              options: n.data.options as Array<{ text?: string; id?: string }> | undefined,
              storeAs: n.data.storeAs as string | undefined,
            })),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle || undefined,
          })),
          maxSuggestions: 2,
        })
      }, 350)

      return () => {
        clearTimeout(timer)
        clearSuggestions()
      }
    } else {
      setIsAISuggestionsPanelOpen(false)
      clearSuggestions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, selectedNode?.type, platform, currentFlow?.description])
  */

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
    async (flowData: { nodes: Node[]; edges: Edge[]; nodeOrder?: string[] }, meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }) => {
      try {
        // Snapshot for shared undo stack, then pause auto-capture during stagger
        if (abortAIStaggerRef) abortAIStaggerRef.current = false
        undoSnapshot?.()

        withEditTracking()

        const existingStartNode = nodes.find((n) => n.id === "1" && n.type === "start")
        const processedNodes = processAiNodes(flowData.nodes, platform, existingStartNode)
        const nodeIds = new Set(processedNodes.map((n) => n.id))
        const processedEdges = processAiEdges(flowData.edges, nodeIds)

        // If nodeOrder is provided, animate nodes onto the canvas one-by-one
        if (flowData.nodeOrder && flowData.nodeOrder.length > 0) {
          const STAGGER_DELAY = 150

          // Start with just the start node
          setNodes(existingStartNode ? [existingStartNode] : [])
          setEdges([])

          const placedIds = new Set<string>()
          if (existingStartNode) placedIds.add(existingStartNode.id)

          for (const nodeId of flowData.nodeOrder) {
            if (abortAIStaggerRef?.current) break

            const node = processedNodes.find((n) => n.id === nodeId)
            if (node) {
              setNodes((prev) => [...prev, node])

              // Add edges that connect to already-placed nodes
              const relevantEdges = processedEdges.filter(
                (e) => e.target === nodeId && placedIds.has(e.source)
              )
              if (relevantEdges.length > 0) {
                setEdges((prev) => [...prev, ...relevantEdges])
              }
              placedIds.add(nodeId)

              await new Promise((r) => setTimeout(r, STAGGER_DELAY))
            }
          }

          // Safety net: set final edges state to ensure all edges are placed
          if (!abortAIStaggerRef?.current) {
            setEdges(processedEdges)
          }
        } else {
          // No nodeOrder — apply all at once (legacy behavior)
          setNodes(processedNodes)
          setEdges(processedEdges)
        }

        // Resume auto-capture after stagger completes (or aborts)
        undoResumeTracking?.()

        processedNodes.forEach((node) => {
          if (node.id !== "1") {
            changeTracker.trackNodeAdd(node)
          }
        })
        processedEdges.forEach((edge) => changeTracker.trackEdgeAdd(edge))
        updateDraftChanges()

        const addedCount = processedNodes.length - (existingStartNode ? 1 : 0)
        toast.success(`Flow created! ${addedCount} nodes added`, {
          duration: 8000,
        })

        if (meta?.warnings && meta.warnings.length > 0) {
          toast.warning(`${meta.warnings.length} item(s) skipped`, {
            description: meta.warnings.slice(0, 3).join("; "),
            duration: 6000,
          })
        }

        // Fire-and-forget debug logging
        sendDebugLog({
          timestamp: new Date().toISOString(),
          operationType: "create",
          input: { userPrompt: meta?.userPrompt || "(unknown)", platform },
          aiPlan: meta?.debugData,
          buildResult: {
            newNodes: processedNodes.filter(n => n.id !== "1").map(n => ({ id: n.id, type: n.type || "" })),
            newEdges: processedEdges.map(e => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle || undefined })),
          },
          flowBefore: { nodeCount: nodes.length, edgeCount: edges.length, nodeIds: nodes.map(n => n.id) },
          flowAfter: { nodeCount: processedNodes.length, edgeCount: processedEdges.length, nodeIds: processedNodes.map(n => n.id) },
          warnings: meta?.warnings || [],
        })
      } catch (error) {
        undoResumeTracking?.()
        console.error("[handleApplyFlow] Error:", error)
        toast.error("Failed to apply AI-generated flow. Please try again.")
      }
    },
    [nodes, edges, platform, setNodes, setEdges, withEditTracking, updateDraftChanges, undoSnapshot, undoResumeTracking, abortAIStaggerRef]
  )

  const handleUpdateFlow = useCallback(
    async (updates: {
      nodes?: Node[]
      edges?: Edge[]
      description?: string
      removeNodeIds?: string[]
      removeEdges?: Array<{ source: string; target: string; sourceHandle?: string }>
      positionShifts?: Array<{ nodeId: string; dx: number }>
    }, meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }) => {
      try {
        // Snapshot for shared undo stack, then pause auto-capture during stagger
        if (abortAIStaggerRef) abortAIStaggerRef.current = false
        undoSnapshot?.()

        withEditTracking()

        console.log("[handleUpdateFlow] Applying updates:", {
          removeNodeIds: updates.removeNodeIds?.length || 0,
          removeEdges: updates.removeEdges?.length || 0,
          newNodes: updates.nodes?.length || 0,
          newEdges: updates.edges?.length || 0,
        })

        // Step 1: Remove nodes and edges in a single pass to avoid race conditions
        const idsToRemove = new Set(updates.removeNodeIds || [])
        if (idsToRemove.size > 0) {
          console.log("[handleUpdateFlow] Removing nodes:", [...idsToRemove])
          setNodes((nds) => nds.filter((n) => !idsToRemove.has(n.id)))
        }

        if (idsToRemove.size > 0 || (updates.removeEdges && updates.removeEdges.length > 0)) {
          console.log("[handleUpdateFlow] Removing edges:", updates.removeEdges || [])
          setEdges((eds) => {
            let filtered = eds
            if (idsToRemove.size > 0) {
              filtered = filtered.filter((e) => !idsToRemove.has(e.source) && !idsToRemove.has(e.target))
            }
            if (updates.removeEdges && updates.removeEdges.length > 0) {
              const normalizeHandle = (h: string | undefined | null) => (!h || h === "default") ? undefined : h
              filtered = filtered.filter((e) =>
                !updates.removeEdges!.some(
                  (re) => {
                    const reHandle = normalizeHandle(re.sourceHandle)
                    const eHandle = normalizeHandle(e.sourceHandle)
                    return re.source === e.source &&
                      re.target === e.target &&
                      (!reHandle || reHandle === eHandle)
                  }
                )
              )
            }
            return filtered
          })
        }

        // Step 1.5: Apply position shifts to existing nodes (shift downstream nodes right)
        if (updates.positionShifts && updates.positionShifts.length > 0) {
          console.log("[handleUpdateFlow] Applying position shifts:", updates.positionShifts.length)
          setNodes(nds => nds.map(n => {
            const shift = updates.positionShifts!.find(s => s.nodeId === n.id)
            if (shift) {
              return { ...n, position: { ...n.position, x: n.position.x + shift.dx } }
            }
            return n
          }))
        }

        // Step 2: Process node additions and updates
        const updatedExisting: Node[] = []
        const brandNewNodes: Node[] = []

        if (updates.nodes && updates.nodes.length > 0) {
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

              // Auto-convert quickReply → interactiveList if buttons exceed platform limit
              let effectiveType = aiNode.type
              if (baseType === "quickReply" && updatedData.buttons) {
                const buttons = updatedData.buttons as ButtonData[]
                const nodePlatform = (updatedData.platform as Platform) || platform
                const conversion = shouldConvertToList(buttons.length, nodePlatform)
                if (conversion.shouldConvert) {
                  const options = convertButtonsToOptions(buttons)
                  updatedData.options = options
                  updatedData.buttons = undefined
                  updatedData.label = conversion.newLabel
                  updatedData.listTitle = updatedData.listTitle || "Select an option"
                  effectiveType = conversion.newNodeType
                  console.log(`[handleUpdateFlow] Auto-converted quickReply → interactiveList for ${aiNode.id} (${buttons.length} buttons)`)
                }
              }

              updatedExisting.push({ ...existingNode, ...aiNode, type: effectiveType, data: updatedData })
            } else {
              try {
                const nodePlatform = (aiNode.data?.platform as Platform) || platform
                const nodePosition = aiNode.position || { x: 250, y: 200 }
                const nodeTypeToCreate = normalizeAiNodeType(aiNode.type, platform)

                const newNode = createNode(nodeTypeToCreate, nodePlatform, nodePosition, aiNode.id)
                const transformedAiData = transformAiNodeData(aiNode.data || {}, baseType)
                const mergedData = { ...newNode.data, ...transformedAiData }

                brandNewNodes.push({ ...newNode, ...aiNode, data: mergedData })
              } catch (error) {
                console.warn(`[handleUpdateFlow] Skipping unrecognized node type "${aiNode.type}":`, error)
                continue
              }
            }
          }

          // Apply updates to existing nodes immediately
          if (updatedExisting.length > 0) {
            setNodes((nds) =>
              nds.map((node) => {
                const update = updatedExisting.find((n) => n.id === node.id)
                return update || node
              })
            )
          }

          // Prepare all new edges
          const newEdges: Edge[] = []
          if (updates.edges && updates.edges.length > 0) {
            const removedIds = new Set(updates.removeNodeIds || [])
            const allNodeIds = new Set([
              ...nodes.filter((n) => !removedIds.has(n.id)).map((n) => n.id),
              ...updatedExisting.map((n) => n.id),
              ...brandNewNodes.map((n) => n.id),
            ])

            for (const aiEdge of updates.edges) {
              const edgeExists = edges.some((e) => e.id === aiEdge.id)
              if (edgeExists) continue

              if (!allNodeIds.has(aiEdge.source) || !allNodeIds.has(aiEdge.target)) {
                console.warn(`[handleUpdateFlow] Skipping edge ${aiEdge.id}: source or target node not found`)
                continue
              }

              // Reject self-referencing edges (circular loops)
              if (aiEdge.source === aiEdge.target) {
                console.warn(`[handleUpdateFlow] Skipping self-loop edge: ${aiEdge.source} → ${aiEdge.target}`)
                continue
              }

              newEdges.push({
                id: aiEdge.id || `e-${aiEdge.source}-${aiEdge.target}`,
                source: aiEdge.source,
                target: aiEdge.target,
                type: aiEdge.type || "default",
                sourceHandle: (aiEdge as any).sourceHandle,
                style: aiEdge.style || DEFAULT_EDGE_STYLE,
                animated: false,
              })
            }
          }

          // Stagger-animate new nodes one by one
          if (brandNewNodes.length > 0) {
            const STAGGER_DELAY = 150
            const placedIds = new Set(nodes.map((n) => n.id))

            for (const node of brandNewNodes) {
              if (abortAIStaggerRef?.current) break

              setNodes((prev) => [...prev, node])
              placedIds.add(node.id)

              // Add edges that connect to already-placed nodes
              const relevantEdges = newEdges.filter(
                (e) =>
                  (e.target === node.id && placedIds.has(e.source)) ||
                  (e.source === node.id && placedIds.has(e.target))
              )
              if (relevantEdges.length > 0) {
                setEdges((prev) => {
                  let updated = [...prev]
                  for (const edge of relevantEdges) {
                    if (!isEdgeDuplicate(updated, edge)) {
                      updated = removeConflictingEdges(updated, edge)
                      updated = addEdge(edge, updated)
                    }
                  }
                  return updated
                })
              }

              await new Promise((r) => setTimeout(r, STAGGER_DELAY))
            }

            // Safety net: ensure all new edges are placed
            if (!abortAIStaggerRef?.current && newEdges.length > 0) {
              setEdges((prev) => {
                let updated = [...prev]
                for (const edge of newEdges) {
                  if (!isEdgeDuplicate(updated, edge)) {
                    updated = removeConflictingEdges(updated, edge)
                    updated = addEdge(edge, updated)
                  }
                }
                return updated
              })
            }
          } else if (newEdges.length > 0) {
            // No new nodes but new edges — apply edges immediately
            setEdges((prev) => {
              let updated = [...prev]
              for (const edge of newEdges) {
                if (!isEdgeDuplicate(updated, edge)) {
                  updated = removeConflictingEdges(updated, edge)
                  updated = addEdge(edge, updated)
                }
              }
              return updated
            })
          }

          // Force edge re-render after node type changes (e.g., quickReply → interactiveList).
          // New Handle components register via useEffect (async), so edges referencing
          // newly created handles may not render in the first paint. A deferred setEdges
          // ensures ReactFlow picks up the registered handles.
          if (updatedExisting.length > 0) {
            setTimeout(() => {
              setEdges((eds) => [...eds])
            }, 50)
          }

          const allProcessed = [...updatedExisting, ...brandNewNodes]
          allProcessed.forEach((node) => {
            if (!nodes.find((n) => n.id === node.id)) {
              changeTracker.trackNodeAdd(node)
            }
          })
          newEdges.forEach((edge) => {
            if (!edges.find((e) => e.id === edge.id)) {
              changeTracker.trackEdgeAdd(edge)
            }
          })

          console.log(`[handleUpdateFlow] Updated ${updatedExisting.length}, added ${brandNewNodes.length} nodes`)
        } else if (updates.edges && updates.edges.length > 0) {
          // Only edges, no nodes
          setEdges((eds) => {
            let updated = [...eds]
            const removedIds = new Set(updates.removeNodeIds || [])
            for (const aiEdge of updates.edges!) {
              if (updated.some((e) => e.id === aiEdge.id)) continue
              if (aiEdge.source === aiEdge.target) continue
              const sourceExists = nodes.some((n) => n.id === aiEdge.source && !removedIds.has(n.id))
              const targetExists = nodes.some((n) => n.id === aiEdge.target && !removedIds.has(n.id))
              if (!sourceExists || !targetExists) continue

              const newEdge: Edge = {
                id: aiEdge.id || `e-${aiEdge.source}-${aiEdge.target}`,
                source: aiEdge.source,
                target: aiEdge.target,
                type: aiEdge.type || "default",
                sourceHandle: (aiEdge as any).sourceHandle,
                style: aiEdge.style || DEFAULT_EDGE_STYLE,
                animated: false,
              }
              if (!isEdgeDuplicate(updated, newEdge)) {
                updated = removeConflictingEdges(updated, newEdge)
                updated = addEdge(newEdge, updated)
                changeTracker.trackEdgeAdd(newEdge)
              }
            }
            return updated
          })
        }

        // Resolve handleless edges from multi-output nodes to actual button/option handles.
        // ReactFlow renders handleless edges from the first available handle, causing
        // the "two edges from one button" visual bug. We resolve each handleless edge
        // to the first unoccupied button/option handle. If all are occupied, leave
        // the edge handleless (no "sync-next" for multi-output nodes).
        setEdges((eds) => {
          // Collect which source nodes have button-specific edges
          const nodesWithButtonEdges = new Set<string>()
          for (const e of eds) {
            if (e.sourceHandle && e.sourceHandle !== "sync-next") {
              nodesWithButtonEdges.add(e.source)
            }
          }

          // Collect occupied handles per source node
          const occupiedHandles = new Map<string, Set<string>>()
          for (const e of eds) {
            if (e.sourceHandle) {
              if (!occupiedHandles.has(e.source)) occupiedHandles.set(e.source, new Set())
              occupiedHandles.get(e.source)!.add(e.sourceHandle)
            }
          }

          let changed = false
          const normalized = eds.map((e) => {
            if (!e.sourceHandle && nodesWithButtonEdges.has(e.source)) {
              // Try to assign to an unoccupied button/option handle using node data
              const sourceNode = nodes.find((n) => n.id === e.source)
              const buttons = (sourceNode?.data?.buttons as ButtonData[]) || []
              const options = (sourceNode?.data?.options as OptionData[]) || []
              const occupied = occupiedHandles.get(e.source) || new Set()

              const freeButton = buttons.find((btn) => btn.id && !occupied.has(btn.id))
              const freeOption = !freeButton ? options.find((opt) => opt.id && !occupied.has(opt.id)) : undefined
              const resolvedHandle = freeButton?.id || freeOption?.id

              if (!resolvedHandle) {
                // All button/option handles occupied — leave edge as-is rather than using "sync-next"
                console.warn(`[handleUpdateFlow] No free button/option handle for ${e.source} → ${e.target}, leaving handleless`)
                return e
              }

              console.log(`[handleUpdateFlow] Resolving handleless edge: ${e.source} → ${e.target} → handle "${resolvedHandle}"`)
              changed = true
              // Mark the handle as occupied so subsequent handleless edges don't pick the same one
              if (!occupiedHandles.has(e.source)) occupiedHandles.set(e.source, new Set())
              occupiedHandles.get(e.source)!.add(resolvedHandle)
              return { ...e, sourceHandle: resolvedHandle }
            }
            return e
          })
          return changed ? normalized : eds
        })

        // Resume auto-capture after all mutations complete (or abort)
        undoResumeTracking?.()

        if (updates.description && flowId) {
          updateFlow(flowId, { description: updates.description }).catch(() => {})
          setCurrentFlow((prev) => (prev ? { ...prev, description: updates.description } : null))
        }

        updateDraftChanges()

        const addedCount = brandNewNodes.length
        const updatedCount = updatedExisting.length
        toast.success(
          `Flow updated! ${addedCount > 0 ? `${addedCount} nodes added` : ""}${addedCount > 0 && updatedCount > 0 ? ", " : ""}${updatedCount > 0 ? `${updatedCount} nodes updated` : ""}`,
          {
            duration: 8000,
          }
        )

        if (meta?.warnings && meta.warnings.length > 0) {
          toast.warning(`${meta.warnings.length} item(s) skipped`, {
            description: meta.warnings.slice(0, 3).join("; "),
            duration: 6000,
          })
        }

        // Fire-and-forget debug logging
        sendDebugLog({
          timestamp: new Date().toISOString(),
          operationType: "edit",
          input: { userPrompt: meta?.userPrompt || "(unknown)", platform },
          aiPlan: meta?.debugData,
          buildResult: {
            newNodes: brandNewNodes.map(n => ({ id: n.id, type: n.type || "" })),
            newEdges: (updates.edges || []).map((e: Edge) => ({ source: e.source, target: e.target, sourceHandle: (e as any).sourceHandle })),
            nodeUpdates: updatedExisting.map(n => ({ nodeId: n.id, fields: Object.keys(n.data || {}) })),
            removedNodeIds: updates.removeNodeIds,
            removedEdges: updates.removeEdges?.map(re => ({ source: re.source, target: re.target })),
          },
          flowBefore: { nodeCount: nodes.length, edgeCount: edges.length, nodeIds: nodes.map(n => n.id) },
          flowAfter: { nodeCount: nodes.length + brandNewNodes.length, edgeCount: edges.length, nodeIds: [...nodes.map(n => n.id), ...brandNewNodes.map(n => n.id)] },
          warnings: meta?.warnings || [],
        })
      } catch (error) {
        undoResumeTracking?.()
        console.error("[handleUpdateFlow] Error:", error)
        toast.error("Failed to apply updates. Please try again.")
      }
    },
    [nodes, edges, platform, flowId, setNodes, setEdges, withEditTracking, updateDraftChanges, setCurrentFlow, undoSnapshot, undoResumeTracking, abortAIStaggerRef]
  )

  const onAcceptAISuggestion = useCallback(
    async (suggestion: { type: string; label?: string; generatedContent?: any; sourceButtonIndex?: number }) => {
      if (!selectedNode) {
        toast.error("No node selected")
        return
      }

      try {
        // Normalize to base node type
        let normalizedType = getBaseNodeType(suggestion.type)

        // Auto-convert list→quickReply when ≤3 options (WhatsApp/Instagram button limit)
        const gc = suggestion.generatedContent
        if (normalizedType === "list" && gc?.options && gc.options.length <= BUTTON_LIMITS[platform]) {
          normalizedType = "quickReply"
          // Convert options → buttons format
          gc.buttons = gc.options.map((o: any) => ({ text: o.text || o }))
          delete gc.options
        }

        // Convert generatedContent → NodeContent (plan format)
        const content: NodeContent = {
          label: gc?.label,
          question: gc?.question,
          text: gc?.text,
          buttons: gc?.buttons?.map((b: any) => b.text || b.label || ""),
          options: gc?.options?.map((o: any) => o.text || ""),
        }

        // Determine which handle to attach from and which existing edge to replace
        const isMultiOutput = selectedNode.type ? isMultiOutputType(selectedNode.type) : false
        let attachHandle: string | undefined
        let outgoingEdge: typeof edges[number] | undefined

        if (isMultiOutput && suggestion.sourceButtonIndex != null) {
          // Connect from a specific button handle
          const buttons: Array<{ id?: string }> = (selectedNode.data as any)?.buttons || []
          const btn = buttons[suggestion.sourceButtonIndex]
          attachHandle = btn?.id ? btn.id : `button-${suggestion.sourceButtonIndex}`
          outgoingEdge = edges.find(
            (e) => e.source === selectedNode.id && e.sourceHandle === attachHandle
          )
        } else {
          // Default: connect from "sync-next" (sequential output)
          outgoingEdge = edges.find((e) => {
            if (e.source !== selectedNode.id) return false
            if (isMultiOutput) return e.sourceHandle === "sync-next"
            return !e.sourceHandle || e.sourceHandle === "sync-next"
          })
        }
        const nextNodeId = outgoingEdge?.target // undefined = end of flow (append)

        // Build an EditFlowPlan and run through the existing pipeline
        const editPlan: EditFlowPlan = {
          message: `Added ${suggestion.label || suggestion.type}`,
          chains: [{
            attachTo: selectedNode.id,
            attachHandle,
            steps: [{ step: "node", nodeType: normalizedType, content }],
            connectTo: nextNodeId,
          }],
          removeEdges: nextNodeId && outgoingEdge
            ? [{ source: selectedNode.id, target: nextNodeId, sourceHandle: outgoingEdge.sourceHandle || undefined }]
            : undefined,
        }

        const {
          newNodes,
          newEdges,
          nodeUpdates,
          removeEdges: planRemoveEdges,
          positionShifts,
          warnings,
        } = buildEditFlowFromPlan(editPlan, platform, nodes, edges)

        // Convert nodeUpdates to full node objects for handleUpdateFlow
        const updatedNodes = nodeUpdates
          .map((u) => {
            const existing = nodes.find((n) => n.id === u.nodeId)
            if (!existing) return null
            return {
              ...existing,
              type: u.newType || existing.type,
              data: { ...existing.data, ...u.data },
            }
          })
          .filter(Boolean) as Node[]

        await handleUpdateFlow(
          {
            nodes: [...updatedNodes, ...newNodes],
            edges: newEdges,
            removeEdges: planRemoveEdges.length > 0 ? planRemoveEdges : undefined,
            positionShifts: positionShifts.length > 0 ? positionShifts : undefined,
          },
          { warnings }
        )

        // Focus the new node
        if (newNodes.length > 0) {
          setNodeToFocus(newNodes[0].id)
        }

        clearSuggestions()
        setIsAISuggestionsPanelOpen(false)
      } catch (error) {
        console.error(`[onAcceptAISuggestion] Error creating suggested node ${suggestion.type}:`, error)
        toast.error(`Failed to add ${suggestion.type} node`)
      }
    },
    [selectedNode, platform, nodes, edges, handleUpdateFlow, clearSuggestions, setNodeToFocus]
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
