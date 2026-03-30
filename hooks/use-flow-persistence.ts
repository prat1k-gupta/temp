import { useState, useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { getFlow, updateFlow, createFlow, deleteFlow, saveDraft, type FlowData } from "@/utils/flow-storage"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"

/**
 * Migrate old super nodes (name, email, dob, address) to flowTemplate nodes.
 * Wraps the super node data into internalNodes within a flowTemplate node.
 */
// Migrate old apiFetch edges from unnamed handle to "success" handle
function migrateApiFetchEdges(nodes: Node[], edges: Edge[]): { edges: Edge[]; migrated: boolean } {
  const apiFetchIds = new Set(nodes.filter((n) => n.type === "apiFetch").map((n) => n.id))
  if (apiFetchIds.size === 0) return { edges, migrated: false }

  let migrated = false
  const newEdges = edges.map((edge) => {
    if (apiFetchIds.has(edge.source) && (!edge.sourceHandle || edge.sourceHandle === "")) {
      migrated = true
      return { ...edge, sourceHandle: "success" }
    }
    return edge
  })
  return { edges: newEdges, migrated }
}

function migrateSuperNodesToTemplates(nodes: Node[]): { nodes: Node[]; migrated: boolean } {
  const SUPER_NODE_TYPES = new Set(["name", "email", "dob", "address"])
  let migrated = false

  const migratedNodes = nodes.map((node) => {
    if (!SUPER_NODE_TYPES.has(node.type || "")) return node

    migrated = true
    const data = node.data as any
    const nodeType = node.type as string

    // Find matching default template for internal nodes
    const defaultTemplate = DEFAULT_TEMPLATES.find(
      (t) => t.name.toLowerCase() === nodeType
    )

    // Build internal nodes from the super node's data
    const internalNodes: Node[] = defaultTemplate
      ? JSON.parse(JSON.stringify(defaultTemplate.nodes)).map((n: Node) => ({
          ...n,
          data: {
            ...n.data,
            question: data.question || (n.data as any).question,
            storeAs: data.storeAs || (n.data as any).storeAs,
            validationRules: data.validationRules || (n.data as any).validationRules,
            ...(data.addressComponents ? { addressComponents: data.addressComponents } : {}),
          },
        }))
      : [
          {
            id: `int-${nodeType}-q`,
            type: "whatsappQuestion",
            position: { x: 100, y: 50 },
            data: {
              platform: data.platform || "whatsapp",
              label: data.label || nodeType,
              question: data.question || "",
              storeAs: data.storeAs || "",
              validationRules: data.validationRules || {},
            },
          },
        ]

    return {
      ...node,
      type: "flowTemplate",
      data: {
        platform: data.platform || "whatsapp",
        label: data.label || nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
        templateName: data.label || nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
        sourceTemplateId: defaultTemplate?.id,
        internalNodes,
        internalEdges: [] as Edge[],
        nodeCount: internalNodes.length,
      },
    }
  })

  return { nodes: migratedNodes, migrated }
}

interface UseFlowPersistenceParams {
  flowId: string
  isNewFlow: boolean
  isSetupMode: boolean
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
  const currentFlowRef = useRef<FlowData | null>(null)
  currentFlowRef.current = currentFlow

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
        console.log("[App] Loading flow for flowId:", flowId)
        setIsLoadingFromDb(true)

        try {
          const flowData = await getFlow(flowId)

          if (flowData) {
            console.log("[App] Flow data loaded:", {
              name: flowData.name,
              nodes: flowData.nodes?.length || 0,
              edges: flowData.edges?.length || 0,
              platform: flowData.platform,
            })

            // Migrate super nodes -> flow template nodes
            const { nodes: migratedNodes, migrated } = migrateSuperNodesToTemplates(flowData.nodes)
            if (migrated) {
              flowData.nodes = migratedNodes
              updateFlow(flowId, { nodes: migratedNodes }).catch(() => {})
            }

            // Migrate old apiFetch edges (unnamed handle -> "success")
            const { edges: migratedEdges, migrated: edgesMigrated } = migrateApiFetchEdges(flowData.nodes, flowData.edges)
            if (edgesMigrated) {
              flowData.edges = migratedEdges
              updateFlow(flowId, { edges: migratedEdges }).catch(() => {})
            }

            setCurrentFlow(flowData)
            setNodes(flowData.nodes)
            setEdges(flowData.edges)
            setPlatform(flowData.platform)
            setFlowLoaded(true)
          } else {
            console.log("[App] No flow data found for flowId:", flowId)
          }
        } catch (error) {
          console.error("[App] Error loading flow:", error)
          toast.error("Failed to load flow")
        } finally {
          setIsLoadingFromDb(false)
        }
      }

      loadFlowData()
    }
  }, [flowId, isSetupMode, isNewFlow])

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

        try {
          await saveDraft(flowId, nodes, edges, platform)
          lastSavedDataRef.current = dataToSave
          console.log("[App] Flow draft saved successfully")
        } catch (error) {
          console.error("[App] Error saving flow draft:", error)
        } finally {
          isSavingRef.current = false
        }
      }, 1000)

      return () => {
        clearTimeout(timeoutId)
        isSavingRef.current = false
      }
    }
  }, [nodes, edges, platform, flowId, isSetupMode, isNewFlow])

  const handleFlowSetupComplete = useCallback(
    async (data: { name: string; platform: Platform; triggerId: string; triggerIds?: string[]; description?: string; triggerKeywords?: string[]; triggerMatchType?: string; triggerRef?: string; waAccountId?: string; waPhoneNumber?: string }) => {
      if (isNewFlow) {
        try {
          const newFlow = await createFlow(
            data.name,
            data.description,
            data.platform,
            data.triggerId,
            data.triggerKeywords,
            data.waAccountId,
            data.triggerMatchType,
            data.triggerRef,
          )

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

          router.replace(`/flow/${newFlow.id}`)
          toast.success(`Flow "${data.name}" created!`)
        } catch (error) {
          console.error("[App] Error creating flow:", error)
          toast.error("Failed to create flow")
          throw error
        }
      } else if (flowId) {
        const updatedFlow = await updateFlow(flowId, {
          name: data.name,
          platform: data.platform,
          triggerId: data.triggerId,
          triggerIds: data.triggerIds || (data.triggerId ? [data.triggerId] : []),
          description: data.description,
          triggerKeywords: data.triggerKeywords || [],
          triggerMatchType: data.triggerMatchType || "contains_whole_word",
          triggerRef: data.triggerRef || "",
          ...(data.waAccountId ? { waAccountId: data.waAccountId } : {}),
          nodes: [
            {
              id: "1",
              type: "start",
              position: { x: 250, y: 25 },
              data: {
                label: "Start",
                platform: data.platform,
                triggerId: data.triggerId,
                triggerIds: data.triggerIds || (data.triggerId ? [data.triggerId] : []),
                triggerKeywords: data.triggerKeywords || [],
                triggerMatchType: data.triggerMatchType || "contains_whole_word",
                triggerRef: data.triggerRef || "",
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
    [flowId, isNewFlow, router, setNodes, setEdges, setPlatform]
  )

  const handleBackClick = useCallback(() => {
    console.log("[App] Back button clicked, checking source url:", window.location.href)
    if (window.location.href.includes("freestand") || searchParams?.get("scSource") === "true") {
      router.push("/client/campaigns")
    } else {
      router.push("/flows")
    }
  }, [router, searchParams])

  const handleDeleteFlow = useCallback(async () => {
    if (!flowId) return

    const success = await deleteFlow(flowId)
    if (success) {
      toast.success("Flow deleted")
      if (window.location.href.includes("freestand") || searchParams?.get("scSource") === "true") {
        router.push("/client/campaigns")
      } else {
        router.push("/flows")
      }
    } else {
      toast.error("Failed to delete flow")
    }
    setShowDeleteDialog(false)
  }, [flowId, router, searchParams])

  const handleFlowNameBlur = useCallback(async () => {
    if (editingFlowNameValue.trim() && currentFlow && editingFlowNameValue !== currentFlow.name) {
      const updated = await updateFlow(flowId, { name: editingFlowNameValue.trim() })
      if (updated) {
        setCurrentFlow(updated)
        toast.success("Flow name updated")
      } else {
        toast.error("Failed to update flow name")
        setEditingFlowNameValue(currentFlow.name)
      }
    }
    setIsEditingFlowName(false)
    if (!editingFlowNameValue.trim() || (currentFlow && editingFlowNameValue === currentFlow.name)) {
      if (currentFlow) setEditingFlowNameValue(currentFlow.name)
    }
  }, [editingFlowNameValue, currentFlow, flowId])

  const saveFlowFields = useCallback(async (updates: Record<string, any>) => {
    if (!flowId) return
    try {
      await updateFlow(flowId, updates)
    } catch (error) {
      console.error("[App] Error saving flow fields:", error)
    }
  }, [flowId])

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
    handleDeleteFlow,
    handleFlowNameBlur,
    saveFlowFields,
  }
}
