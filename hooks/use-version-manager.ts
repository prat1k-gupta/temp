import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Node, Edge } from '@xyflow/react'
import type { FlowVersion, FlowChange, Platform, EditModeState } from '@/types'
import { useVersions, useDraft, useCreateVersion, usePublishVersion, useDeleteDraft, versionKeys } from '@/hooks/queries'
import { apiClient } from '@/lib/api-client'
import { changeTracker } from '@/utils/change-tracker'
import { getEditModeState, saveEditModeState } from '@/utils/version-storage'

/**
 * Format nodes/edges for ReactFlow (ensure data/style objects exist).
 */
function formatForReactFlow(nodes: any[], edges: any[]) {
  const formattedNodes = nodes.map(node => ({
    ...node,
    data: node.data || {}
  }))
  const formattedEdges = edges.map(edge => ({
    ...edge,
    style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
  }))
  return { formattedNodes, formattedEdges }
}

export function useVersionManager(flowId: string) {
  const queryClient = useQueryClient()

  const [editModeState, setEditModeState] = useState<EditModeState>({
    isEditMode: false,
    hasUnsavedChanges: false,
    currentVersion: null,
    draftChanges: []
  })

  // --- React Query hooks ---
  const versionsQuery = useVersions(flowId)
  const draftQuery = useDraft(flowId)
  const createVersionMutation = useCreateVersion()
  const publishVersionMutation = usePublishVersion()
  const deleteDraftMutation = useDeleteDraft()

  // Derived: latest published version from the server-fetched list
  const latestPublishedVersion = versionsQuery.data?.find(v => v.isPublished) ?? null

  // Initialize edit mode — check server draft first, then localStorage, then defaults
  const hasDraft = !!draftQuery.data
  useEffect(() => {
    if (versionsQuery.isLoading || !versionsQuery.data || draftQuery.isLoading) return

    changeTracker.setFlowId(flowId)

    const storedEditMode = getEditModeState(flowId)
    const isFirstVisit = storedEditMode === null

    if (isFirstVisit) {
      if (hasDraft) {
        // Draft exists on server — start in edit mode regardless of published state
        setEditModeState({
          isEditMode: true,
          hasUnsavedChanges: true,
          currentVersion: latestPublishedVersion,
          draftChanges: []
        })
        saveEditModeState(flowId, true)
        changeTracker.startTracking()
      } else if (latestPublishedVersion) {
        // No draft, has published version — start in view mode
        setEditModeState({
          isEditMode: false,
          hasUnsavedChanges: false,
          currentVersion: latestPublishedVersion,
          draftChanges: []
        })
        saveEditModeState(flowId, false)
      } else {
        // No draft, no published version — start in edit mode
        setEditModeState({
          isEditMode: true,
          hasUnsavedChanges: false,
          currentVersion: null,
          draftChanges: []
        })
        saveEditModeState(flowId, true)
        changeTracker.startTracking()
      }
    } else {
      // Subsequent visit — restore stored edit mode
      const draftChanges = changeTracker.getChanges()
      setEditModeState({
        isEditMode: storedEditMode,
        hasUnsavedChanges: draftChanges.length > 0,
        currentVersion: latestPublishedVersion,
        draftChanges
      })

      if (storedEditMode) {
        changeTracker.startTracking()
      }
    }
  }, [flowId, versionsQuery.isLoading, draftQuery.isLoading, hasDraft, latestPublishedVersion?.id])

  /**
   * Load draft from server and set on canvas.
   * Fetches fresh from API (not cache) to ensure latest auto-saved data.
   */
  const loadDraftOntoCanvas = useCallback(async (
    setNodes: (nodes: Node[]) => void,
    setEdges: (edges: Edge[]) => void,
    setPlatform: (platform: Platform) => void,
  ) => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: versionKeys.draft(flowId),
        queryFn: async () => {
          try {
            const result = await apiClient.get<any>(`/api/magic-flow/projects/${flowId}/draft`)
            return result?.draft || result
          } catch {
            return null
          }
        },
        staleTime: 0,
      })
      if (data?.nodes) {
        const { formattedNodes, formattedEdges } = formatForReactFlow(data.nodes, data.edges || [])
        setNodes(formattedNodes)
        setEdges(formattedEdges)
        if (data.platform) setPlatform(data.platform as Platform)
      }
    } catch {
      // No draft — stay on current canvas
    }
  }, [flowId, queryClient])

  /**
   * Toggle edit mode on/off
   */
  const toggleEditMode = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    const newEditMode = !editModeState.isEditMode

    if (newEditMode) {
      // Entering edit mode — reload draft from server, THEN activate edit mode
      loadDraftOntoCanvas(setNodes, setEdges, setPlatform).then(() => {
        setEditModeState(prev => ({
          ...prev,
          isEditMode: true,
          hasUnsavedChanges: changeTracker.getChangesCount() > 0
        }))
        changeTracker.startTracking()
        saveEditModeState(flowId, true)
      })
    } else {
      // Exiting edit mode — revert to published version
      if (latestPublishedVersion) {
        const { formattedNodes, formattedEdges } = formatForReactFlow(
          latestPublishedVersion.nodes,
          latestPublishedVersion.edges
        )
        setNodes(formattedNodes)
        setEdges(formattedEdges)
        setPlatform(latestPublishedVersion.platform)

        setEditModeState(prev => ({
          ...prev,
          isEditMode: false,
          hasUnsavedChanges: false,
          currentVersion: latestPublishedVersion,
          draftChanges: []
        }))
        changeTracker.clearChanges()
        changeTracker.stopTracking()
        saveEditModeState(flowId, false)
      } else {
        // No published version — cannot exit edit mode
        return
      }
    }
  }, [editModeState.isEditMode, latestPublishedVersion, flowId])

  /**
   * Enter edit mode
   */
  const enterEditMode = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    if (!editModeState.isEditMode) {
      toggleEditMode(setNodes, setEdges, setPlatform)
    }
  }, [editModeState.isEditMode, toggleEditMode])

  /**
   * Auto-enter edit mode when changes are made (for view mode users)
   */
  const autoEnterEditMode = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void, currentNodes: Node[], currentEdges: Edge[], currentPlatform: Platform) => {
    if (!editModeState.isEditMode) {
      setEditModeState(prev => ({
        ...prev,
        isEditMode: true,
        hasUnsavedChanges: true
      }))
      changeTracker.startTracking(currentNodes, currentEdges, currentPlatform)
      saveEditModeState(flowId, true)
    }
  }, [editModeState.isEditMode, flowId])

  /**
   * Exit edit mode
   */
  const exitEditMode = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    if (editModeState.isEditMode) {
      toggleEditMode(setNodes, setEdges, setPlatform)
    }
  }, [editModeState.isEditMode, toggleEditMode])

  /**
   * Update draft changes from change tracker
   */
  const updateDraftChanges = useCallback(() => {
    const changes = changeTracker.getChanges()
    setEditModeState(prev => ({
      ...prev,
      hasUnsavedChanges: changes.length > 0,
      draftChanges: changes
    }))
  }, [])

  /**
   * Create a new version via API
   */
  const createNewVersion = useCallback(async (
    nodes: Node[],
    edges: Edge[],
    platform: Platform,
    name: string,
    description?: string
  ): Promise<FlowVersion> => {
    const changes = changeTracker.getChanges()
    const newVersion = await createVersionMutation.mutateAsync({
      projectId: flowId,
      name,
      description,
      nodes,
      edges,
      platform,
      changes,
    })

    setEditModeState(prev => ({
      ...prev,
      currentVersion: newVersion,
      hasUnsavedChanges: false,
      draftChanges: []
    }))
    changeTracker.clearChanges()

    return newVersion
  }, [flowId, createVersionMutation])

  /**
   * Create a new version and immediately publish it
   */
  const createAndPublishVersion = useCallback(async (
    nodes: Node[],
    edges: Edge[],
    platform: Platform,
    name: string,
    description?: string
  ): Promise<FlowVersion | null> => {
    const changes = changeTracker.getChanges()

    // Create version
    const newVersion = await createVersionMutation.mutateAsync({
      projectId: flowId,
      name,
      description,
      nodes,
      edges,
      platform,
      changes,
    })

    // Publish it
    const publishedVersion = await publishVersionMutation.mutateAsync({
      projectId: flowId,
      versionId: newVersion.id,
    })

    // Switch to view mode
    setEditModeState({
      isEditMode: false,
      currentVersion: publishedVersion,
      hasUnsavedChanges: false,
      draftChanges: []
    })
    changeTracker.clearChanges()
    changeTracker.stopTracking()
    saveEditModeState(flowId, false)

    // Delete draft since we just published
    deleteDraftMutation.mutate(flowId)

    return publishedVersion
  }, [flowId, createVersionMutation, publishVersionMutation, deleteDraftMutation])

  /**
   * Publish current version or create new published version
   */
  const publishCurrentVersion = useCallback(async (nodes: Node[], edges: Edge[], platform: Platform, versionName?: string, description?: string): Promise<FlowVersion | null> => {
    if (changeTracker.getChangesCount() > 0) {
      // Has changes — create + publish
      const allVersions = versionsQuery.data || []
      const defaultName = versionName || `v${(allVersions.length + 1)} - Published Flow`
      return createAndPublishVersion(nodes, edges, platform, defaultName, description)
    } else if (editModeState.currentVersion && !editModeState.currentVersion.isPublished) {
      // No changes but current version not published — publish it
      const publishedVersion = await publishVersionMutation.mutateAsync({
        projectId: flowId,
        versionId: editModeState.currentVersion.id,
      })

      setEditModeState(prev => ({
        ...prev,
        isEditMode: false,
        currentVersion: publishedVersion
      }))
      saveEditModeState(flowId, false)

      deleteDraftMutation.mutate(flowId)
      return publishedVersion
    }

    return null
  }, [editModeState.currentVersion, versionsQuery.data, flowId, createAndPublishVersion, publishVersionMutation, deleteDraftMutation])

  /**
   * Load a specific version into the canvas
   */
  const loadVersion = useCallback((version: FlowVersion, setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    const { formattedNodes, formattedEdges } = formatForReactFlow(version.nodes, version.edges)

    setEditModeState(prev => ({
      ...prev,
      currentVersion: version,
      hasUnsavedChanges: false,
      draftChanges: []
    }))

    setNodes(formattedNodes)
    setEdges(formattedEdges)
    setPlatform(version.platform)
    changeTracker.clearChanges()
  }, [])

  /**
   * Get all versions (from React Query cache)
   */
  const getAllVersions = useCallback((): FlowVersion[] => {
    return versionsQuery.data || []
  }, [versionsQuery.data])

  /**
   * Get latest published version
   */
  const getLatestVersion = useCallback((): FlowVersion | null => {
    return latestPublishedVersion
  }, [latestPublishedVersion])

  /**
   * Clear all changes (discard draft)
   */
  const discardChanges = useCallback(() => {
    changeTracker.clearChanges()
    setEditModeState(prev => ({
      ...prev,
      hasUnsavedChanges: false,
      draftChanges: []
    }))
  }, [])

  /**
   * Check if there are unsaved changes
   */
  const hasUnsavedChanges = useCallback((): boolean => {
    return changeTracker.hasUnsavedChanges()
  }, [])

  /**
   * Get changes summary
   */
  const getChangesSummary = useCallback((): string => {
    return changeTracker.getChangesSummary()
  }, [])

  /**
   * Get changes count
   */
  const getChangesCount = useCallback((): number => {
    return changeTracker.getChangesCount()
  }, [])

  /**
   * Get recent changes
   */
  const getRecentChanges = useCallback((count?: number): FlowChange[] => {
    return changeTracker.getRecentChanges(count)
  }, [])

  /**
   * Check if there are actual changes (comparing initial vs current state)
   */
  const hasActualChanges = useCallback((currentNodes: Node[], currentEdges: Edge[], currentPlatform: Platform) => {
    return changeTracker.hasActualChanges(currentNodes, currentEdges, currentPlatform)
  }, [])

  /**
   * Toggle between view mode (published version) and draft mode
   */
  const toggleViewDraft = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    if (!latestPublishedVersion) return

    if (editModeState.isEditMode) {
      // Switch to view mode — show published version
      const { formattedNodes, formattedEdges } = formatForReactFlow(
        latestPublishedVersion.nodes,
        latestPublishedVersion.edges
      )
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(latestPublishedVersion.platform)

      const preservedChanges = changeTracker.getChanges()
      setEditModeState(prev => ({
        ...prev,
        isEditMode: false,
        currentVersion: latestPublishedVersion,
        hasUnsavedChanges: false,
        draftChanges: preservedChanges
      }))
      changeTracker.pauseTracking()
      saveEditModeState(flowId, false)
    } else {
      // Switch to edit mode — reload draft from server, THEN activate edit mode
      loadDraftOntoCanvas(setNodes, setEdges, setPlatform).then(() => {
        changeTracker.resumeTracking()
        const currentChanges = changeTracker.getChanges()
        setEditModeState(prev => ({
          ...prev,
          isEditMode: true,
          hasUnsavedChanges: currentChanges.length > 0,
          draftChanges: currentChanges
        }))
        saveEditModeState(flowId, true)
      })
    }
  }, [editModeState.isEditMode, latestPublishedVersion, flowId, loadDraftOntoCanvas])

  /**
   * Reset to published version
   */
  const resetToPublished = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    if (latestPublishedVersion) {
      const { formattedNodes, formattedEdges } = formatForReactFlow(
        latestPublishedVersion.nodes,
        latestPublishedVersion.edges
      )
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(latestPublishedVersion.platform)

      setEditModeState({
        isEditMode: false,
        currentVersion: latestPublishedVersion,
        hasUnsavedChanges: false,
        draftChanges: []
      })
      changeTracker.clearChanges()
      changeTracker.stopTracking()
      saveEditModeState(flowId, false)
      deleteDraftMutation.mutate(flowId)
      return true
    } else {
      // No published version — reset to blank
      const initialNodes: Node[] = [
        {
          id: "1",
          type: "start",
          position: { x: 250, y: 25 },
          data: { label: "Start", platform: "web" },
          draggable: false,
          selectable: false,
        },
      ]
      setNodes(initialNodes)
      setEdges([])
      setPlatform("web")

      setEditModeState({
        isEditMode: true,
        hasUnsavedChanges: false,
        currentVersion: null,
        draftChanges: []
      })
      changeTracker.clearChanges()
      changeTracker.startTracking()
      saveEditModeState(flowId, true)
      deleteDraftMutation.mutate(flowId)
      return true
    }
  }, [latestPublishedVersion, flowId, deleteDraftMutation])

  // No-op stubs for deprecated localStorage draft methods
  // (auto-save now handles drafts via useAutoSave in use-flow-persistence)
  const loadDraftState = useCallback(() => false, [])
  const saveCurrentStateAsDraft = useCallback(() => {}, [])
  const savePublishedAsDraftBaseline = useCallback(() => {}, [])

  return {
    // State
    editModeState,

    // Edit mode controls
    toggleEditMode,
    toggleViewDraft,
    enterEditMode,
    exitEditMode,
    autoEnterEditMode,

    // Version management
    createNewVersion,
    createAndPublishVersion,
    publishCurrentVersion,
    loadVersion,
    getAllVersions,
    getLatestVersion,
    resetToPublished,

    // Change tracking
    updateDraftChanges,
    discardChanges,
    hasUnsavedChanges,
    hasActualChanges,
    getChangesSummary,
    getRecentChanges,
    getChangesCount,

    // Draft state management (stubs — auto-save handles this now)
    loadDraftState,
    saveCurrentStateAsDraft,
    savePublishedAsDraftBaseline,

    // Loading / mutation states
    isVersionsLoading: versionsQuery.isLoading,
    isPublishing: publishVersionMutation.isPending,
    isCreatingVersion: createVersionMutation.isPending,

    // Debug
    debugLocalStorageState: () => console.log('[Version Manager] Versions:', versionsQuery.data),

    // Computed values
    isEditMode: editModeState.isEditMode,
    currentVersion: editModeState.currentVersion,
    draftChanges: editModeState.draftChanges
  }
}
