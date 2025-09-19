import type { FlowChange, Platform } from "@/types"
import { generateId, getDraftChanges, saveDraftChanges } from "./version-storage"

/**
 * Change tracker for capturing user actions
 */
export class ChangeTracker {
  private changes: FlowChange[] = []
  private isTracking: boolean = false
  private initialState: {
    nodes: any[]
    edges: any[]
    platform: Platform
  } | null = null

  constructor() {
    this.loadDraftChanges()
  }

  /**
   * Start tracking changes
   */
  startTracking(nodes: any[] = [], edges: any[] = [], platform: Platform = "web"): void {
    this.isTracking = true
    this.initialState = {
      nodes: JSON.parse(JSON.stringify(nodes)), // Deep clone
      edges: JSON.parse(JSON.stringify(edges)), // Deep clone
      platform
    }
  }

  /**
   * Stop tracking changes
   */
  stopTracking(): void {
    this.isTracking = false
  }

  /**
   * Check if currently tracking
   */
  isCurrentlyTracking(): boolean {
    return this.isTracking
  }

  /**
   * Load draft changes from localStorage
   */
  private loadDraftChanges(): void {
    this.changes = getDraftChanges()
  }

  /**
   * Save changes to localStorage
   */
  private saveChanges(): void {
    saveDraftChanges(this.changes)
  }

  /**
   * Add a change to the tracker
   */
  private addChange(
    type: FlowChange['type'],
    data: any,
    description: string
  ): void {
    if (!this.isTracking) return

    const change: FlowChange = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      data,
      description
    }

    this.changes.push(change)
    this.saveChanges()
  }

  /**
   * Track node addition
   */
  trackNodeAdd(node: any): void {
    this.addChange('node_add', node, `Added ${node.type} node: ${node.data?.label || node.id}`)
  }

  /**
   * Track node deletion
   */
  trackNodeDelete(nodeId: string, nodeType?: string, nodeLabel?: string | undefined): void {
    this.addChange('node_delete', { nodeId, nodeType, nodeLabel }, `Deleted ${nodeType} node: ${nodeLabel || nodeId}`)
  }

  /**
   * Track node update with smart change detection
   */
  trackNodeUpdate(nodeId: string, oldData: any, newData: any, oldType?: string, newType?: string): void {
    console.log('[Change Tracker] Checking node update for:', nodeId)
    console.log('[Change Tracker] Old data:', oldData)
    console.log('[Change Tracker] New data:', newData)
    console.log('[Change Tracker] Type change:', oldType, '→', newType)
    
    // First check if there's any difference at all
    const hasAnyChange = JSON.stringify(oldData) !== JSON.stringify(newData)
    const hasTypeChange = oldType && newType && oldType !== newType
    console.log('[Change Tracker] Has any change:', hasAnyChange, 'Has type change:', hasTypeChange)
    
    if (!hasAnyChange && !hasTypeChange) {
      console.log('[Change Tracker] No changes detected - data is identical')
      return
    }
    
    // Check for node type transitions first
    if (hasTypeChange) {
      const transitionReason = this.detectTransitionReason(oldType!, newType!, oldData, newData)
      if (transitionReason) {
        console.log('[Change Tracker] Detected node type transition:', transitionReason)
        this.addChange('node_update', { 
          nodeId, 
          oldData, 
          newData, 
          changes: [{ property: 'nodeType', oldValue: oldType, newValue: newType }],
          transitionReason
        }, transitionReason)
        return
      }
    }
    
    // Try to detect specific changes
    const changes = this.detectNodeChanges(oldData, newData)
    console.log('[Change Tracker] Detected specific changes:', changes)
    
    if (changes.length > 0) {
      // Use smart change description
      const changeDescription = this.formatNodeChangeDescription(changes, nodeId)
      console.log('[Change Tracker] Smart change description:', changeDescription)
      this.addChange('node_update', { 
        nodeId, 
        oldData, 
        newData, 
        changes 
      }, changeDescription)
    } else {
      // If no meaningful changes detected, don't track anything
      console.log('[Change Tracker] No meaningful changes detected - not tracking update')
      return
    }
  }

  /**
   * Detect the reason for node type transitions
   */
  private detectTransitionReason(oldType: string, newType: string, oldData: any, newData: any): string | null {
    // Question → Quick Reply (first button added)
    if (this.isQuestionType(oldType) && this.isQuickReplyType(newType)) {
      return "Added first button - converted to Quick Reply"
    }
    
    // Quick Reply → WhatsApp List (max buttons reached)
    if (this.isQuickReplyType(oldType) && this.isListType(newType)) {
      const oldButtons = oldData?.buttons || []
      const newOptions = newData?.options || []
      
      // Check if we hit the button limit
      if (oldButtons.length >= 3 && newOptions.length > 0) {
        return `Reached ${oldButtons.length} button limit - converted to List`
      }
    }
    
    return null
  }

  /**
   * Check if a node type is a question type
   */
  private isQuestionType(type: string): boolean {
    return type === 'question' || type === 'whatsappQuestion' || type === 'instagramQuestion'
  }

  /**
   * Check if a node type is a quick reply type
   */
  private isQuickReplyType(type: string): boolean {
    return type === 'quickReply' || type === 'whatsappQuickReply' || type === 'instagramQuickReply'
  }

  /**
   * Check if a node type is a list type
   */
  private isListType(type: string): boolean {
    return type === 'whatsappList' || type === 'whatsappListSpecific' || type === 'instagramList'
  }

  /**
   * Detect meaningful changes between old and new node data
   */
  private detectNodeChanges(oldData: any, newData: any): Array<{property: string, oldValue: any, newValue: any}> {
    const changes: Array<{property: string, oldValue: any, newValue: any}> = []
    
    // Properties that are meaningful to users
    const userFacingProperties = [
      'label', 'text', 'message', 'question', 'title', 'description', 
      'placeholder', 'buttonText', 'options', 'buttons', 'validation',
      'required', 'type', 'style', 'color', 'size', 'nodeType'
    ]
    
    // Properties to ignore (technical/internal)
    const ignoredProperties = [
      'id', 'onNodeUpdate', 'onAddButton', 'onAddOption', 'onAddConnection', 
      'onDelete', 'onConnect', 'onDisconnect', '_timestamp', '__id', 
      'position', 'selected', 'dragging', 'data', 'sourcePosition', 
      'targetPosition', 'sourceHandle', 'targetHandle', 'animated',
      'hidden', 'deletable', 'selectable', 'dragHandle', 'dragHandleClass'
    ]
    
    // Get all properties from both objects
    const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})])
    console.log('[Change Tracker] All properties to check:', Array.from(allKeys))
    
    for (const prop of allKeys) {
      // Skip ignored properties
      if (ignoredProperties.includes(prop)) {
        console.log(`[Change Tracker] Skipping ignored property: ${prop}`)
        continue
      }
      
      const oldValue = oldData?.[prop]
      const newValue = newData?.[prop]
      
      console.log(`[Change Tracker] Checking ${prop}:`, { oldValue, newValue })
      
      // More thorough comparison
      let hasChanged = false
      
      if (oldValue !== newValue) {
        // Handle arrays specially
        if (Array.isArray(oldValue) && Array.isArray(newValue)) {
          hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue)
        } else {
          hasChanged = true
        }
      }
      
      if (hasChanged) {
        changes.push({
          property: prop,
          oldValue,
          newValue
        })
        console.log(`[Change Tracker] Added change for ${prop}`)
      } else {
        console.log(`[Change Tracker] No change for ${prop}`)
      }
    }
    
    console.log('[Change Tracker] Total meaningful changes detected:', changes.length)
    return changes
  }


  /**
   * Format a human-readable description of node changes
   */
  private formatNodeChangeDescription(changes: Array<{property: string, oldValue: any, newValue: any}>, nodeId: string): string {
    if (changes.length === 1) {
      const change = changes[0]
      return this.formatSingleChange(change, nodeId)
    } else if (changes.length <= 3) {
      const changeDescriptions = changes.map(change => this.formatSingleChange(change, nodeId, false))
      return `Updated node: ${changeDescriptions.join(', ')}`
    } else {
      return `Updated node: ${changes.length} properties changed`
    }
  }

  /**
   * Format a single property change
   */
  private formatSingleChange(change: {property: string, oldValue: any, newValue: any}, nodeId: string, includeNodeId: boolean = true): string {
    const { property, oldValue, newValue } = change
    
    // Handle special cases for better readability
    if (property === 'label' || property === 'text' || property === 'message' || property === 'question') {
      const prefix = includeNodeId ? `Updated ${property}` : `Updated ${property}`
      return `${prefix}: "${oldValue || 'empty'}" → "${newValue || 'empty'}"`
    }
    
    if (property === 'buttons') {
      const oldCount = Array.isArray(oldValue) ? oldValue.length : 0
      const newCount = Array.isArray(newValue) ? newValue.length : 0
      if (newCount > oldCount) {
        return `Added ${newCount - oldCount} button${newCount - oldCount > 1 ? 's' : ''}`
      } else if (newCount < oldCount) {
        return `Removed ${oldCount - newCount} button${oldCount - newCount > 1 ? 's' : ''}`
      } else {
        return `Updated buttons`
      }
    }
    
    if (property === 'options') {
      const oldCount = Array.isArray(oldValue) ? oldValue.length : 0
      const newCount = Array.isArray(newValue) ? newValue.length : 0
      if (newCount > oldCount) {
        return `Added ${newCount - oldCount} option${newCount - oldCount > 1 ? 's' : ''}`
      } else if (newCount < oldCount) {
        return `Removed ${oldCount - newCount} option${oldCount - newCount > 1 ? 's' : ''}`
      } else {
        return `Updated options`
      }
    }
    
    if (property === 'required') {
      return `${oldValue ? 'Made required' : 'Made optional'}`
    }
    
    if (property === 'nodeType') {
      return `Changed type: ${oldValue || 'unknown'} → ${newValue || 'unknown'}`
    }
    
    if (property === 'type') {
      return `Changed type: ${oldValue || 'unknown'} → ${newValue || 'unknown'}`
    }
    
    // Generic change
    return `Updated ${property}: ${oldValue || 'empty'} → ${newValue || 'empty'}`
  }

  /**
   * Track edge addition
   */
  trackEdgeAdd(edge: any): void {
    this.addChange('edge_add', edge, `Added connection: ${edge.source} → ${edge.target}`)
  }

  /**
   * Track edge deletion
   */
  trackEdgeDelete(edgeId: string, source: string, target: string): void {
    this.addChange('edge_delete', { edgeId, source, target }, `Deleted connection: ${source} → ${target}`)
  }

  /**
   * Track edge update
   */
  trackEdgeUpdate(edgeId: string, oldEdge: any, newEdge: any): void {
    this.addChange('edge_update', { edgeId, oldEdge, newEdge }, `Updated connection: ${edgeId}`)
  }

  /**
   * Track platform change
   */
  trackPlatformChange(oldPlatform: Platform, newPlatform: Platform): void {
    this.addChange('platform_change', { oldPlatform, newPlatform }, `Changed platform: ${oldPlatform} → ${newPlatform}`)
  }

  /**
   * Track flow import
   */
  trackFlowImport(nodes: any[], edges: any[], platform: Platform): void {
    this.addChange('flow_import', { nodes, edges, platform }, `Imported flow with ${nodes.length} nodes and ${edges.length} edges`)
  }

  /**
   * Get all tracked changes
   */
  getChanges(): FlowChange[] {
    return [...this.changes]
  }

  /**
   * Get changes count
   */
  getChangesCount(): number {
    return this.changes.length
  }

  /**
   * Clear all changes
   */
  clearChanges(): void {
    this.changes = []
    this.saveChanges()
  }

  /**
   * Get changes summary for display
   */
  getChangesSummary(): string {
    const count = this.changes.length
    if (count === 0) return "No changes"
    if (count === 1) return "1 change"
    return `${count} changes`
  }

  /**
   * Get recent changes (last N changes)
   */
  getRecentChanges(count: number = 5): FlowChange[] {
    return this.changes.slice(-count).reverse()
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.changes.length > 0
  }


  /**
   * Check if current state differs from initial state
   */
  hasActualChanges(currentNodes: any[], currentEdges: any[], currentPlatform: Platform): boolean {
    if (!this.initialState) {
      return this.changes.length > 0
    }

    // Compare nodes
    const initialNodesStr = JSON.stringify(this.initialState.nodes.sort((a, b) => a.id.localeCompare(b.id)))
    const currentNodesStr = JSON.stringify(currentNodes.sort((a, b) => a.id.localeCompare(b.id)))
    
    // Compare edges
    const initialEdgesStr = JSON.stringify(this.initialState.edges.sort((a, b) => a.id.localeCompare(b.id)))
    const currentEdgesStr = JSON.stringify(currentEdges.sort((a, b) => a.id.localeCompare(b.id)))
    
    // Compare platform
    const platformChanged = this.initialState.platform !== currentPlatform
    
    return initialNodesStr !== currentNodesStr || initialEdgesStr !== currentEdgesStr || platformChanged
  }

  /**
   * Get initial state
   */
  getInitialState() {
    return this.initialState
  }
}

// Global change tracker instance
export const changeTracker = new ChangeTracker()
