import { z } from "zod"
import { extractTemplateVariables } from "@/utils/template-helpers"
import {
  LANGUAGE_CODES,
  CATEGORY_VALUES,
  HEADER_TYPE_VALUES,
  BUTTON_TYPE_VALUES,
  TEMPLATE_LIMITS,
} from "@/constants/template"

// Meta rejects Extended_Pictographic in headers.
const EMOJI_REGEX = /\p{Extended_Pictographic}/u
const E164_REGEX = /^\+[1-9]\d{6,14}$/

export const TemplateButtonSchema = z.object({
  type: z.enum(BUTTON_TYPE_VALUES as unknown as [string, ...string[]]),
  text: z.string().min(1, "Button text is required").max(TEMPLATE_LIMITS.buttonTextMax, `Button text max ${TEMPLATE_LIMITS.buttonTextMax} chars`),
  url: z.string().optional(),
  phone_number: z.string().optional(),
  example: z.string().optional(),
  example_code: z.string().optional(),
}).superRefine((btn, ctx) => {
  if (btn.type === "url") {
    if (!btn.url || !/^https?:\/\//.test(btn.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL must start with http:// or https://",
        path: ["url"],
      })
    }
    if (btn.url && btn.url.includes("{{") && (!btn.example || !btn.example.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Example value required for URL with {{variable}}",
        path: ["example"],
      })
    }
  }
  if (btn.type === "phone_number" && (!btn.phone_number || !E164_REGEX.test(btn.phone_number))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Phone must be E.164 format (e.g. +14155551234)",
      path: ["phone_number"],
    })
  }
  if (btn.type === "copy_code" && (!btn.example_code || !btn.example_code.trim())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Copy-code button needs an example code",
      path: ["example_code"],
    })
  }
})

export const TemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string()
    .min(1, "Template name is required")
    .max(TEMPLATE_LIMITS.nameMax, `Template name max ${TEMPLATE_LIMITS.nameMax} chars`)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, and underscores only")
    .refine((n) => !n.startsWith("_") && !n.endsWith("_"), "Name cannot start or end with underscore"),
  display_name: z.string().min(1, "Display name is required").max(TEMPLATE_LIMITS.displayNameMax),
  whatsapp_account: z.string().min(1, "Select a WhatsApp account"),
  language: z.enum(LANGUAGE_CODES as unknown as [string, ...string[]]),
  category: z.enum(CATEGORY_VALUES as unknown as [string, ...string[]]),
  header_type: z.enum(HEADER_TYPE_VALUES as unknown as [string, ...string[]]),
  header_content: z.string(),
  body: z.string().min(1, "Body is required").max(TEMPLATE_LIMITS.bodyMax, `Body max ${TEMPLATE_LIMITS.bodyMax} chars`),
  footer: z.string().max(TEMPLATE_LIMITS.footerMax, `Footer max ${TEMPLATE_LIMITS.footerMax} chars`),
  buttons: z.array(TemplateButtonSchema).max(TEMPLATE_LIMITS.totalButtonsMax, `Max ${TEMPLATE_LIMITS.totalButtonsMax} buttons`),
  sample_values: z.record(z.string(), z.string()),
  status: z.string().optional(),
  rejection_reason: z.string().optional(),
}).superRefine((data, ctx) => {
  // --- Header rules ---
  if (data.header_type === "text") {
    const h = data.header_content
    if (!h || !h.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Header text is required when header type is Text", path: ["header_content"] })
    } else {
      if (h.length > TEMPLATE_LIMITS.headerTextMax) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Header text max ${TEMPLATE_LIMITS.headerTextMax} chars`, path: ["header_content"] })
      }
      if (EMOJI_REGEX.test(h)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Meta rejects emoji in header text", path: ["header_content"] })
      }
      if (/[\r\n]/.test(h)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Header text cannot contain line breaks", path: ["header_content"] })
      }
      if (extractTemplateVariables(h).length > TEMPLATE_LIMITS.headerVariablesMax) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Header supports at most ${TEMPLATE_LIMITS.headerVariablesMax} variable`, path: ["header_content"] })
      }
    }
  } else if (data.header_type !== "none") {
    if (!data.header_content) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Upload a ${data.header_type} sample for the header`,
        path: ["header_content"],
      })
    }
  }

  // --- Variable grammar: cannot mix named and positional ---
  const bodyVars = extractTemplateVariables(data.body)
  const headerVars = data.header_type === "text" ? extractTemplateVariables(data.header_content) : []
  const allVars = [...new Set([...bodyVars, ...headerVars])]
  const hasNamed = allVars.some((v) => /^[a-zA-Z_]/.test(v))
  const hasPositional = allVars.some((v) => /^\d+$/.test(v))
  if (hasNamed && hasPositional) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cannot mix named {{name}} and positional {{1}} variables in the same template",
      path: ["body"],
    })
  }

  // --- Positional must be 1..N sequential ---
  if (hasPositional && !hasNamed) {
    const nums = allVars.map((v) => parseInt(v, 10)).sort((a, b) => a - b)
    const expected = nums.map((_, i) => i + 1)
    if (JSON.stringify(nums) !== JSON.stringify(expected)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Positional variables must be sequential from {{1}} — no gaps",
        path: ["body"],
      })
    }
  }

  // --- Every variable needs a non-empty sample ---
  for (const v of allVars) {
    const sv = data.sample_values[v]
    if (!sv || !sv.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Sample value for {{${v}}} is required`,
        path: ["sample_values", v],
      })
    }
  }

  // --- Footer can't have variables ---
  if (extractTemplateVariables(data.footer).length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Footer cannot contain {{variables}}",
      path: ["footer"],
    })
  }

  // --- Button-type counts ---
  const counts = data.buttons.reduce<Record<string, number>>((acc, b) => {
    acc[b.type] = (acc[b.type] || 0) + 1
    return acc
  }, {})
  if ((counts.quick_reply || 0) > TEMPLATE_LIMITS.quickReplyMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Max ${TEMPLATE_LIMITS.quickReplyMax} quick-reply buttons`, path: ["buttons"] })
  }
  if ((counts.url || 0) > TEMPLATE_LIMITS.urlButtonMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Max ${TEMPLATE_LIMITS.urlButtonMax} URL buttons`, path: ["buttons"] })
  }
  if ((counts.phone_number || 0) > TEMPLATE_LIMITS.phoneButtonMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Max ${TEMPLATE_LIMITS.phoneButtonMax} phone-number button`, path: ["buttons"] })
  }
  if ((counts.copy_code || 0) > TEMPLATE_LIMITS.copyCodeButtonMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Max ${TEMPLATE_LIMITS.copyCodeButtonMax} copy-code button`, path: ["buttons"] })
  }

  // --- Button grouping: quick-replies can't be interleaved with CTAs ---
  const groups = data.buttons.map((b) => (b.type === "quick_reply" ? "qr" : "cta"))
  const seen = new Set<string>()
  let prev = ""
  for (const g of groups) {
    if (g !== prev && seen.has(g)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quick-reply buttons must be grouped — can't be interleaved with URL / phone / copy buttons",
        path: ["buttons"],
      })
      break
    }
    seen.add(g)
    prev = g
  }
})

export type TemplateInput = z.input<typeof TemplateSchema>
export type Template = z.infer<typeof TemplateSchema>

/**
 * Format zod errors as a flat array of "[field]: message" strings suitable
 * for a toast or error panel. Walks the zod path so nested errors (e.g.
 * sample_values.customer_name) read naturally.
 */
export function formatTemplateIssues(result: z.SafeParseReturnType<unknown, Template>): string[] {
  if (result.success) return []
  return result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "template"
    return `${path}: ${issue.message}`
  })
}
