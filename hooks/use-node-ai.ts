import { useState, useCallback, useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Platform } from '@/types'
import type { 
  NodeAIConfig, 
  AIToolName,
  ImproveCopyRequest,
  ImproveCopyResponse,
  ShortenTextRequest,
  ShortenTextResponse,
  GenerateOptionsRequest,
  GenerateOptionsResponse
} from '@/types/ai'

/**
 * Main hook for using AI in nodes
 * Provides a simple interface for nodes to access AI capabilities
 * 
 * @example
 * const ai = useNodeAI({
 *   nodeType: 'question',
 *   platform: 'whatsapp',
 *   capabilities: ['improve-copy', 'shorten']
 * })
 * 
 * // Use it
 * const improved = await ai.improveCopy(text, 'question')
 */
export function useNodeAI(config: NodeAIConfig) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Normalize capabilities
  const capabilities = useMemo(() => {
    if (Array.isArray(config.capabilities)) {
      if (typeof config.capabilities[0] === 'string') {
        return (config.capabilities as AIToolName[]).map(name => ({
          name,
          enabled: true
        }))
      }
    }
    return config.capabilities
  }, [config.capabilities])

  // Check if a capability is enabled
  const hasCapability = useCallback((name: AIToolName): boolean => {
    return capabilities.some(cap => 
      (typeof cap === 'string' ? cap === name : cap.name === name && cap.enabled)
    )
  }, [capabilities])

  /**
   * Improve copy using AI
   */
  const improveCopy = useCallback(async (
    text: string,
    field: string,
    options?: {
      maxLength?: number
      context?: ImproveCopyRequest['context']
    }
  ): Promise<ImproveCopyResponse | null> => {
    if (!hasCapability('improve-copy')) {
      console.warn('[useNodeAI] improve-copy capability not enabled')
      return null
    }

    console.log('[useNodeAI] Starting improveCopy', { text, field, nodeType: config.nodeType })
    setLoading(true)
    setError(null)

    try {
      const requestBody = {
        text,
        nodeType: config.nodeType,
        platform: config.platform || 'web',
        field,
        maxLength: options?.maxLength,
        context: options?.context
      } as ImproveCopyRequest

      console.log('[useNodeAI] Sending request to /api/ai/improve-copy', requestBody)

      const response = await fetch('/api/ai/improve-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      console.log('[useNodeAI] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[useNodeAI] API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('[useNodeAI] Success! Received data:', data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to improve copy'
      setError(errorMessage)
      console.error('[useNodeAI] Error improving copy:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [config, hasCapability])

  /**
   * Shorten text to fit limits
   */
  const shortenText = useCallback(async (
    text: string,
    targetLength: number,
    options?: {
      preserveMeaning?: boolean
      context?: {
        purpose?: string
        flowContext?: string
        existingButtons?: string[]
      }
    }
  ): Promise<ShortenTextResponse | null> => {
    if (!hasCapability('shorten')) {
      console.warn('[useNodeAI] shorten capability not enabled')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/ai/shorten-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          targetLength,
          nodeType: config.nodeType,
          platform: config.platform || 'web',
          preserveMeaning: options?.preserveMeaning ?? true,
          context: options?.context
        } as ShortenTextRequest)
      })

      if (!response.ok) {
        throw new Error('Failed to shorten text')
      }

      const data = await response.json()
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to shorten text'
      setError(errorMessage)
      console.error('[useNodeAI] Error shortening text:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [config, hasCapability])

  /**
   * Check if text exceeds limit and needs shortening
   */
  const needsShortening = useCallback((text: string, maxLength: number): boolean => {
    return text.length > maxLength
  }, [])

  /**
   * Generate button options based on context
   */
  const generateButtons = useCallback(async (
    questionContext: string,
    count: number,
    options?: {
      maxLength?: number
      existingButtons?: string[]
    }
  ): Promise<GenerateOptionsResponse | null> => {
    if (!hasCapability('generate-options')) {
      console.warn('[useNodeAI] generate-options capability not enabled')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const requestBody: GenerateOptionsRequest = {
        context: questionContext,
        count,
        type: 'button',
        platform: config.platform || 'web',
        maxLength: options?.maxLength,
        existingOptions: options?.existingButtons
      }

      console.log('[useNodeAI] Generating buttons:', requestBody)

      const response = await fetch('/api/ai/generate-buttons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      console.log('[useNodeAI] Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[useNodeAI] API error response:', errorText)
        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('[useNodeAI] Success! Generated buttons:', data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate buttons'
      setError(errorMessage)
      console.error('[useNodeAI] Error generating buttons:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [config, hasCapability])

  /**
   * Auto-improve and shorten if needed
   */
  const improveAndShortenIfNeeded = useCallback(async (
    text: string,
    field: string,
    maxLength?: number
  ): Promise<string> => {
    // First improve
    const improved = await improveCopy(text, field, { maxLength })
    if (!improved) return text

    let finalText = improved.improvedText

    // Check if we need to shorten
    if (maxLength && needsShortening(finalText, maxLength)) {
      const shortened = await shortenText(finalText, maxLength)
      if (shortened) {
        finalText = shortened.shortenedText
      }
    }

    return finalText
  }, [improveCopy, shortenText, needsShortening])

  return {
    // Tool functions
    improveCopy,
    shortenText,
    generateButtons,
    improveAndShortenIfNeeded,
    
    // Utilities
    hasCapability,
    needsShortening,
    
    // State
    loading,
    error,
    
    // Config
    capabilities: capabilities as any
  }
}

/**
 * Simpler hook for quick AI text improvements
 */
export function useAITextImprover(
  nodeType: string,
  platform: Platform
) {
  return useNodeAI({
    nodeType,
    platform,
    capabilities: ['improve-copy', 'shorten']
  })
}

/**
 * Hook for AI button generation and improvement
 */
export function useAIButtonGenerator(
  nodeType: string,
  platform: Platform
) {
  return useNodeAI({
    nodeType,
    platform,
    capabilities: ['generate-options', 'improve-copy', 'shorten']
  })
}

