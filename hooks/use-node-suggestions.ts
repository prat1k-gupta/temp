import { useState, useCallback } from "react"
import type { Platform, SuggestedNode } from "@/types"

interface UseNodeSuggestionsOptions {
  currentNodeType: string
  platform: Platform
  flowContext?: string
  existingNodes?: Array<{ type: string; label?: string }>
  maxSuggestions?: number
}

export function useNodeSuggestions() {
  const [suggestions, setSuggestions] = useState<SuggestedNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSuggestions = useCallback(async (options: UseNodeSuggestionsOptions) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/ai/suggest-nodes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentNodeType: options.currentNodeType,
          platform: options.platform,
          flowContext: options.flowContext,
          existingNodes: options.existingNodes,
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
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch suggestions"
      setError(errorMessage)
      console.error("[use-node-suggestions] Error:", err)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clearSuggestions = useCallback(() => {
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

