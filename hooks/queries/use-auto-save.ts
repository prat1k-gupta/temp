import { useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { useSaveDraft } from "./use-versions"

const AUTO_SAVE_DELAY_MS = 1000

/**
 * Debounced auto-save hook.
 * Saves draft to server when nodes/edges/platform change.
 * Flushes pending save on unmount (navigating away) so data is never lost.
 */
export function useAutoSave(
  projectId: string,
  nodes: Node[],
  edges: Edge[],
  platform: Platform,
  enabled: boolean,
) {
  const saveDraft = useSaveDraft()
  const lastSavedRef = useRef<string>("")
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const pendingSaveRef = useRef<{ nodes: Node[]; edges: Edge[]; platform: Platform } | null>(null)

  // Stable save function that doesn't change between renders
  const save = useCallback(
    (n: Node[], e: Edge[], p: Platform) => {
      saveDraft.mutate({
        projectId,
        nodes: n,
        edges: e,
        platform: p,
      })
    },
    [projectId, saveDraft.mutate],
  )

  useEffect(() => {
    if (!enabled || !projectId || projectId === "new" || nodes.length === 0) {
      return
    }

    const snapshot = JSON.stringify({ nodes, edges, platform })
    if (snapshot === lastSavedRef.current) {
      pendingSaveRef.current = null
      return
    }

    // Track what needs to be saved
    pendingSaveRef.current = { nodes, edges, platform }

    // Clear any pending save
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      lastSavedRef.current = snapshot
      pendingSaveRef.current = null
      save(nodes, edges, platform)
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      // Flush pending save on unmount — don't lose data when navigating away
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      if (pendingSaveRef.current) {
        const { nodes: n, edges: e, platform: p } = pendingSaveRef.current
        lastSavedRef.current = JSON.stringify({ nodes: n, edges: e, platform: p })
        pendingSaveRef.current = null
        save(n, e, p)
      }
    }
  }, [nodes, edges, platform, projectId, enabled, save])

  return {
    isSaving: saveDraft.isPending,
  }
}
