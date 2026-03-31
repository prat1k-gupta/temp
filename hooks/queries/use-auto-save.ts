import { useEffect, useRef, useCallback } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { useSaveDraft } from "./use-versions"
import { changeTracker } from "@/utils/change-tracker"

const AUTO_SAVE_DELAY_MS = 1000

/**
 * Debounced auto-save hook.
 * - Seeds baseline on first enable so server-loaded data isn't re-saved.
 * - Flushes pending save on unmount and on disable (mode toggle).
 * - Only active when `enabled` is true (gated on isEditMode in page.tsx).
 */
export function useAutoSave(
  projectId: string,
  nodes: Node[],
  edges: Edge[],
  platform: Platform,
  enabled: boolean,
  isEditMode: boolean,
) {
  const saveDraft = useSaveDraft()
  const lastSavedRef = useRef<string>("")
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const pendingSaveRef = useRef<{ nodes: Node[]; edges: Edge[]; platform: Platform } | null>(null)
  const initializedRef = useRef(false)

  const save = useCallback(
    (n: Node[], e: Edge[], p: Platform) => {
      saveDraft.mutate({
        projectId,
        nodes: n,
        edges: e,
        platform: p,
        isEditMode,
        // Only send changes when user has added new ones this session.
        // Undefined = don't overwrite server's existing changes.
        changes: changeTracker.isDirty() ? changeTracker.getChanges() : undefined,
      })
    },
    [projectId, saveDraft.mutate, isEditMode],
  )

  // Flush helper — saves pending data immediately
  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (pendingSaveRef.current) {
      const { nodes: n, edges: e, platform: p } = pendingSaveRef.current
      lastSavedRef.current = JSON.stringify({ nodes: n, edges: e, platform: p })
      pendingSaveRef.current = null
      save(n, e, p)
    }
  }, [save])

  // Main auto-save effect
  useEffect(() => {
    if (!enabled || !projectId || projectId === "new" || nodes.length === 0) return

    // On first enable, seed the baseline with current data — don't save it back
    if (!initializedRef.current) {
      initializedRef.current = true
      lastSavedRef.current = JSON.stringify({ nodes, edges, platform })
      return
    }

    const snapshot = JSON.stringify({ nodes, edges, platform })
    if (snapshot === lastSavedRef.current) {
      pendingSaveRef.current = null
      return
    }

    pendingSaveRef.current = { nodes, edges, platform }

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      lastSavedRef.current = snapshot
      pendingSaveRef.current = null
      save(nodes, edges, platform)
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [nodes, edges, platform, projectId, enabled, save])

  // On disable (switching to view mode) or unmount — flush pending save and reset
  useEffect(() => {
    if (!enabled && initializedRef.current) {
      flush()
      initializedRef.current = false
    }
    // Flush on unmount (navigating away)
    return () => flush()
  }, [enabled, flush])

  return { isSaving: saveDraft.isPending, flush }
}
