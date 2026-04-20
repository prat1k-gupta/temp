import { generateText, generateObject } from 'ai'
import { z } from 'zod'
import type { AIServiceConfig } from '@/types/ai'
import { getModel, DEFAULT_MODEL, type ModelId } from './models'

/**
 * AI Client - Wrapper around Vercel AI SDK
 * Provides a simple interface for making AI calls
 */
export class AIClient {
  private config: AIServiceConfig

  constructor(config?: Partial<AIServiceConfig>) {
    this.config = {
      provider: 'openai',
      model: 'gpt-4o',
      maxTokens: 1000,
      temperature: 0.9,
      ...config
    }
  }

  /**
   * Generate text using AI
   */
  async generate(params: {
    systemPrompt: string
    userPrompt: string
    temperature?: number
    maxTokens?: number
    model?: ModelId
  }): Promise<{
    text: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }> {
    const startTime = Date.now()
    const modelId = params.model || DEFAULT_MODEL

    try {
      const response = await generateText({
        model: getModel(modelId),
        system: params.systemPrompt,
        prompt: params.userPrompt,
        temperature: params.temperature ?? this.config.temperature,
      })

      const duration = Date.now() - startTime
      console.log(`[AI Client] ${modelId} — Generated text in ${duration}ms`)

      return {
        text: response.text,
        usage: response.usage ? {
          promptTokens: (response.usage as any).promptTokens ?? 0,
          completionTokens: (response.usage as any).completionTokens ?? 0,
          totalTokens: response.usage.totalTokens ?? 0,
        } : undefined
      }
    } catch (error) {
      console.error(`[AI Client] ${modelId} — Error generating text:`, error)
      throw error
    }
  }

  /**
   * Extract JSON from text, handling markdown code blocks
   */
  extractJSON(text: string): string | null {
    // First, try to find JSON in markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*```/)
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim()
    }

    // Try to find JSON object or array directly
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (jsonMatch) {
      return jsonMatch[1].trim()
    }

    return null
  }

  /**
   * Generate structured JSON output
   * Uses structured outputs when schema is provided, falls back to text generation with JSON extraction
   */
  async generateJSON<T = any>(params: {
    systemPrompt: string
    userPrompt: string
    schema?: z.ZodSchema<T>
    model?: ModelId
  }): Promise<T> {
    const startTime = Date.now()
    const modelId = params.model || DEFAULT_MODEL

    try {
      // If schema is provided, try structured outputs first, fall back to text + parse
      if (params.schema) {
        try {
          const response = await generateObject({
            model: getModel(modelId),
            schema: params.schema,
            system: params.systemPrompt,
            prompt: params.userPrompt,
            temperature: 0.3,
          })

          const duration = Date.now() - startTime
          console.log(`[AI Client] ${modelId} — Generated structured JSON in ${duration}ms`)

          return response.object as T
        } catch (structuredError) {
          console.warn(`[AI Client] ${modelId} — Structured output failed, falling back to text generation:`, structuredError instanceof Error ? structuredError.message : structuredError)
          // Fall through to text generation below
        }
      }

      // Text generation with strict JSON instructions (also used as fallback when structured output fails)
      const enhancedSystemPrompt = `${params.systemPrompt}

**CRITICAL JSON FORMATTING RULES:**
- You MUST respond with ONLY valid JSON
- Do NOT wrap the JSON in markdown code blocks (no \`\`\`json or \`\`\`)
- Do NOT add any text before or after the JSON
- Do NOT include explanations or comments
- Start directly with { or [ and end with } or ]
- The response must be parseable JSON only

Example of CORRECT format:
{"key": "value"}

Example of WRONG format:
\`\`\`json
{"key": "value"}
\`\`\`

Respond with raw JSON only.`

      const response = await this.generate({
        systemPrompt: enhancedSystemPrompt,
        userPrompt: params.userPrompt,
        temperature: 0.3, // Lower temperature for more consistent JSON
        model: modelId,
      })

      // Try to extract JSON from the response
      let jsonText = response.text.trim()

      // Remove markdown code blocks if present
      const extracted = this.extractJSON(jsonText)
      if (extracted) {
        jsonText = extracted
      }

      // Try to parse the JSON (and validate against schema if provided)
      let raw: unknown
      try {
        raw = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('[AI Client] Failed to parse JSON response:', jsonText)
        console.error('[AI Client] Parse error:', parseError)
        throw new Error(`AI returned non-JSON text. Response starts: ${jsonText.substring(0, 200)}...`)
      }
      try {
        const parsed = params.schema ? params.schema.parse(raw) as T : raw as T
        const duration = Date.now() - startTime
        console.log(`[AI Client] ${modelId} — Generated JSON in ${duration}ms`)
        return parsed
      } catch (schemaError) {
        console.error('[AI Client] Schema validation failed on AI response:', raw)
        if (schemaError instanceof z.ZodError) {
          const issues = schemaError.issues
            .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
            .slice(0, 5)
            .join("; ")
          throw new Error(`AI response didn't match expected schema — ${issues}`)
        }
        throw schemaError
      }
    } catch (error) {
      console.error(`[AI Client] ${modelId} — Error generating JSON:`, error)
      throw error
    }
  }

}

// Singleton instance
let aiClientInstance: AIClient | null = null

/**
 * Get or create AI client instance
 */
export function getAIClient(config?: Partial<AIServiceConfig>): AIClient {
  if (!aiClientInstance) {
    aiClientInstance = new AIClient(config)
  }
  return aiClientInstance
}
