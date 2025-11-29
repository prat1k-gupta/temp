import type { AITool, AIToolResult, ImproveCopyRequest, ImproveCopyResponse } from '@/types/ai'
import { getAIClient } from '../core/ai-client'
import { buildContextDescription, getPlatformGuidelines, getNodeTypeGuidelines, buildAIContext, getNodeDocumentationForPrompt } from '../core/ai-context'
import { z } from 'zod'

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

      // Define Zod schema for structured output
      const responseSchema = z.object({
        improvedText: z.string().describe(`Improved text${maxLength ? ` (max ${maxLength} characters, STRICT LIMIT)` : ''}`),
        improvements: z.array(z.string()).describe('List of specific improvements made to the text')
      })

      // Call AI with structured output schema
      const aiClient = getAIClient()
      const response = await aiClient.generateJSON<{
        improvedText: string
        improvements: string[]
      }>({
        systemPrompt,
        userPrompt,
        schema: responseSchema
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
  const nodeGuidelines = getNodeTypeGuidelines(context.nodeType, context.platform)
  
  // Get relevant node documentation
  let nodeDocs = ''
  if (context.nodeType) {
    nodeDocs = getNodeDocumentationForPrompt(context.platform, [context.nodeType])
  }

  return `You are an expert copywriter specializing in conversational UI and ${context.platform} messaging.

CONTEXT:
${contextDesc}

PLATFORM GUIDELINES:
${platformGuidelines}

NODE TYPE:
${nodeGuidelines}
${nodeDocs ? `\n\nNODE DOCUMENTATION:\n${nodeDocs}` : ''}

FIELD: ${field}
${maxLength ? `CHARACTER LIMIT: ${maxLength} characters (STRICT - must not exceed)` : ''}

YOUR TASK:
1. Improve the provided text for clarity, engagement, and effectiveness
2. Maintain the core message and intent
3. Apply platform-specific best practices
4. ${maxLength ? `Keep it under ${maxLength} characters (STRICT LIMIT)` : 'Keep it concise'}
5. Use appropriate tone for the platform and context
6. Follow the node type guidelines and best practices

IMPORTANT:
- Make the text more engaging and clear
- Fix any grammar or spelling issues
- Ensure it's appropriate for the ${context.platform} platform
- ${maxLength ? `DO NOT exceed ${maxLength} characters (STRICT LIMIT)` : ''}
- Consider the flow context and purpose
- Apply best practices from the node documentation

**OUTPUT FORMAT:**
Return a JSON object with:
- "improvedText": The improved text${maxLength ? ` (max ${maxLength} chars, STRICT LIMIT)` : ''}
- "improvements": Array of strings describing specific improvements made

**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`
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
      parts.push(`\nPurpose: ${context.purpose}`)
    }
    if (context.flowContext) {
      parts.push(`\nFlow Context: ${context.flowContext}`)
    }
    if (context.previousNodes && context.previousNodes.length > 0) {
      parts.push(`\nPrevious nodes in flow: ${context.previousNodes.join(', ')}`)
      parts.push(`Consider how this text fits with the flow context.`)
    }
  }
  
  parts.push('\nPlease improve this text according to the guidelines, maintaining the core message while making it more engaging and effective.')
  
  return parts.join('\n')
}

