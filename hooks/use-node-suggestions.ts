import { useState, useCallback, useRef } from "react"
import type { Platform, SuggestedNode } from "@/types"

interface UseNodeSuggestionsOptions {
  currentNodeType: string
  currentNodeId?: string
  platform: Platform
  flowContext?: string
  existingNodes?: Array<{
    id: string
    type: string
    label?: string
    question?: string
    text?: string
    buttons?: Array<{ text?: string; id?: string }>
    options?: Array<{ text?: string; id?: string }>
    storeAs?: string
  }>
  edges?: Array<{ source: string; target: string; sourceHandle?: string }>
  maxSuggestions?: number
}

export function useNodeSuggestions() {
  const [suggestions, setSuggestions] = useState<SuggestedNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchSuggestions = useCallback(async (options: UseNodeSuggestionsOptions) => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/ai/suggest-nodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          currentNodeType: options.currentNodeType,
          currentNodeId: options.currentNodeId,
          platform: options.platform,
          flowContext: options.flowContext,
          existingNodes: options.existingNodes,
          edges: options.edges,
          maxSuggestions: options.maxSuggestions || 2,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to fetch suggestions")
      }

      const data = await response.json()
      setSuggestions(data.suggestions || [])
    } catch (err) {
      // Don't treat abort as an error
      if (err instanceof DOMException && err.name === "AbortError") {
        return
      }
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch suggestions"
      setError(errorMessage)
      console.error("[use-node-suggestions] Error:", err)
      setSuggestions([])
    } finally {
      // Only clear loading if this controller wasn't replaced
      if (abortControllerRef.current === controller) {
        setLoading(false)
      }
    }
  }, [])

  const clearSuggestions = useCallback(() => {
    // Abort any in-flight request when clearing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setSuggestions([])
    setError(null)
  }, [])

  return {
    suggestions,
    loading,
    error,
    fetchSuggestions,
    clearSuggestions,
  }
}
