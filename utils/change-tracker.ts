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
   * Track node update
   */
  trackNodeUpdate(nodeId: string, oldData: any, newData: any): void {
    this.addChange('node_update', { nodeId, oldData, newData }, `Updated node: ${nodeId}`)
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
