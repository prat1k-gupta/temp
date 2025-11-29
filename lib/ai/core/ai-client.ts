import { generateText, generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import type { AIServiceConfig } from '@/types/ai'

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
  }): Promise<{
    text: string
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }> {
    const startTime = Date.now()

    try {
      const response = await generateText({
        model: openai(this.config.model!),
        system: params.systemPrompt,
        prompt: params.userPrompt,
        temperature: params.temperature ?? this.config.temperature,
      })

      const duration = Date.now() - startTime
      console.log(`[AI Client] Generated text in ${duration}ms`)

      return {
        text: response.text,
        usage: response.usage ? {
          promptTokens: (response.usage as any).promptTokens ?? 0,
          completionTokens: (response.usage as any).completionTokens ?? 0,
          totalTokens: response.usage.totalTokens ?? 0,
        } : undefined
      }
    } catch (error) {
      console.error('[AI Client] Error generating text:', error)
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
  }): Promise<T> {
    const startTime = Date.now()

    try {
      // If schema is provided, use structured outputs (more reliable)
      if (params.schema) {
        const response = await generateObject({
          model: openai(this.config.model!),
          schema: params.schema,
          system: params.systemPrompt,
          prompt: params.userPrompt,
          temperature: 0.3, // Lower temperature for more consistent JSON
        })

        const duration = Date.now() - startTime
        console.log(`[AI Client] Generated structured JSON in ${duration}ms`)

        return response.object as T
      }

      // Fallback to text generation with strict JSON instructions
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
      })

      // Try to extract JSON from the response
      let jsonText = response.text.trim()

      // Remove markdown code blocks if present
      const extracted = this.extractJSON(jsonText)
      if (extracted) {
        jsonText = extracted
      }

      // Try to parse the JSON
      try {
        const parsed = JSON.parse(jsonText) as T
        const duration = Date.now() - startTime
        console.log(`[AI Client] Generated JSON in ${duration}ms`)
        return parsed
      } catch (parseError) {
        console.error('[AI Client] Failed to parse JSON response:', jsonText)
        console.error('[AI Client] Parse error:', parseError)
        throw new Error(`Invalid JSON response from AI. Response: ${jsonText.substring(0, 200)}...`)
      }
    } catch (error) {
      console.error('[AI Client] Error generating JSON:', error)
      throw error
    }
  }

  /**
   * Stream text generation (for future use)
   */
  async *generateStream(params: {
    systemPrompt: string
    userPrompt: string
  }): AsyncGenerator<string> {
    // TODO: Implement streaming when needed
    const response = await this.generate(params)
    yield response.text
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

