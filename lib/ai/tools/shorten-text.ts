import type { AITool, AIToolResult, ShortenTextRequest, ShortenTextResponse } from '@/types/ai'
import { getAIClient } from '../core/ai-client'
import { buildAIContext, getPlatformGuidelines, getNodeTypeGuidelines, getNodeDocumentationForPrompt } from '../core/ai-context'
import { z } from 'zod'

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
      let userPrompt = `Text to shorten: "${text}"\n\nTarget length: ${targetLength} characters (STRICT LIMIT - must not exceed)`
      
      if (context?.flowContext) {
        userPrompt += `\n\nFlow Context: "${context.flowContext}"`
      }
      
      if (context?.purpose) {
        userPrompt += `\n\nPurpose: ${context.purpose}`
      }
      
      if (context?.existingButtons && context.existingButtons.length > 0) {
        userPrompt += `\n\nOther buttons/options in this flow: ${context.existingButtons.join(', ')}`
        userPrompt += `\n\nIMPORTANT: Make sure the shortened text is distinct from the other buttons/options.`
      }
      
      userPrompt += `\n\nPlease shorten this text while preserving the core meaning and ensuring it fits within ${targetLength} characters.`

      // Define Zod schema for structured output
      const responseSchema = z.object({
        shortenedText: z.string().describe(`Shortened text (max ${targetLength} characters, STRICT LIMIT)`)
      })

      // Call AI with structured output schema
      const aiClient = getAIClient()
      const response = await aiClient.generateJSON<{
        shortenedText: string
      }>({
        systemPrompt,
        userPrompt,
        schema: responseSchema
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
  const nodeGuidelines = getNodeTypeGuidelines(context.nodeType, context.platform)
  const purposeText = additionalContext?.purpose ? ` for ${additionalContext.purpose}` : ''

  // Get relevant node documentation if nodeType is provided
  let nodeDocs = ''
  if (context.nodeType) {
    nodeDocs = getNodeDocumentationForPrompt(context.platform, [context.nodeType])
  }

  return `You are an expert editor specializing in concise ${context.platform} messaging.

PLATFORM GUIDELINES:
${platformGuidelines}

NODE CONTEXT:
${nodeGuidelines}
${nodeDocs ? `\n\nNODE DOCUMENTATION:\n${nodeDocs}` : ''}

YOUR TASK:
Shorten the provided text${purposeText} to fit within ${targetLength} characters (STRICT LIMIT).

REQUIREMENTS:
${preserveMeaning ? '- Preserve the core message and meaning' : '- Focus on fitting the character limit'}
- Remove unnecessary words and filler
- Use concise phrasing
- Maintain clarity
- Keep the tone appropriate for ${context.platform}
- MUST be ${targetLength} characters or less (STRICT - cannot exceed)
${additionalContext?.existingButtons && additionalContext.existingButtons.length > 0 ? '- Ensure the shortened text is distinct from other button/option text' : ''}
${additionalContext?.flowContext ? `- Consider the flow context: "${additionalContext.flowContext}"` : ''}

TECHNIQUES:
- Remove redundant words
- Use contractions where appropriate
- Replace phrases with shorter alternatives
- Remove unnecessary adjectives/adverbs
- Keep only essential information
- Use abbreviations if appropriate for the platform

${additionalContext?.existingButtons && additionalContext.existingButtons.length > 0 ? `
IMPORTANT:
- Avoid duplicating or being too similar to these existing buttons/options: ${additionalContext.existingButtons.join(', ')}
- Maintain variety and distinction from other options
` : ''}

**OUTPUT FORMAT:**
Return a JSON object with:
- "shortenedText": The shortened text (max ${targetLength} characters, STRICT LIMIT - cannot exceed)

**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`
}

