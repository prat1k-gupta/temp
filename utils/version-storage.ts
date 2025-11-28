import type { FlowVersion, FlowChange, Platform } from "@/types"

// Storage keys are now flow-specific to prevent data leakage between flows
const getStorageKeys = (flowId: string) => ({
  VERSIONS: `magic-flow-versions-${flowId}`,
  CURRENT_VERSION: `magic-flow-current-version-${flowId}`,
  DRAFT_CHANGES: `magic-flow-draft-changes-${flowId}`,
  EDIT_MODE: `magic-flow-edit-mode-${flowId}`,
  DRAFT_STATE: `magic-flow-draft-state-${flowId}`
} as const)

// Global key to track the current flow ID
const CURRENT_FLOW_ID_KEY = 'magic-flow-current-flow-id'

/**
 * Generate a unique ID for versions and changes
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get current flow ID
 */
export function getCurrentFlowId(): string | null {
  try {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(CURRENT_FLOW_ID_KEY)
  } catch (error) {
    console.error('Error loading current flow ID from localStorage:', error)
    return null
  }
}

/**
 * Set current flow ID
 */
export function setCurrentFlowId(flowId: string): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(CURRENT_FLOW_ID_KEY, flowId)
  } catch (error) {
    console.error('Error saving current flow ID to localStorage:', error)
  }
}

/**
 * Get all stored versions from localStorage for a specific flow
 */
export function getStoredVersions(flowId: string): FlowVersion[] {
  try {
    if (typeof window === 'undefined') return []
    const STORAGE_KEYS = getStorageKeys(flowId)
    const stored = localStorage.getItem(STORAGE_KEYS.VERSIONS)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error loading versions from localStorage:', error)
    return []
  }
}

/**
 * Save versions to localStorage for a specific flow
 */
export function saveVersions(flowId: string, versions: FlowVersion[]): void {
  try {
    if (typeof window === 'undefined') return
    const STORAGE_KEYS = getStorageKeys(flowId)
    localStorage.setItem(STORAGE_KEYS.VERSIONS, JSON.stringify(versions))
  } catch (error) {
    console.error('Error saving versions to localStorage:', error)
  }
}
//deployment test commit

/**
 * Get the current version from localStorage for a specific flow
 */
export function getCurrentVersion(flowId: string): FlowVersion | null {
  try {
    if (typeof window === 'undefined') return null
    const STORAGE_KEYS = getStorageKeys(flowId)
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_VERSION)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.error('Error loading current version from localStorage:', error)
    return null
  }
}

/**
 * Save the current version to localStorage for a specific flow
 */
export function saveCurrentVersion(flowId: string, version: FlowVersion | null): void {
  try {
    if (typeof window === 'undefined') return
    const STORAGE_KEYS = getStorageKeys(flowId)
    if (version) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_VERSION, JSON.stringify(version))
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_VERSION)
    }
  } catch (error) {
    console.error('Error saving current version to localStorage:', error)
  }
}

/**
 * Get draft changes from localStorage for a specific flow
 */
export function getDraftChanges(flowId: string): FlowChange[] {
  try {
    if (typeof window === 'undefined') return []
    const STORAGE_KEYS = getStorageKeys(flowId)
    const stored = localStorage.getItem(STORAGE_KEYS.DRAFT_CHANGES)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error loading draft changes from localStorage:', error)
    return []
  }
}

/**
 * Save draft changes to localStorage for a specific flow
 */
export function saveDraftChanges(flowId: string, changes: FlowChange[]): void {
  try {
    if (typeof window === 'undefined') return
    const STORAGE_KEYS = getStorageKeys(flowId)
    localStorage.setItem(STORAGE_KEYS.DRAFT_CHANGES, JSON.stringify(changes))
  } catch (error) {
    console.error('Error saving draft changes to localStorage:', error)
  }
}

/**
 * Get edit mode state from localStorage for a specific flow
 */
export function getEditModeState(flowId: string): boolean | null {
  try {
    if (typeof window === 'undefined') return null
    const STORAGE_KEYS = getStorageKeys(flowId)
    const stored = localStorage.getItem(STORAGE_KEYS.EDIT_MODE)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.error('Error loading edit mode state from localStorage:', error)
    return null
  }
}

/**
 * Save edit mode state to localStorage for a specific flow
 */
export function saveEditModeState(flowId: string, isEditMode: boolean): void {
  try {
    if (typeof window === 'undefined') return
    const STORAGE_KEYS = getStorageKeys(flowId)
    localStorage.setItem(STORAGE_KEYS.EDIT_MODE, JSON.stringify(isEditMode))
  } catch (error) {
    console.error('Error saving edit mode state to localStorage:', error)
  }
}

/**
 * Create a new version from current flow state for a specific flow
 */
export function createVersion(
  flowId: string,
  nodes: any[],
  edges: any[],
  platform: Platform,
  name: string,
  description?: string,
  changes: FlowChange[] = []
): FlowVersion {
  const versions = getStoredVersions(flowId)
  const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1
  
  return {
    id: generateId(),
    version: nextVersion,
    name,
    description,
    nodes: nodes.map(({ data, ...node }) => ({ ...node, data })),
    edges: edges.map(({ style, ...edge }) => edge),
    platform,
    createdAt: new Date().toISOString(),
    isPublished: false,
    changes
  }
}

/**
 * Publish a version (mark as published) for a specific flow
 * Only one version can be published at a time
 */
export function publishVersion(flowId: string, versionId: string): FlowVersion | null {
  const versions = getStoredVersions(flowId)
  const versionIndex = versions.findIndex(v => v.id === versionId)
  
  if (versionIndex === -1) {
    console.error('Version not found:', versionId)
    return null
  }
  
  // Unpublish all other versions (only one can be published at a time)
  const updatedVersions = versions.map(version => ({
    ...version,
    isPublished: version.id === versionId,
    publishedAt: version.id === versionId ? new Date().toISOString() : undefined
  }))
  
  saveVersions(flowId, updatedVersions)
  
  return updatedVersions[versionIndex]
}

/**
 * Add a new version to storage for a specific flow
 */
export function addVersion(flowId: string, version: FlowVersion): void {
  const versions = getStoredVersions(flowId)
  versions.push(version)
  saveVersions(flowId, versions)
}

/**
 * Get version by ID for a specific flow
 */
export function getVersionById(flowId: string, versionId: string): FlowVersion | null {
  const versions = getStoredVersions(flowId)
  return versions.find(v => v.id === versionId) || null
}

/**
 * Delete a version for a specific flow
 */
export function deleteVersion(flowId: string, versionId: string): boolean {
  const versions = getStoredVersions(flowId)
  const filteredVersions = versions.filter(v => v.id !== versionId)
  
  if (filteredVersions.length === versions.length) {
    return false // Version not found
  }
  
  saveVersions(flowId, filteredVersions)
  return true
}

/**
 * Get the latest published version for a specific flow
 */
export function getLatestPublishedVersion(flowId: string): FlowVersion | null {
  const versions = getStoredVersions(flowId)
  const publishedVersions = versions.filter(v => v.isPublished)
  
  if (publishedVersions.length === 0) {
    return null
  }
  
  return publishedVersions.sort((a, b) => b.version - a.version)[0]
}

/**
 * Save draft state (nodes, edges, platform) to localStorage for a specific flow
 */
export function saveDraftState(flowId: string, nodes: any[], edges: any[], platform: Platform): void {
  try {
    const draftState = {
      nodes: nodes.map(({ data, ...node }) => ({ ...node, data })),
      edges: edges.map(({ style, ...edge }) => edge),
      platform,
      timestamp: new Date().toISOString()
    }
    console.log('[Draft Storage] Saving draft state for flow:', flowId, {
      nodes: draftState.nodes.length,
      edges: draftState.edges.length,
      platform: draftState.platform,
      timestamp: draftState.timestamp
    })
    if (typeof window === 'undefined') return
    const STORAGE_KEYS = getStorageKeys(flowId)
    localStorage.setItem(STORAGE_KEYS.DRAFT_STATE, JSON.stringify(draftState))
    console.log('[Draft Storage] Draft state saved successfully')
  } catch (error) {
    console.error('Error saving draft state to localStorage:', error)
  }
}

/**
 * Get draft state from localStorage for a specific flow
 */
export function getDraftState(flowId: string): { nodes: any[], edges: any[], platform: Platform, timestamp: string } | null {
  try {
    if (typeof window === 'undefined') return null
    const STORAGE_KEYS = getStorageKeys(flowId)
    const stored = localStorage.getItem(STORAGE_KEYS.DRAFT_STATE)
    if (stored) {
      const parsed = JSON.parse(stored)
      console.log('[Draft Storage] Loading draft state for flow:', flowId, {
        nodes: parsed.nodes?.length || 0,
        edges: parsed.edges?.length || 0,
        platform: parsed.platform,
        timestamp: parsed.timestamp
      })
      return parsed
    } else {
      console.log('[Draft Storage] No draft state found in localStorage for flow:', flowId)
      return null
    }
  } catch (error) {
    console.error('Error loading draft state from localStorage:', error)
    return null
  }
}

/**
 * Clear draft state from localStorage for a specific flow
 */
export function clearDraftState(flowId: string): void {
  try {
    if (typeof window === 'undefined') return
    const STORAGE_KEYS = getStorageKeys(flowId)
    localStorage.removeItem(STORAGE_KEYS.DRAFT_STATE)
    console.log('[Draft Storage] Draft state cleared from localStorage for flow:', flowId)
  } catch (error) {
    console.error('Error clearing draft state from localStorage:', error)
  }
}

/**
 * Debug function to check all localStorage state for a specific flow
 */
export function debugLocalStorageState(flowId: string): void {
  console.log('[Draft Storage] === LOCALSTORAGE DEBUG FOR FLOW:', flowId, '===')
  console.log('[Draft Storage] Edit Mode:', getEditModeState(flowId))
  console.log('[Draft Storage] Current Version:', getCurrentVersion(flowId)?.name || 'None')
  console.log('[Draft Storage] Draft State:', getDraftState(flowId))
  console.log('[Draft Storage] All Versions:', getStoredVersions(flowId).map(v => ({ name: v.name, isPublished: v.isPublished })))
  console.log('[Draft Storage] === END DEBUG ===')
}
