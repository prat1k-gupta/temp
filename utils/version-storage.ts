import type { FlowVersion, FlowChange, Platform } from "@/types"

const STORAGE_KEYS = {
  VERSIONS: 'magic-flow-versions',
  CURRENT_VERSION: 'magic-flow-current-version',
  DRAFT_CHANGES: 'magic-flow-draft-changes',
  EDIT_MODE: 'magic-flow-edit-mode',
  DRAFT_STATE: 'magic-flow-draft-state'
} as const

/**
 * Generate a unique ID for versions and changes
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get all stored versions from localStorage
 */
export function getStoredVersions(): FlowVersion[] {
  try {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(STORAGE_KEYS.VERSIONS)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error loading versions from localStorage:', error)
    return []
  }
}

/**
 * Save versions to localStorage
 */
export function saveVersions(versions: FlowVersion[]): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.VERSIONS, JSON.stringify(versions))
  } catch (error) {
    console.error('Error saving versions to localStorage:', error)
  }
}
//deployment test commit

/**
 * Get the current version from localStorage
 */
export function getCurrentVersion(): FlowVersion | null {
  try {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEYS.CURRENT_VERSION)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.error('Error loading current version from localStorage:', error)
    return null
  }
}

/**
 * Save the current version to localStorage
 */
export function saveCurrentVersion(version: FlowVersion | null): void {
  try {
    if (typeof window === 'undefined') return
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
 * Get draft changes from localStorage
 */
export function getDraftChanges(): FlowChange[] {
  try {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(STORAGE_KEYS.DRAFT_CHANGES)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Error loading draft changes from localStorage:', error)
    return []
  }
}

/**
 * Save draft changes to localStorage
 */
export function saveDraftChanges(changes: FlowChange[]): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.DRAFT_CHANGES, JSON.stringify(changes))
  } catch (error) {
    console.error('Error saving draft changes to localStorage:', error)
  }
}

/**
 * Get edit mode state from localStorage
 */
export function getEditModeState(): boolean | null {
  try {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEYS.EDIT_MODE)
    return stored ? JSON.parse(stored) : null
  } catch (error) {
    console.error('Error loading edit mode state from localStorage:', error)
    return null
  }
}

/**
 * Save edit mode state to localStorage
 */
export function saveEditModeState(isEditMode: boolean): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.EDIT_MODE, JSON.stringify(isEditMode))
  } catch (error) {
    console.error('Error saving edit mode state to localStorage:', error)
  }
}

/**
 * Create a new version from current flow state
 */
export function createVersion(
  nodes: any[],
  edges: any[],
  platform: Platform,
  name: string,
  description?: string,
  changes: FlowChange[] = []
): FlowVersion {
  const versions = getStoredVersions()
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
 * Publish a version (mark as published)
 * Only one version can be published at a time
 */
export function publishVersion(versionId: string): FlowVersion | null {
  const versions = getStoredVersions()
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
  
  saveVersions(updatedVersions)
  
  return updatedVersions[versionIndex]
}

/**
 * Add a new version to storage
 */
export function addVersion(version: FlowVersion): void {
  const versions = getStoredVersions()
  versions.push(version)
  saveVersions(versions)
}

/**
 * Get version by ID
 */
export function getVersionById(versionId: string): FlowVersion | null {
  const versions = getStoredVersions()
  return versions.find(v => v.id === versionId) || null
}

/**
 * Delete a version
 */
export function deleteVersion(versionId: string): boolean {
  const versions = getStoredVersions()
  const filteredVersions = versions.filter(v => v.id !== versionId)
  
  if (filteredVersions.length === versions.length) {
    return false // Version not found
  }
  
  saveVersions(filteredVersions)
  return true
}

/**
 * Get the latest published version
 */
export function getLatestPublishedVersion(): FlowVersion | null {
  const versions = getStoredVersions()
  const publishedVersions = versions.filter(v => v.isPublished)
  
  if (publishedVersions.length === 0) {
    return null
  }
  
  return publishedVersions.sort((a, b) => b.version - a.version)[0]
}

/**
 * Save draft state (nodes, edges, platform) to localStorage
 */
export function saveDraftState(nodes: any[], edges: any[], platform: Platform): void {
  try {
    const draftState = {
      nodes: nodes.map(({ data, ...node }) => ({ ...node, data })),
      edges: edges.map(({ style, ...edge }) => edge),
      platform,
      timestamp: new Date().toISOString()
    }
    console.log('[Draft Storage] Saving draft state:', {
      nodes: draftState.nodes.length,
      edges: draftState.edges.length,
      platform: draftState.platform,
      timestamp: draftState.timestamp
    })
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEYS.DRAFT_STATE, JSON.stringify(draftState))
    console.log('[Draft Storage] Draft state saved successfully')
  } catch (error) {
    console.error('Error saving draft state to localStorage:', error)
  }
}

/**
 * Get draft state from localStorage
 */
export function getDraftState(): { nodes: any[], edges: any[], platform: Platform, timestamp: string } | null {
  try {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEYS.DRAFT_STATE)
    if (stored) {
      const parsed = JSON.parse(stored)
      console.log('[Draft Storage] Loading draft state:', {
        nodes: parsed.nodes?.length || 0,
        edges: parsed.edges?.length || 0,
        platform: parsed.platform,
        timestamp: parsed.timestamp
      })
      return parsed
    } else {
      console.log('[Draft Storage] No draft state found in localStorage')
      return null
    }
  } catch (error) {
    console.error('Error loading draft state from localStorage:', error)
    return null
  }
}

/**
 * Clear draft state from localStorage
 */
export function clearDraftState(): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEYS.DRAFT_STATE)
    console.log('[Draft Storage] Draft state cleared from localStorage')
  } catch (error) {
    console.error('Error clearing draft state from localStorage:', error)
  }
}

/**
 * Debug function to check all localStorage state
 */
export function debugLocalStorageState(): void {
  console.log('[Draft Storage] === LOCALSTORAGE DEBUG ===')
  console.log('[Draft Storage] Edit Mode:', getEditModeState())
  console.log('[Draft Storage] Current Version:', getCurrentVersion()?.name || 'None')
  console.log('[Draft Storage] Draft State:', getDraftState())
  console.log('[Draft Storage] All Versions:', getStoredVersions().map(v => ({ name: v.name, isPublished: v.isPublished })))
  console.log('[Draft Storage] === END DEBUG ===')
}
