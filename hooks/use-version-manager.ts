import { useState, useEffect, useCallback } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { FlowVersion, FlowChange, Platform, EditModeState } from '@/types'
import { 
  getStoredVersions, 
  getCurrentVersion, 
  saveCurrentVersion, 
  getEditModeState, 
  saveEditModeState,
  createVersion,
  publishVersion,
  addVersion,
  getLatestPublishedVersion,
  saveDraftState,
  getDraftState,
  clearDraftState,
  debugLocalStorageState
} from '@/utils/version-storage'
import { changeTracker } from '@/utils/change-tracker'

export function useVersionManager() {
  const [editModeState, setEditModeState] = useState<EditModeState>({
    isEditMode: false,
    hasUnsavedChanges: false,
    currentVersion: null,
    draftChanges: []
  })

  // Load initial state from localStorage
  useEffect(() => {
    const storedEditMode = getEditModeState()
    const currentVersion = getCurrentVersion()
    const draftChanges = changeTracker.getChanges()
    const latestPublishedVersion = getLatestPublishedVersion()
    
    // Check if this is a first visit (no stored edit mode state)
    const isFirstVisit = storedEditMode === null
    
    if (isFirstVisit) {
      // First visit - check if we have any published versions
      if (latestPublishedVersion) {
        // We have a published version - start in view mode
        console.log('[Version Manager] First visit with published version - starting in view mode')
        
        const initialState: EditModeState = {
          isEditMode: false,
          hasUnsavedChanges: false,
          currentVersion: latestPublishedVersion,
          draftChanges: []
        }
        
        setEditModeState(initialState)
        saveEditModeState(false)
        saveCurrentVersion(latestPublishedVersion)
      } else {
        // No published version exists - start in edit mode and never go back to view mode
        console.log('[Version Manager] First visit with no published version - starting in edit mode')
        
        const initialState: EditModeState = {
          isEditMode: true,
          hasUnsavedChanges: false,
          currentVersion: null,
          draftChanges: []
        }
        
        setEditModeState(initialState)
        saveEditModeState(true)
        changeTracker.startTracking()
      }
    } else {
      // Subsequent visits - use stored state
      setEditModeState({
        isEditMode: storedEditMode,
        hasUnsavedChanges: draftChanges.length > 0,
        currentVersion,
        draftChanges
      })

      // Start tracking if in edit mode
      if (storedEditMode) {
        changeTracker.startTracking()
      }
    }
  }, [])

  /**
   * Toggle edit mode on/off
   */
  const toggleEditMode = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    const newEditMode = !editModeState.isEditMode
    
    if (newEditMode) {
      // Entering edit mode - start tracking changes
      setEditModeState(prev => ({
        ...prev,
        isEditMode: true,
        hasUnsavedChanges: changeTracker.getChangesCount() > 0
      }))
      changeTracker.startTracking()
    } else {
      // Exiting edit mode - check if we have a published version
      const publishedVersion = getLatestPublishedVersion()
      if (publishedVersion) {
        console.log('[Version Manager] Reverting to published version:', publishedVersion.name)
        
        // Load the published version
        const formattedNodes = publishedVersion.nodes.map(node => ({
          ...node,
          data: node.data || {}
        }))
        
        const formattedEdges = publishedVersion.edges.map(edge => ({
          ...edge,
          style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
        }))
        
        setNodes(formattedNodes)
        setEdges(formattedEdges)
        setPlatform(publishedVersion.platform)
        
        // Update state
        setEditModeState(prev => ({
          ...prev,
          isEditMode: false,
          hasUnsavedChanges: false,
          currentVersion: publishedVersion,
          draftChanges: []
        }))
        
        // Clear any draft changes
        changeTracker.clearChanges()
        changeTracker.stopTracking()
      } else {
        // No published version exists - cannot exit edit mode
        console.log('[Version Manager] Cannot exit edit mode - no published version exists')
        return // Don't change the state
      }
    }

    saveEditModeState(newEditMode)
  }, [editModeState.isEditMode])

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
      console.log('[Version Manager] Auto-entering edit mode due to changes')
      console.log('[Version Manager] Current state when entering edit mode:', {
        nodes: currentNodes.length,
        edges: currentEdges.length,
        platform: currentPlatform
      })
      
      setEditModeState(prev => {
        console.log('[Version Manager] Setting edit mode state to true')
        return {
          ...prev,
          isEditMode: true,
          hasUnsavedChanges: true
        }
      })
      changeTracker.startTracking(currentNodes, currentEdges, currentPlatform)
      saveEditModeState(true)
      console.log('[Version Manager] Auto-entered edit mode successfully')
    }
  }, [editModeState.isEditMode])

  /**
   * Exit edit mode
   */
  const exitEditMode = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    if (editModeState.isEditMode) {
      toggleEditMode(setNodes, setEdges, setPlatform)
    }
  }, [editModeState.isEditMode, toggleEditMode])

  /**
   * Update draft changes
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
   * Create a new version from current flow state
   */
  const createNewVersion = useCallback((
    nodes: Node[],
    edges: Edge[],
    platform: Platform,
    name: string,
    description?: string
  ): FlowVersion => {
    console.log('[Version Manager] createNewVersion called:', {
      name,
      description,
      nodes: nodes.length,
      edges: edges.length,
      platform,
      changesCount: changeTracker.getChangesCount()
    })
    console.log('[Version Manager] createNewVersion stack trace:', new Error().stack)
    
    const changes = changeTracker.getChanges()
    const newVersion = createVersion(nodes, edges, platform, name, description, changes)
    
    addVersion(newVersion)
    saveCurrentVersion(newVersion)
    
    setEditModeState(prev => ({
      ...prev,
      currentVersion: newVersion,
      hasUnsavedChanges: false,
      draftChanges: []
    }))

    // Clear tracked changes after creating version
    console.log('[Version Manager] Clearing changes after creating version')
    changeTracker.clearChanges()
    
    return newVersion
  }, [])

  /**
   * Create a new version and immediately publish it
   */
  const createAndPublishVersion = useCallback((
    nodes: Node[],
    edges: Edge[],
    platform: Platform,
    name: string,
    description?: string
  ): FlowVersion | null => {
    console.log('[Version Manager] createAndPublishVersion called:', {
      name,
      description,
      nodes: nodes.length,
      edges: edges.length,
      platform,
      changesCount: changeTracker.getChangesCount()
    })
    
    const changes = changeTracker.getChanges()
    const newVersion = createVersion(nodes, edges, platform, name, description, changes)
    
    addVersion(newVersion)
    
    // Mark the new version as published
    const publishedVersion = publishVersion(newVersion.id)
    
    if (publishedVersion) {
      // Save the published version as current
      saveCurrentVersion(publishedVersion)
      
      // Switch to view mode after publishing
      setEditModeState(prev => ({
        ...prev,
        isEditMode: false,
        currentVersion: publishedVersion,
        hasUnsavedChanges: false,
        draftChanges: []
      }))
      
      saveEditModeState(false)
      
      // Clear changes and draft state after publishing
      changeTracker.clearChanges()
      changeTracker.stopTracking()
      clearDraftState()
      
      console.log('[Version Manager] Created and published new version:', publishedVersion.name)
      return publishedVersion
    }
    
    return null
  }, [])

  /**
   * Publish current version or create new published version
   */
  const publishCurrentVersion = useCallback((nodes: Node[], edges: Edge[], platform: Platform, versionName?: string, description?: string): FlowVersion | null => {
    console.log('[Version Manager] publishCurrentVersion called with:', {
      nodes: nodes.length,
      edges: edges.length,
      platform,
      versionName,
      changesCount: changeTracker.getChangesCount()
    })
    
    // If there are changes, create a new version and mark it as published
    if (changeTracker.getChangesCount() > 0) {
      const allVersions = getStoredVersions()
      const defaultName = versionName || `v${(allVersions.length + 1)} - Published Flow`
      console.log('[Version Manager] Creating new version:', defaultName)
      
      const newVersion = createVersion(nodes, edges, platform, defaultName, description, changeTracker.getChanges())
      console.log('[Version Manager] Created version:', newVersion.id, newVersion.name)
      
      // Mark the new version as published
      const publishedVersion = publishVersion(newVersion.id)
      console.log('[Version Manager] Published version result:', publishedVersion?.id, publishedVersion?.name, publishedVersion?.isPublished)
      
      if (publishedVersion) {
        addVersion(publishedVersion)
        console.log('[Version Manager] Added version to storage')
        
        // Save the published version as current first
        saveCurrentVersion(publishedVersion)
        console.log('[Version Manager] Saved as current version')
        
        // Switch to view mode after publishing
        setEditModeState(prev => {
          console.log('[Version Manager] Updating edit mode state:', {
            isEditMode: false,
            currentVersion: publishedVersion.name,
            hasUnsavedChanges: false
          })
          return {
            ...prev,
            isEditMode: false,
            currentVersion: publishedVersion,
            hasUnsavedChanges: false,
            draftChanges: []
          }
        })
        
        saveEditModeState(false)
        console.log('[Version Manager] Saved edit mode state as false')
        
        // Clear changes and draft state after publishing
        changeTracker.clearChanges()
        changeTracker.stopTracking()
        clearDraftState()
        
        console.log('[Version Manager] Published new version and switched to view mode:', publishedVersion.name)
        return publishedVersion
      }
    } else if (editModeState.currentVersion && !editModeState.currentVersion.isPublished) {
      // If no changes but current version is not published, publish the current version
      const publishedVersion = publishVersion(editModeState.currentVersion.id)
      
      if (publishedVersion) {
        // Save the published version as current first
        saveCurrentVersion(publishedVersion)
        
        // Switch to view mode after publishing
        setEditModeState(prev => ({
          ...prev,
          isEditMode: false,
          currentVersion: publishedVersion
        }))
        
        saveEditModeState(false)
        
        // Clear draft state after publishing
        clearDraftState()
        
        console.log('[Version Manager] Published existing version and switched to view mode:', publishedVersion.name)
        return publishedVersion
      }
    }

    return null
  }, [editModeState.currentVersion])

  /**
   * Load a specific version
   */
  const loadVersion = useCallback((version: FlowVersion, setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    console.log('[Version Manager] Loading version:', version.name, 'with', version.nodes.length, 'nodes and', version.edges.length, 'edges')
    
    saveCurrentVersion(version)
    setEditModeState(prev => ({
      ...prev,
      currentVersion: version,
      hasUnsavedChanges: false,
      draftChanges: []
    }))

    // Load the actual flow data into the main app
    // Ensure nodes have the correct structure for React Flow
    const formattedNodes = version.nodes.map(node => ({
      ...node,
      data: node.data || {}
    }))
    
    // Ensure edges have the correct structure for React Flow
    const formattedEdges = version.edges.map(edge => ({
      ...edge,
      style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
    }))
    
    console.log('[Version Manager] Formatted nodes:', formattedNodes.length, 'edges:', formattedEdges.length)
    
    setNodes(formattedNodes)
    setEdges(formattedEdges)
    setPlatform(version.platform)

    // Clear any existing changes when loading a version
    changeTracker.clearChanges()
    
    console.log('[Version Manager] Version loaded successfully')
  }, [])

  /**
   * Get all versions
   */
  const getAllVersions = useCallback((): FlowVersion[] => {
    const versions = getStoredVersions()
    console.log('[Version Manager] Retrieved versions:', versions.length, versions)
    return versions
  }, [])

  /**
   * Get latest published version
   */
  const getLatestVersion = useCallback((): FlowVersion | null => {
    return getLatestPublishedVersion()
  }, [])

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
   * Load draft state from localStorage
   */
  const loadDraftState = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    const draftState = getDraftState()
    if (draftState) {
      console.log('[Version Manager] Loading draft state from localStorage:', {
        nodes: draftState.nodes.length,
        edges: draftState.edges.length,
        platform: draftState.platform,
        timestamp: draftState.timestamp
      })
      
      // Format nodes and edges for React Flow
      const formattedNodes = draftState.nodes.map(node => ({
        ...node,
        data: node.data || {}
      }))
      
      const formattedEdges = draftState.edges.map(edge => ({
        ...edge,
        style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
      }))
      
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(draftState.platform)
      
      console.log('[Version Manager] Draft state loaded successfully')
      return true
    } else {
      console.log('[Version Manager] No draft state found in localStorage')
    }
    return false
  }, [])

  /**
   * Save current state as draft
   */
  const saveCurrentStateAsDraft = useCallback((nodes: Node[], edges: Edge[], platform: Platform) => {
    if (editModeState.isEditMode) {
      console.log('[Version Manager] Saving current state as draft:', {
        nodes: nodes.length,
        edges: edges.length,
        platform: platform
      })
      saveDraftState(nodes, edges, platform)
    }
  }, [editModeState.isEditMode])

  /**
   * Save published version as draft baseline when entering edit mode
   */
  const savePublishedAsDraftBaseline = useCallback((nodes: Node[], edges: Edge[], platform: Platform) => {
    console.log('[Version Manager] Saving published version as draft baseline:', {
      nodes: nodes.length,
      edges: edges.length,
      platform: platform
    })
    saveDraftState(nodes, edges, platform)
  }, [])

  /**
   * Toggle between view mode (published version) and draft mode (with changes)
   */
  const toggleViewDraft = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    const publishedVersion = getLatestPublishedVersion()
    // const hasDraftChanges = changeTracker.getChangesCount() > 0
    
    if (!publishedVersion) {
      console.log('[Version Manager] Cannot toggle view/draft - no published version exists')
      return
    }
    
    if (editModeState.isEditMode) {
      // Currently in edit mode with changes - switch to view mode (published version)
      console.log('[Version Manager] Switching to view mode - showing published version')
      
      // Load the published version
      const formattedNodes = publishedVersion.nodes.map(node => ({
        ...node,
        data: node.data || {}
      }))
      
      const formattedEdges = publishedVersion.edges.map(edge => ({
        ...edge,
        style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
      }))
      
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(publishedVersion.platform)
      
      // Update state to view mode (but preserve draft changes)
      const preservedChanges = changeTracker.getChanges()
      console.log('[Version Manager] Preserving changes when switching to view mode:', preservedChanges.length)
      setEditModeState(prev => ({
        ...prev,
        isEditMode: false,
        currentVersion: publishedVersion,
        hasUnsavedChanges: false,
        draftChanges: preservedChanges // Preserve the changes instead of clearing them
      }))
      
      saveEditModeState(false)
      // Pause tracking to preserve the changes
      changeTracker.pauseTracking()
    } else if (!editModeState.isEditMode) {
      // Currently in view mode - switch to edit mode (draft changes)
      console.log('[Version Manager] Switching to edit mode - showing draft changes')
      
      // Try to load draft state first
      const draftState = getDraftState()
      if (draftState) {
        console.log('[Version Manager] Loading existing draft state')
        
        // Format nodes and edges for React Flow
        const formattedNodes = draftState.nodes.map(node => ({
          ...node,
          data: node.data || {}
        }))
        
        const formattedEdges = draftState.edges.map(edge => ({
          ...edge,
          style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
        }))
        
        setNodes(formattedNodes)
        setEdges(formattedEdges)
        setPlatform(draftState.platform)
        
        // Resume tracking from the draft state
        changeTracker.resumeTracking()
      } else {
        console.log('[Version Manager] No draft state found, starting from published version')
        // No draft state, start tracking from current published version
        changeTracker.startTracking()
      }
      
      // Update state to edit mode
      const currentChanges = changeTracker.getChanges()
      console.log('[Version Manager] Restoring changes when switching to edit mode:', currentChanges.length)
      setEditModeState(prev => ({
        ...prev,
        isEditMode: true,
        hasUnsavedChanges: currentChanges.length > 0,
        draftChanges: currentChanges
      }))
      
      saveEditModeState(true)
    }
  }, [editModeState.isEditMode])

  /**
   * Reset to published version or clear everything if no published version exists
   */
  const resetToPublished = useCallback((setNodes: (nodes: Node[]) => void, setEdges: (edges: Edge[]) => void, setPlatform: (platform: Platform) => void) => {
    const publishedVersion = getLatestPublishedVersion()
    
    if (publishedVersion) {
      // Load the published version
      console.log('[Version Manager] Resetting to published version:', publishedVersion.name)
      
      const formattedNodes = publishedVersion.nodes.map(node => ({
        ...node,
        data: node.data || {}
      }))
      
      const formattedEdges = publishedVersion.edges.map(edge => ({
        ...edge,
        style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
      }))
      
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(publishedVersion.platform)
      
      // Switch to view mode and clear all changes
      setEditModeState(prev => ({
        ...prev,
        isEditMode: false,
        currentVersion: publishedVersion,
        hasUnsavedChanges: false,
        draftChanges: []
      }))
      
      saveEditModeState(false)
      
      // Clear changes and draft state
      changeTracker.clearChanges()
      changeTracker.stopTracking()
      clearDraftState()
      
      console.log('[Version Manager] Reset to published version complete')
      return true
    } else {
      // No published version - clear everything
      console.log('[Version Manager] No published version - clearing everything')
      
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
      
      // Stay in edit mode but clear all changes
      setEditModeState(prev => ({
        ...prev,
        isEditMode: true,
        hasUnsavedChanges: false,
        draftChanges: []
      }))
      
      saveEditModeState(true)
      
      // Clear changes and draft state
      changeTracker.clearChanges()
      changeTracker.startTracking()
      clearDraftState()
      
      console.log('[Version Manager] Cleared everything')
      return true
    }
  }, [editModeState])

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
    
    // Draft state management
    loadDraftState,
    saveCurrentStateAsDraft,
    savePublishedAsDraftBaseline,
    
    // Debug
    debugLocalStorageState,
    
    // Computed values
    isEditMode: editModeState.isEditMode,
    currentVersion: editModeState.currentVersion,
    draftChanges: editModeState.draftChanges
  }
}
