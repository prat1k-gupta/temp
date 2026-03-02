/**
 * Client-side utility for structured debug logging of AI flow operations.
 * Sends debug data to the API after each AI operation for later diagnosis.
 */

export interface AiDebugEntry {
  timestamp: string
  operationType: "create" | "edit"
  input: {
    userPrompt: string
    platform: string
    selectedNodeId?: string
    flowGraphTree?: string
  }
  aiPlan?: Record<string, unknown>
  buildResult: {
    newNodes: Array<{ id: string; type: string }>
    newEdges: Array<{ source: string; target: string; sourceHandle?: string }>
    nodeUpdates?: Array<{ nodeId: string; fields: string[] }>
    removedNodeIds?: string[]
    removedEdges?: Array<{ source: string; target: string }>
  }
  flowBefore: { nodeCount: number; edgeCount: number; nodeIds: string[] }
  flowAfter: { nodeCount: number; edgeCount: number; nodeIds: string[] }
  warnings: string[]
}

/**
 * Send a debug log entry to the API (fire-and-forget).
 * Failures are silently caught — debug logging should never break the app.
 */
export function sendDebugLog(entry: AiDebugEntry): void {
  try {
    fetch("/api/debug/ai-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }).catch(() => {
      // Silently ignore — debug logging is best-effort
    })
  } catch {
    // Silently ignore
  }
}
