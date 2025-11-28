import type { AITool, AIToolResult, ImproveCopyRequest, ImproveCopyResponse } from '@/types/ai'
import { getAIClient } from '../core/ai-client'
import { buildContextDescription, getPlatformGuidelines, getNodeTypeGuidelines, buildAIContext } from '../core/ai-context'

/**
 * Improve Copy Tool
 * Improves text quality while maintaining platform limits
 */
export const improveCopyTool: AITool<ImproveCopyRequest, ImproveCopyResponse> = {
  name: 'improve-copy',
  description: 'Improve text quality, clarity, and engagement',
  
  async execute(request: ImproveCopyRequest): Promise<AIToolResult<ImproveCopyResponse>> {
    const { text, nodeType, platform, field, maxLength, context } = request

    try {
      // Build AI context
      const aiContext = buildAIContext({
        nodeType,
        platform
      })

      // Build system prompt
      const systemPrompt = buildSystemPrompt(aiContext, field, maxLength)
      
      // Build user prompt
      const userPrompt = buildUserPrompt(text, context)

      // Call AI
      const aiClient = getAIClient()
      const response = await aiClient.generateJSON<{
        improvedText: string
        improvements: string[]
      }>({
        systemPrompt,
        userPrompt
      })

      // Return result
      return {
        success: true,
        data: {
          originalText: text,
          improvedText: response.improvedText,
          improvements: response.improvements || [],
          characterCount: response.improvedText.length
        }
      }
    } catch (error) {
      console.error('[Improve Copy Tool] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to improve copy'
      }
    }
  }
}

/**
 * Build system prompt for copy improvement
 */
function buildSystemPrompt(
  context: ReturnType<typeof buildAIContext>,
  field: string,
  maxLength?: number
): string {
  const contextDesc = buildContextDescription(context)
  const platformGuidelines = getPlatformGuidelines(context.platform)
  const nodeGuidelines = getNodeTypeGuidelines(context.nodeType)

  return `You are an expert copywriter specializing in conversational UI and ${context.platform} messaging.

CONTEXT:
${contextDesc}

PLATFORM GUIDELINES:
${platformGuidelines}

NODE TYPE:
${nodeGuidelines}

FIELD: ${field}
${maxLength ? `CHARACTER LIMIT: ${maxLength} characters (STRICT - must not exceed)` : ''}

YOUR TASK:
1. Improve the provided text for clarity, engagement, and effectiveness
2. Maintain the core message and intent
3. Apply platform-specific best practices
4. ${maxLength ? `Keep it under ${maxLength} characters` : 'Keep it concise'}
5. Use appropriate tone for the platform and context

IMPORTANT:
- Make the text more engaging and clear
- Fix any grammar or spelling issues
- Ensure it's appropriate for the ${context.platform} platform
- ${maxLength ? `DO NOT exceed ${maxLength} characters` : ''}

Respond with JSON in this format:
{
  "improvedText": "the improved text",
  "improvements": ["list", "of", "specific", "improvements", "made"]
}`
}

/**
 * Build user prompt
 */
function buildUserPrompt(
  text: string,
  context?: ImproveCopyRequest['context']
): string {
  const parts: string[] = []
  
  parts.push(`Original text: "${text}"`)
  
  if (context) {
    if (context.purpose) {
      parts.push(`Purpose: ${context.purpose}`)
    }
    if (context.flowContext) {
      parts.push(`Flow Context: ${context.flowContext}`)
    }
    if (context.previousNodes && context.previousNodes.length > 0) {
      parts.push(`Previous nodes: ${context.previousNodes.join(', ')}`)
    }
  }
  
  parts.push('\nPlease improve this text according to the guidelines.')
  
  return parts.join('\n')
}

