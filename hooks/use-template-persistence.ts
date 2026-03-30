import { useState, useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"
import { getTemplate, updateTemplate, type FlowData } from "@/utils/flow-storage"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface UseTemplatePersistenceParams {
  templateId: string
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setPlatform: (platform: Platform) => void
}

export function useTemplatePersistence({
  templateId,
  nodes,
  edges,
  platform,
  setNodes,
  setEdges,
  setPlatform,
}: UseTemplatePersistenceParams) {
  const router = useRouter()

  const [currentFlow, setCurrentFlow] = useState<FlowData | null>(null)
  const [flowLoaded, setFlowLoaded] = useState(false)
  const [isEditingFlowName, setIsEditingFlowName] = useState(false)
  const [editingFlowNameValue, setEditingFlowNameValue] = useState("")

  const isSavingRef = useRef(false)
  const lastSavedDataRef = useRef<string>("")

  // Sync editing value when flow changes
  useEffect(() => {
    if (currentFlow && !isEditingFlowName) {
      setEditingFlowNameValue(currentFlow.name)
    }
  }, [currentFlow?.name, isEditingFlowName])

  // Load template data
  useEffect(() => {
    if (templateId) {
      const templateData = getTemplate(templateId)

      if (templateData) {
        console.log("[Template] Loaded:", {
          name: templateData.name,
          nodes: templateData.nodes.length,
          edges: templateData.edges.length,
          platform: templateData.platform,
        })

        setCurrentFlow(templateData)
        setNodes(templateData.nodes)
        setEdges(templateData.edges)
        setPlatform(templateData.platform)
        setFlowLoaded(true)
      } else {
        console.log("[Template] Not found for id:", templateId)
      }
    }
  }, [templateId])

  // Auto-save when nodes, edges, or platform change
  useEffect(() => {
    if (templateId && currentFlow && !isSavingRef.current) {
      const dataToSave = JSON.stringify({ nodes, edges, platform })

      if (dataToSave === lastSavedDataRef.current) {
        return
      }

      const timeoutId = setTimeout(() => {
        if (isSavingRef.current) return

        isSavingRef.current = true
        updateTemplate(templateId, { nodes, edges, platform })
        lastSavedDataRef.current = dataToSave
        isSavingRef.current = false
      }, 1000)

      return () => {
        clearTimeout(timeoutId)
        isSavingRef.current = false
      }
    }
  }, [nodes, edges, platform, templateId, currentFlow])

  const handleBackClick = useCallback(() => {
    router.push("/flow-templates")
  }, [router])

  const handleFlowNameBlur = useCallback(() => {
    if (editingFlowNameValue.trim() && currentFlow && editingFlowNameValue !== currentFlow.name) {
      const updated = updateTemplate(templateId, { name: editingFlowNameValue.trim() })
      if (updated) {
        setCurrentFlow(updated)
        toast.success("Template name updated")
      } else {
        toast.error("Failed to update template name")
        setEditingFlowNameValue(currentFlow.name)
      }
    }
    setIsEditingFlowName(false)
    if (!editingFlowNameValue.trim() || (currentFlow && editingFlowNameValue === currentFlow.name)) {
      if (currentFlow) setEditingFlowNameValue(currentFlow.name)
    }
  }, [editingFlowNameValue, currentFlow, templateId])

  const saveFlowFields = useCallback((updates: Record<string, any>) => {
    if (!templateId) return
    updateTemplate(templateId, updates)
  }, [templateId])

  const saveDescription = useCallback((description: string) => {
    if (!templateId) return
    const updated = updateTemplate(templateId, { description })
    if (updated) {
      setCurrentFlow(updated)
    }
  }, [templateId])

  const saveAIMetadata = useCallback((aiMetadata: TemplateAIMetadata) => {
    if (!templateId) return
    const updated = updateTemplate(templateId, { aiMetadata })
    if (updated) {
      setCurrentFlow(updated)
    }
  }, [templateId])

  return {
    currentFlow,
    setCurrentFlow,
    flowLoaded,
    setFlowLoaded,
    isEditingFlowName,
    setIsEditingFlowName,
    editingFlowNameValue,
    setEditingFlowNameValue,
    handleBackClick,
    handleFlowNameBlur,
    saveFlowFields,
    saveDescription,
    saveAIMetadata,
  }
}
