import type { AITool, AIToolResult, ShortenTextRequest, ShortenTextResponse } from '@/types/ai'
import { getAIClient } from '../core/ai-client'
import { buildAIContext, getPlatformGuidelines } from '../core/ai-context'

/**
 * Shorten Text Tool
 * Reduces text length while preserving meaning
 */
export const shortenTextTool: AITool<ShortenTextRequest, ShortenTextResponse> = {
  name: 'shorten',
  description: 'Shorten text to fit within character limits',
  
  async execute(request: ShortenTextRequest): Promise<AIToolResult<ShortenTextResponse>> {
    const { text, targetLength, nodeType, platform, preserveMeaning = true, context } = request

    try {
      // Build AI context
      const aiContext = buildAIContext({
        nodeType,
        platform
      })

      // Build system prompt
      const systemPrompt = buildSystemPrompt(aiContext, targetLength, preserveMeaning, context)
      
      // Build user prompt with context
      let userPrompt = `Text to shorten: "${text}"\n\nTarget length: ${targetLength} characters`
      
      if (context?.flowContext) {
        userPrompt += `\n\nQuestion/Context: "${context.flowContext}"`
      }
      
      if (context?.existingButtons && context.existingButtons.length > 0) {
        userPrompt += `\n\nOther buttons in this flow: ${context.existingButtons.join(', ')}`
        userPrompt += `\n\nMake sure the shortened text is distinct from the other buttons.`
      }
      
      userPrompt += `\n\nPlease shorten this text.`

      // Call AI
      const aiClient = getAIClient()
      const response = await aiClient.generateJSON<{
        shortenedText: string
      }>({
        systemPrompt,
        userPrompt
      })

      const originalLength = text.length
      const newLength = response.shortenedText.length
      const reduction = originalLength - newLength

      // Return result
      return {
        success: true,
        data: {
          originalText: text,
          shortenedText: response.shortenedText,
          originalLength,
          newLength,
          reduction
        }
      }
    } catch (error) {
      console.error('[Shorten Text Tool] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to shorten text'
      }
    }
  }
}

/**
 * Build system prompt for text shortening
 */
function buildSystemPrompt(
  context: ReturnType<typeof buildAIContext>,
  targetLength: number,
  preserveMeaning: boolean,
  additionalContext?: {
    purpose?: string
    flowContext?: string
    existingButtons?: string[]
  }
): string {
  const platformGuidelines = getPlatformGuidelines(context.platform)
  const purposeText = additionalContext?.purpose ? ` for ${additionalContext.purpose}` : ''

  return `You are an expert editor specializing in concise ${context.platform} messaging.

PLATFORM GUIDELINES:
${platformGuidelines}

YOUR TASK:
Shorten the provided text${purposeText} to fit within ${targetLength} characters.

REQUIREMENTS:
${preserveMeaning ? '- Preserve the core message and meaning' : '- Focus on fitting the character limit'}
- Remove unnecessary words and filler
- Use concise phrasing
- Maintain clarity
- Keep the tone appropriate for ${context.platform}
- MUST be ${targetLength} characters or less
${additionalContext?.existingButtons && additionalContext.existingButtons.length > 0 ? '- Ensure the shortened text is distinct from other button options' : ''}

TECHNIQUES:
- Remove redundant words
- Use contractions where appropriate
- Replace phrases with shorter alternatives
- Remove unnecessary adjectives/adverbs
- Keep only essential information

${additionalContext?.existingButtons && additionalContext.existingButtons.length > 0 ? `
IMPORTANT:
- Avoid duplicating or being too similar to these existing buttons
- Maintain variety and distinction from other options
` : ''}

Respond with JSON in this format:
{
  "shortenedText": "the shortened text (max ${targetLength} chars)"
}`
}

