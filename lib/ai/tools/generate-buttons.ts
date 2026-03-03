import type { AITool, AIToolResult, GenerateOptionsRequest, GenerateOptionsResponse } from '@/types/ai'
import { getAIClient } from '../core/ai-client'
import { buildAIContext, getPlatformGuidelines, getNodeDocumentationForPrompt, getNodeTypeGuidelines } from '../core/ai-context'
import { z } from 'zod'

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

      // Define Zod schema for structured output
      const buttonOptionSchema = z.object({
        label: z.string().describe('Button text (concise and action-oriented)'),
        value: z.string().optional().describe('Button value (auto-generated from label if not provided)'),
        description: z.string().optional().describe('What this option does')
      })

      const responseSchema = z.object({
        options: z.array(buttonOptionSchema).describe(`Array of exactly ${count} button options`)
      })

      // Call AI with structured output schema
      const aiClient = getAIClient()
      const response = await aiClient.generateJSON<{
        options: Array<{
          label: string
          value?: string
          description?: string
        }>
      }>({
        systemPrompt,
        userPrompt,
        schema: responseSchema,
        model: 'claude-haiku',
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
  const nodeGuidelines = getNodeTypeGuidelines(context.nodeType, context.platform)
  
  // Get relevant node documentation for quick reply nodes
  const nodeDocs = getNodeDocumentationForPrompt(context.platform, ['quickReply', 'webQuickReply', 'whatsappQuickReply', 'instagramQuickReply'])
  
  const existingText = existingOptions && existingOptions.length > 0 
    ? `\n\nEXISTING OPTIONS (don't duplicate): ${existingOptions.join(', ')}`
    : ''

  return `You are an expert UX designer specializing in conversational UI for ${context.platform}.

PLATFORM GUIDELINES:
${platformGuidelines}

NODE CONTEXT:
${nodeGuidelines}

BUTTON NODE DOCUMENTATION:
${nodeDocs}

YOUR TASK:
Generate ${count} button options that are:
1. Relevant to the question/context
2. Clear and actionable
3. Concise and easy to tap/click
4. Appropriate for ${context.platform}
${maxLength ? `5. Max ${maxLength} characters per button (STRICT LIMIT)` : ''}
6. Cover the most common/useful responses
${existingText}

BUTTON BEST PRACTICES:
- Use action verbs (Yes, No, Continue, Skip, etc.)
- Keep it short and scannable
- Make options mutually exclusive when possible
- Order by importance/frequency
- Use sentence case (not ALL CAPS)
- Follow platform-specific character limits strictly

${context.platform === 'whatsapp' ? '- WhatsApp users expect quick, clear choices (max 20 chars per button)' : ''}
${context.platform === 'instagram' ? '- Instagram users prefer casual, engaging options' : ''}
${context.platform === 'web' ? '- Web users appreciate clear, professional options' : ''}

**OUTPUT FORMAT:**
You must return a JSON object with exactly ${count} options in the "options" array. Each option must have:
- "label": Button text (${maxLength ? `max ${maxLength} chars, STRICT LIMIT` : 'concise'})
- "value": Optional button value (will be auto-generated if not provided)
- "description": Optional description of what this option does

**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`
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

Focus on common, practical choices that users would actually select. Make sure the options are:
- Relevant to the context
- Mutually exclusive when possible
- Action-oriented and clear
- Appropriate for the platform`
}

