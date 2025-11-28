import type { AITool, AIToolResult, GenerateOptionsRequest, GenerateOptionsResponse } from '@/types/ai'
import { getAIClient } from '../core/ai-client'
import { buildAIContext, getPlatformGuidelines } from '../core/ai-context'

/**
 * Generate Buttons Tool
 * Generates button options based on question context
 */
export const generateButtonsTool: AITool<GenerateOptionsRequest, GenerateOptionsResponse> = {
  name: 'generate-options',
  description: 'Generate button options based on context',
  
  async execute(request: GenerateOptionsRequest): Promise<AIToolResult<GenerateOptionsResponse>> {
    const { context, count, type, maxLength, platform, existingOptions } = request

    try {
      // Build AI context
      const aiContext = buildAIContext({
        nodeType: type === 'button' ? 'quickReply' : 'list',
        platform
      })

      // Build system prompt
      const systemPrompt = buildSystemPrompt(aiContext, count, maxLength, existingOptions)
      
      // Build user prompt
      const userPrompt = buildUserPrompt(context, count, type)

      // Call AI
      const aiClient = getAIClient()
      const response = await aiClient.generateJSON<{
        options: Array<{
          label: string
          value?: string
          description?: string
        }>
      }>({
        systemPrompt,
        userPrompt
      })

      // Validate and return
      const validatedOptions = response.options.slice(0, count).map(opt => ({
        label: maxLength ? opt.label.slice(0, maxLength) : opt.label,
        value: opt.value || opt.label.toLowerCase().replace(/\s+/g, '_'),
        description: opt.description
      }))

      return {
        success: true,
        data: {
          options: validatedOptions
        }
      }
    } catch (error) {
      console.error('[Generate Buttons Tool] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate options'
      }
    }
  }
}

/**
 * Build system prompt for button generation
 */
function buildSystemPrompt(
  context: ReturnType<typeof buildAIContext>,
  count: number,
  maxLength?: number,
  existingOptions?: string[]
): string {
  const platformGuidelines = getPlatformGuidelines(context.platform)
  const existingText = existingOptions && existingOptions.length > 0 
    ? `\nEXISTING OPTIONS (don't duplicate): ${existingOptions.join(', ')}`
    : ''

  return `You are an expert UX designer specializing in conversational UI for ${context.platform}.

PLATFORM GUIDELINES:
${platformGuidelines}

YOUR TASK:
Generate ${count} button options that are:
1. Relevant to the question/context
2. Clear and actionable
3. Concise and easy to tap/click
4. Appropriate for ${context.platform}
${maxLength ? `5. Max ${maxLength} characters per button` : ''}
6. Cover the most common/useful responses
${existingText}

BUTTON BEST PRACTICES:
- Use action verbs (Yes, No, Continue, Skip, etc.)
- Keep it short and scannable
- Make options mutually exclusive when possible
- Order by importance/frequency
- Use sentence case (not ALL CAPS)

${context.platform === 'whatsapp' ? '- WhatsApp users expect quick, clear choices' : ''}
${context.platform === 'instagram' ? '- Instagram users prefer casual, engaging options' : ''}
${context.platform === 'web' ? '- Web users appreciate clear, professional options' : ''}

Respond with JSON in this format:
{
  "options": [
    {
      "label": "Button text (${maxLength ? `max ${maxLength} chars` : 'concise'})",
      "value": "button_value",
      "description": "Optional: What this option does"
    }
  ]
}`
}

/**
 * Build user prompt
 */
function buildUserPrompt(
  context: string,
  count: number,
  type: 'button' | 'list'
): string {
  return `Question/Context: "${context}"

Generate ${count} ${type === 'button' ? 'button' : 'list'} options that would be the most useful responses to this question.

Focus on common, practical choices that users would actually select.`
}

