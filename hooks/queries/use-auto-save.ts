import { useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { useSaveDraft } from "./use-versions"

const AUTO_SAVE_DELAY_MS = 1000

/**
 * Debounced auto-save hook.
 * Saves draft to server when nodes/edges/platform change.
 * Uses a ref-based approach to avoid re-triggering the effect on every mutation render.
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
      return
    }

    // Clear any pending save
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      lastSavedRef.current = snapshot
      save(nodes, edges, platform)
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [nodes, edges, platform, projectId, enabled, save])

  return {
    isSaving: saveDraft.isPending,
  }
}
