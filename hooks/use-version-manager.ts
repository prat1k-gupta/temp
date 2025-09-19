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
  getLatestPublishedVersion
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
      // First visit - always start in view mode with latest published version
      console.log('[Version Manager] First visit - starting in view mode with latest published version')
      
      const initialState: EditModeState = {
        isEditMode: false,
        hasUnsavedChanges: false,
        currentVersion: latestPublishedVersion,
        draftChanges: []
      }
      
      setEditModeState(initialState)
      saveEditModeState(false)
      
      // If we have a published version, save it as current
      if (latestPublishedVersion) {
        saveCurrentVersion(latestPublishedVersion)
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
      // Exiting edit mode - revert to published version
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
      } else {
        // No published version, just exit edit mode
        setEditModeState(prev => ({
          ...prev,
          isEditMode: false,
          hasUnsavedChanges: false
        }))
      }
      changeTracker.stopTracking()
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
      setEditModeState(prev => ({
        ...prev,
        isEditMode: true,
        hasUnsavedChanges: true
      }))
      changeTracker.startTracking(currentNodes, currentEdges, currentPlatform)
      saveEditModeState(true)
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
    changeTracker.clearChanges()
    
    return newVersion
  }, [])

  /**
   * Publish current version or create new published version
   */
  const publishCurrentVersion = useCallback((nodes: Node[], edges: Edge[], platform: Platform, versionName?: string, description?: string): FlowVersion | null => {
    // If there are changes, create a new version and mark it as published
    if (changeTracker.getChangesCount() > 0) {
      const allVersions = getStoredVersions()
      const defaultName = versionName || `v${(allVersions.length + 1)} - Published Flow`
      const newVersion = createVersion(nodes, edges, platform, defaultName, description, changeTracker.getChanges())
      
      // Mark the new version as published
      const publishedVersion = publishVersion(newVersion.id)
      
      if (publishedVersion) {
        addVersion(publishedVersion)
        setEditModeState(prev => ({
          ...prev,
          currentVersion: publishedVersion,
          hasUnsavedChanges: false,
          draftChanges: []
        }))
        
        // Clear changes after publishing
        changeTracker.clearChanges()
        
        console.log('[Version Manager] Published new version:', publishedVersion.name)
        return publishedVersion
      }
    } else if (editModeState.currentVersion && !editModeState.currentVersion.isPublished) {
      // If no changes but current version is not published, publish the current version
      const publishedVersion = publishVersion(editModeState.currentVersion.id)
      
      if (publishedVersion) {
        setEditModeState(prev => ({
          ...prev,
          currentVersion: publishedVersion
        }))
        
        console.log('[Version Manager] Published existing version:', publishedVersion.name)
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

  return {
    // State
    editModeState,
    
    // Edit mode controls
    toggleEditMode,
    enterEditMode,
    exitEditMode,
    autoEnterEditMode,
    
    // Version management
    createNewVersion,
    publishCurrentVersion,
    loadVersion,
    getAllVersions,
    getLatestVersion,
    
    // Change tracking
    updateDraftChanges,
    discardChanges,
    hasUnsavedChanges,
    hasActualChanges,
    getChangesSummary,
    getRecentChanges,
    getChangesCount,
    
    // Computed values
    isEditMode: editModeState.isEditMode,
    currentVersion: editModeState.currentVersion,
    draftChanges: editModeState.draftChanges
  }
}
