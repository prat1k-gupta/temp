import { getAIClient } from '../core/ai-client'
import { z } from 'zod'

export interface GenerateTemplateRequest {
  mode: "generate" | "improve"
  description: string
  currentBody?: string
  category?: string
}

export interface GenerateTemplateResponse {
  category: string
  headerType: string
  headerContent: string
  bodyContent: string
  footerContent: string
  buttons: Array<{ type: string; text: string; url?: string; phone_number?: string }>
}

const responseSchema = z.object({
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).describe("Template category"),
  headerType: z.enum(["none", "text"]).describe("Header type"),
  headerContent: z.string().describe("Header text (max 60 chars, empty if headerType is none)"),
  bodyContent: z.string().describe("Template body text with named variables like {{customer_name}}, {{order_id}} (max 1024 chars)"),
  footerContent: z.string().describe("Footer text (max 60 chars, can be empty)"),
  buttons: z.array(z.object({
    type: z.enum(["quick_reply", "url", "phone_number"]).describe("Button type"),
    text: z.string().describe("Button text (max 25 chars)"),
    url: z.string().optional().describe("URL for url type buttons"),
    phone_number: z.string().optional().describe("Phone number for phone_number type buttons"),
  })).describe("Template buttons (0-3 recommended)"),
})

export async function generateTemplate(request: GenerateTemplateRequest): Promise<GenerateTemplateResponse> {
  const aiClient = getAIClient()

  const systemPrompt = `You are an expert WhatsApp Business template designer. You create templates that:
- Follow Meta's WhatsApp Business API guidelines
- Are clear, concise, and professional
- Use descriptive named variables like {{customer_name}}, {{order_id}}, {{delivery_date}} for dynamic content (NOT numbered {{1}}, {{2}})
- Are likely to get approved by Meta's review process
- Have engaging but not spammy copy

Template constraints:
- Body: max 1024 characters
- Header text: max 60 characters
- Footer text: max 60 characters
- Button text: max 25 characters
- Quick reply buttons: max 3
- URL/phone buttons: max 2

For MARKETING templates: use engaging language, clear CTA
For UTILITY templates: be direct and informational
For AUTHENTICATION templates: simple, clear verification message`

  const userPrompt = request.mode === "improve"
    ? `Improve this WhatsApp template body for better clarity, engagement, and Meta compliance. Keep the same intent and variables but make it better.

Current body: ${request.currentBody}
Category: ${request.category || "MARKETING"}

Return the improved template.`
    : `Create a WhatsApp message template for: ${request.description}
${request.category ? `Preferred category: ${request.category}` : ""}

Create a professional, Meta-compliant template with appropriate header, body with variables, footer, and buttons.`

  const result = await aiClient.generateJSON<GenerateTemplateResponse>({
    systemPrompt,
    userPrompt,
    schema: responseSchema,
    model: "claude-haiku",
  })

  return result
}
