import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
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
   * Generate structured JSON output
   */
  async generateJSON<T = any>(params: {
    systemPrompt: string
    userPrompt: string
    schema?: any
  }): Promise<T> {
    const response = await this.generate({
      systemPrompt: params.systemPrompt + '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, just raw JSON.',
      userPrompt: params.userPrompt,
      temperature: 0.3, // Lower temperature for more consistent JSON
    })

    try {
      return JSON.parse(response.text) as T
    } catch (error) {
      console.error('[AI Client] Failed to parse JSON response:', response.text)
      throw new Error('Invalid JSON response from AI')
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

