import { useState, useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { getFlow, updateFlow, createFlow, deleteSharedFlow, type FlowData } from "@/utils/flow-storage"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"

interface UseFlowPersistenceParams {
  flowId: string
  isNewFlow: boolean
  isSetupMode: boolean
  loadFromDb: boolean
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setPlatform: (platform: Platform) => void
}

export function useFlowPersistence({
  flowId,
  isNewFlow,
  isSetupMode,
  loadFromDb,
  nodes,
  edges,
  platform,
  setNodes,
  setEdges,
  setPlatform,
}: UseFlowPersistenceParams) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [currentFlow, setCurrentFlow] = useState<FlowData | null>(null)
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(false)
  const [flowLoaded, setFlowLoaded] = useState(false)
  const [isEditingFlowName, setIsEditingFlowName] = useState(false)
  const [editingFlowNameValue, setEditingFlowNameValue] = useState("")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const isSavingRef = useRef(false)
  const lastSavedDataRef = useRef<string>("")

  // Sync editing value when flow changes
  useEffect(() => {
    if (currentFlow && !isEditingFlowName) {
      setEditingFlowNameValue(currentFlow.name)
    }
  }, [currentFlow?.name, isEditingFlowName])

  // Load flow data when flowId changes
  useEffect(() => {
    if (flowId && !isSetupMode && !isNewFlow) {
      const loadFlowData = async () => {
        if (loadFromDb) {
          console.log("[App] Loading flow from database for flowId:", flowId)
          setIsLoadingFromDb(true)

          try {
            const response = await fetch(`/api/flows/${flowId}`)

            if (!response.ok) {
              throw new Error(`Failed to fetch flow: ${response.statusText}`)
            }

            const flowData = await response.json()

            console.log("[App] Flow data loaded from database:", {
              name: flowData.name,
              nodes: flowData.nodes?.length || 0,
              edges: flowData.edges?.length || 0,
              platform: flowData.platform,
            })

            const formattedFlowData: FlowData = {
              ...flowData,
              nodes: flowData.nodes || [],
              edges: flowData.edges || [],
            }

            setCurrentFlow(formattedFlowData)
            setNodes(formattedFlowData.nodes)
            setEdges(formattedFlowData.edges)
            setPlatform(formattedFlowData.platform)
            setFlowLoaded(true)

            toast.success("Flow loaded from database")
          } catch (error) {
            console.error("[App] Error loading flow from database:", error)
            toast.error("Failed to load flow from database")
          } finally {
            setIsLoadingFromDb(false)
          }
        } else {
          console.log("[App] Loading flow data from localStorage for flowId:", flowId)
          const flowData = getFlow(flowId)

          if (flowData) {
            console.log("[App] Flow data loaded:", {
              name: flowData.name,
              nodes: flowData.nodes.length,
              edges: flowData.edges.length,
              platform: flowData.platform,
            })

            setCurrentFlow(flowData)
            setNodes(flowData.nodes)
            setEdges(flowData.edges)
            setPlatform(flowData.platform)
            setFlowLoaded(true)
          } else {
            console.log("[App] No flow data found for flowId:", flowId)
          }
        }
      }

      loadFlowData()
    }
  }, [flowId, isSetupMode, isNewFlow, loadFromDb])

  // Auto-save flow data when nodes, edges, or platform change
  useEffect(() => {
    if (flowId && currentFlow && !isSetupMode && !isNewFlow && nodes.length > 0 && !isSavingRef.current) {
      const dataToSave = JSON.stringify({ nodes, edges, platform })

      if (dataToSave === lastSavedDataRef.current) {
        return
      }

      const timeoutId = setTimeout(async () => {
        if (isSavingRef.current) {
          return
        }

        isSavingRef.current = true
        console.log("[App] Auto-saving flow data for flowId:", flowId)

        if (loadFromDb) {
          try {
            const response = await fetch(`/api/flows/${flowId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nodes,
                edges,
                platform,
                name: currentFlow.name,
                description: currentFlow.description,
                triggerId: currentFlow.triggerId,
                triggerIds: currentFlow.triggerIds,
                triggerKeywords: currentFlow.triggerKeywords,
                publishedFlowId: currentFlow.publishedFlowId,
              }),
            })

            if (!response.ok) {
              throw new Error(`Failed to update flow: ${response.statusText}`)
            }

            const updatedFlow = await response.json()
            lastSavedDataRef.current = dataToSave
            setCurrentFlow(updatedFlow)
            console.log("[App] Flow saved to database successfully")
          } catch (error) {
            console.error("[App] Error saving flow to database:", error)
          } finally {
            isSavingRef.current = false
          }
        } else {
          updateFlow(flowId, { nodes, edges, platform })
          lastSavedDataRef.current = dataToSave
          isSavingRef.current = false
        }
      }, 1000)

      return () => {
        clearTimeout(timeoutId)
        isSavingRef.current = false
      }
    }
  }, [nodes, edges, platform, flowId, isSetupMode, isNewFlow, loadFromDb])

  const handleFlowSetupComplete = useCallback(
    async (data: { name: string; platform: Platform; triggerId: string; description?: string; triggerKeywords?: string[] }) => {
      if (isNewFlow) {
        if (loadFromDb) {
          try {
            const response = await fetch("/api/flows", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: data.name,
                description: data.description,
                platform: data.platform,
                triggerId: data.triggerId,
                triggerIds: data.triggerId ? [data.triggerId] : [],
                triggerKeywords: data.triggerKeywords || [],
                nodes: [
                  {
                    id: "1",
                    type: "start",
                    position: { x: 250, y: 25 },
                    data: {
                      label: "Start",
                      platform: data.platform,
                      triggerId: data.triggerId,
                      triggerIds: data.triggerId ? [data.triggerId] : [],
                      triggerKeywords: data.triggerKeywords || [],
                    },
                    draggable: false,
                    selectable: true,
                  },
                ],
                edges: [],
              }),
            })

            if (!response.ok) {
              throw new Error(`Failed to create flow: ${response.statusText}`)
            }

            const newFlow = await response.json()

            setCurrentFlow(newFlow)
            setNodes(newFlow.nodes)
            setEdges(newFlow.edges)
            setPlatform(newFlow.platform)

            // Create campaign for web and whatsapp platforms only
            if (data.platform === "web" || data.platform === "whatsapp") {
              try {
                const campaignResponse = await fetch("/api/campaigns/create", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    flow: newFlow,
                    campaignData: {
                      campaignName: data.name,
                      samplingExperience: data.platform === "web" ? "website" : "digital",
                      flowId: newFlow.id,
                    },
                  }),
                })

                if (campaignResponse.ok) {
                  const campaignResult = await campaignResponse.json()
                  if (campaignResult.success) {
                    console.log("[App] Campaign created successfully:", campaignResult)
                    toast.success(`Campaign "${data.name}" created!`)
                  } else {
                    console.warn("[App] Campaign creation returned success:false:", campaignResult.error)
                  }
                } else {
                  console.warn("[App] Failed to create campaign (non-blocking):", campaignResponse.statusText)
                }
              } catch (campaignError) {
                console.error("[App] Error creating campaign (non-blocking):", campaignError)
              }
            }

            router.replace(`/flow/${newFlow.id}?loadFrom=db`)
            toast.success(`Flow "${data.name}" created!`)
          } catch (error) {
            console.error("[App] Error creating flow via API:", error)
            toast.error("Failed to create flow")
            throw error
          }
        } else {
          const newFlow = createFlow(data.name, data.description, data.platform, data.triggerId)

          setCurrentFlow(newFlow)
          setNodes(newFlow.nodes)
          setEdges(newFlow.edges)
          setPlatform(newFlow.platform)

          router.replace(`/flow/${newFlow.id}`)
          toast.success(`Flow "${data.name}" created!`)
        }
      } else if (flowId) {
        const updatedFlow = updateFlow(flowId, {
          name: data.name,
          platform: data.platform,
          triggerId: data.triggerId,
          triggerIds: [data.triggerId],
          description: data.description,
          nodes: [
            {
              id: "1",
              type: "start",
              position: { x: 250, y: 25 },
              data: {
                label: "Start",
                platform: data.platform,
                triggerId: data.triggerId,
                triggerIds: [data.triggerId],
              },
              draggable: true,
              selectable: true,
            },
          ],
        })

        if (updatedFlow) {
          setCurrentFlow(updatedFlow)
          setNodes(updatedFlow.nodes)
          setEdges(updatedFlow.edges)
          setPlatform(updatedFlow.platform)
          router.replace(`/flow/${flowId}`)
          toast.success(`Flow "${data.name}" created!`)
        }
      }
    },
    [flowId, isNewFlow, loadFromDb, router, setNodes, setEdges, setPlatform]
  )

  const handleBackClick = useCallback(() => {
    console.log("[App] Back button clicked, checking source url:", window.location.href)
    if (window.location.href.includes("freestand") || searchParams?.get("scSource") === "true") {
      router.push("/client/campaigns")
    } else {
      router.push("/flows")
    }
  }, [router, searchParams])

  const handleDeleteSharedFlow = useCallback(async () => {
    if (!flowId || !loadFromDb) return

    const success = await deleteSharedFlow(flowId)
    if (success) {
      toast.success("Shared flow deleted")
      if (window.location.href.includes("freestand") || searchParams?.get("scSource") === "true") {
        router.push("/client/campaigns")
      } else {
        router.push("/flows")
      }
    } else {
      toast.error("Failed to delete shared flow")
    }
    setShowDeleteDialog(false)
  }, [flowId, loadFromDb, router, searchParams])

  const handleFlowNameBlur = useCallback(async () => {
    if (editingFlowNameValue.trim() && currentFlow && editingFlowNameValue !== currentFlow.name) {
      if (loadFromDb) {
        try {
          const response = await fetch(`/api/flows/${flowId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: editingFlowNameValue.trim() }),
          })

          if (response.ok) {
            const updated = await response.json()
            setCurrentFlow(updated)
            toast.success("Flow name updated")
          } else {
            toast.error("Failed to update flow name")
            setEditingFlowNameValue(currentFlow.name)
          }
        } catch (error) {
          console.error("Error updating shared flow name:", error)
          toast.error("Failed to update flow name")
          setEditingFlowNameValue(currentFlow.name)
        }
      } else {
        const updated = updateFlow(flowId, { name: editingFlowNameValue.trim() })
        if (updated) {
          setCurrentFlow(updated)
          toast.success("Flow name updated")
        } else {
          toast.error("Failed to update flow name")
          setEditingFlowNameValue(currentFlow.name)
        }
      }
    }
    setIsEditingFlowName(false)
    if (!editingFlowNameValue.trim() || (currentFlow && editingFlowNameValue === currentFlow.name)) {
      if (currentFlow) setEditingFlowNameValue(currentFlow.name)
    }
  }, [editingFlowNameValue, currentFlow, loadFromDb, flowId])

  const saveFlowFields = useCallback(async (updates: Record<string, any>) => {
    if (!loadFromDb || !flowId) return
    try {
      await fetch(`/api/flows/${flowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
    } catch (error) {
      console.error("[App] Error saving flow fields:", error)
    }
  }, [loadFromDb, flowId])

  return {
    currentFlow,
    setCurrentFlow,
    isLoadingFromDb,
    flowLoaded,
    setFlowLoaded,
    isEditingFlowName,
    setIsEditingFlowName,
    editingFlowNameValue,
    setEditingFlowNameValue,
    showDeleteDialog,
    setShowDeleteDialog,
    handleFlowSetupComplete,
    handleBackClick,
    handleDeleteSharedFlow,
    handleFlowNameBlur,
    saveFlowFields,
  }
}
