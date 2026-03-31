import { useState, useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import type { FlowData } from "@/utils/flow-storage"
import { useFlow, useCreateFlow, useUpdateFlow, useDeleteFlow } from "@/hooks/queries"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"

/**
 * Migrate old apiFetch edges from unnamed handle to "success" handle
 */
export function migrateApiFetchEdges(nodes: Node[], edges: Edge[]): { edges: Edge[]; migrated: boolean } {
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

/**
 * Migrate old super nodes (name, email, dob, address) to flowTemplate nodes.
 */
export function migrateSuperNodesToTemplates(nodes: Node[]): { nodes: Node[]; migrated: boolean } {
  const SUPER_NODE_TYPES = new Set(["name", "email", "dob", "address"])
  let migrated = false

  const migratedNodes = nodes.map((node) => {
    if (!SUPER_NODE_TYPES.has(node.type || "")) return node

    migrated = true
    const data = node.data as any
    const nodeType = node.type as string

    const defaultTemplate = DEFAULT_TEMPLATES.find(
      (t) => t.name.toLowerCase() === nodeType
    )

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
  const [flowLoaded, setFlowLoaded] = useState(false)
  const lastDataUpdatedAtRef = useRef<number>(0)
  const [isEditingFlowName, setIsEditingFlowName] = useState(false)
  const [editingFlowNameValue, setEditingFlowNameValue] = useState("")
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const currentFlowRef = useRef<FlowData | null>(null)
  currentFlowRef.current = currentFlow

  // --- React Query hooks ---
  const shouldLoad = !isSetupMode && !isNewFlow
  const flowQuery = useFlow(shouldLoad ? flowId : "")
  const createFlowMutation = useCreateFlow()
  const updateFlowMutation = useUpdateFlow(flowId)
  const deleteFlowMutation = useDeleteFlow()

  // Sync editing value when flow changes
  useEffect(() => {
    if (currentFlow && !isEditingFlowName) {
      setEditingFlowNameValue(currentFlow.name)
    }
  }, [currentFlow?.name, isEditingFlowName])

  // Load flow data whenever React Query delivers NEW data (stale or fresh).
  // Uses dataUpdatedAt to re-load when background refetch brings newer data.
  // Auto-save is gated on flowLoaded, so it only activates after the last load.
  useEffect(() => {
    if (!shouldLoad || !flowQuery.data || !flowQuery.dataUpdatedAt) return
    if (flowQuery.dataUpdatedAt === lastDataUpdatedAtRef.current) return

    lastDataUpdatedAtRef.current = flowQuery.dataUpdatedAt
    const flowData = { ...flowQuery.data }
    console.log("[App] Flow data loaded:", {
      name: flowData.name,
      nodes: flowData.nodes?.length || 0,
      edges: flowData.edges?.length || 0,
      platform: flowData.platform,
      dataUpdatedAt: flowQuery.dataUpdatedAt,
    })

    // Migrate super nodes -> flow template nodes
    const { nodes: migratedNodes, migrated } = migrateSuperNodesToTemplates(flowData.nodes)
    if (migrated) flowData.nodes = migratedNodes

    // Migrate old apiFetch edges (unnamed handle -> "success")
    const { edges: migratedEdges, migrated: edgesMigrated } = migrateApiFetchEdges(flowData.nodes, flowData.edges)
    if (edgesMigrated) flowData.edges = migratedEdges

    // Persist migrations in a single call to avoid races
    if (migrated || edgesMigrated) {
      const updates: Record<string, any> = {}
      if (migrated) updates.nodes = flowData.nodes
      if (edgesMigrated) updates.edges = flowData.edges
      updateFlowMutation.mutate(updates)
    }

    setCurrentFlow(flowData)
    setNodes(flowData.nodes)
    setEdges(flowData.edges)
    setPlatform(flowData.platform)
    setFlowLoaded(true)
  }, [flowQuery.data, flowQuery.dataUpdatedAt, shouldLoad])

  const handleFlowSetupComplete = useCallback(
    async (data: { name: string; platform: Platform; triggerId: string; triggerIds?: string[]; description?: string; triggerKeywords?: string[]; triggerMatchType?: string; triggerRef?: string; waAccountId?: string; waPhoneNumber?: string }) => {
      if (isNewFlow) {
        try {
          const newFlow = await createFlowMutation.mutateAsync({
            name: data.name,
            description: data.description,
            platform: data.platform,
            triggerId: data.triggerId,
            triggerKeywords: data.triggerKeywords,
            waAccountId: data.waAccountId,
            triggerMatchType: data.triggerMatchType,
            triggerRef: data.triggerRef,
          })

          setCurrentFlow(newFlow)
          setNodes(newFlow.nodes)
          setEdges(newFlow.edges)
          setPlatform(newFlow.platform)
          setFlowLoaded(true)

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
        try {
          const updatedFlow = await updateFlowMutation.mutateAsync({
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
        } catch (error) {
          console.error("[App] Error updating flow:", error)
          toast.error("Failed to update flow")
        }
      }
    },
    [flowId, isNewFlow, router, setNodes, setEdges, setPlatform, createFlowMutation, updateFlowMutation]
  )

  const handleBackClick = useCallback(() => {
    if (window.location.href.includes("freestand") || searchParams?.get("scSource") === "true") {
      router.push("/client/campaigns")
    } else {
      router.push("/flows")
    }
  }, [router, searchParams])

  const handleDeleteFlow = useCallback(async () => {
    if (!flowId) return

    deleteFlowMutation.mutate(flowId, {
      onSuccess: (success) => {
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
      },
      onError: () => {
        toast.error("Failed to delete flow")
      },
    })
    setShowDeleteDialog(false)
  }, [flowId, router, searchParams, deleteFlowMutation])

  const handleFlowNameBlur = useCallback(async () => {
    if (editingFlowNameValue.trim() && currentFlow && editingFlowNameValue !== currentFlow.name) {
      try {
        const updated = await updateFlowMutation.mutateAsync({ name: editingFlowNameValue.trim() })
        if (updated) {
          setCurrentFlow(updated)
          toast.success("Flow name updated")
        } else {
          toast.error("Failed to update flow name")
          setEditingFlowNameValue(currentFlow.name)
        }
      } catch {
        toast.error("Failed to update flow name")
        if (currentFlow) setEditingFlowNameValue(currentFlow.name)
      }
    }
    setIsEditingFlowName(false)
    if (!editingFlowNameValue.trim() || (currentFlow && editingFlowNameValue === currentFlow.name)) {
      if (currentFlow) setEditingFlowNameValue(currentFlow.name)
    }
  }, [editingFlowNameValue, currentFlow, updateFlowMutation])

  const saveFlowFields = useCallback(async (updates: Record<string, any>) => {
    if (!flowId) return
    try {
      await updateFlowMutation.mutateAsync(updates)
    } catch (error) {
      console.error("[App] Error saving flow fields:", error)
    }
  }, [flowId, updateFlowMutation])

  return {
    currentFlow,
    setCurrentFlow,
    isLoadingFromDb: flowQuery.isLoading && shouldLoad,
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
    isCreating: createFlowMutation.isPending,
  }
}
