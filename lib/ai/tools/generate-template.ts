import { getAIClient } from '../core/ai-client'
import { z } from 'zod'
import { TEMPLATE_LIMITS, CATEGORY_VALUES } from '@/constants/template'

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
  sampleValues: Record<string, string>
}

// Note: headerType is constrained to "none" | "text" — the AI can't upload
// media, so media headers must be added by the user after generation.
const responseSchema = z.object({
  category: z.enum(CATEGORY_VALUES as unknown as [string, ...string[]]).describe("Template category"),
  headerType: z.enum(["none", "text"]).describe("Header type"),
  headerContent: z.string().describe(`Header text (max ${TEMPLATE_LIMITS.headerTextMax} chars, empty if headerType is none, no emoji)`),
  bodyContent: z.string().describe(`Template body text with named variables like {{customer_name}}, {{order_id}} (max ${TEMPLATE_LIMITS.bodyMax} chars)`),
  footerContent: z.string().describe(`Footer text (max ${TEMPLATE_LIMITS.footerMax} chars, can be empty, no variables allowed)`),
  buttons: z.array(z.object({
    type: z.enum(["quick_reply", "url", "phone_number"]).describe(`Button type — must be exactly one of these strings: "quick_reply" (NOT "reply"), "url" (NOT "link"), "phone_number" (NOT "phone")`),
    text: z.string().describe(`Button text (max ${TEMPLATE_LIMITS.buttonTextMax} chars)`),
    url: z.string().optional().describe("URL for url type buttons (https://...)"),
    phone_number: z.string().optional().describe("Phone number for phone_number type buttons, E.164 format with country code (e.g. +14155551234)"),
  })).max(TEMPLATE_LIMITS.totalButtonsMax, `Max ${TEMPLATE_LIMITS.totalButtonsMax} buttons total`).describe(`Template buttons (0-3 recommended, max ${TEMPLATE_LIMITS.totalButtonsMax}). Quick-reply and CTA (url/phone_number) buttons must be grouped, not interleaved.`),
  sampleValues: z.record(z.string(), z.string()).describe("Realistic sample value for every {{variable}} used in body or header, keyed by the variable name. Required so the template can be published without a second AI round-trip."),
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
- Body: max ${TEMPLATE_LIMITS.bodyMax} characters
- Header text: max ${TEMPLATE_LIMITS.headerTextMax} characters, no emoji, max 1 variable, no newlines
- Footer text: max ${TEMPLATE_LIMITS.footerMax} characters, no {{variables}}
- Button text: max ${TEMPLATE_LIMITS.buttonTextMax} characters
- Quick reply buttons: max ${TEMPLATE_LIMITS.quickReplyMax}
- URL buttons: max ${TEMPLATE_LIMITS.urlButtonMax}, phone buttons: max ${TEMPLATE_LIMITS.phoneButtonMax}
- Quick-reply and CTA (URL/phone) buttons must be grouped, not interleaved
- Use named variables only ({{customer_name}}), never mix with positional ({{1}})

For every {{variable}} you emit in body or header, include a realistic sampleValues entry keyed by the variable name. Without samples, Meta rejects the template on publish.

For MARKETING templates: use engaging language, clear CTA
For UTILITY templates: be direct and informational
For AUTHENTICATION templates: simple, clear verification message

RESPONSE SHAPE — you MUST return a flat JSON object with these exact top-level keys. Do NOT use Meta's nested wire format (no "header": {"type", "text"}, no "body": {"text"}, no "name", no "language"):

{
  "category": "MARKETING",
  "headerType": "text",
  "headerContent": "Order update for {{customer_name}}",
  "bodyContent": "Hi {{customer_name}}, your order {{order_id}} is confirmed.",
  "footerContent": "Thanks for shopping with us",
  "buttons": [
    { "type": "quick_reply", "text": "Track Order" },
    { "type": "url", "text": "Visit Site", "url": "https://example.com" },
    { "type": "phone_number", "text": "Call Us", "phone_number": "+14155551234" }
  ],
  "sampleValues": { "customer_name": "John", "order_id": "ORD-123" }
}

"headerType" is "none" or "text" only. If "headerType" is "none", "headerContent" must be "".`

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
