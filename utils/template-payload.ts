import { extractTemplateVariables } from "@/utils/template-helpers"

export interface TemplateFormLike {
  whatsapp_account?: string
  name: string
  display_name?: string
  language: string
  category: string
  header_type?: string
  header_content?: string
  body?: string
  body_content?: string
  footer?: string
  footer_content?: string
  buttons?: Array<Record<string, any>>
  sample_values?: Record<string, string>
}

export interface TemplateApiPayload {
  whatsapp_account: string
  name: string
  display_name: string
  language: string
  category: string
  header_type: string
  header_content: string
  body_content: string
  footer_content: string
  buttons: Array<Record<string, any>>
  sample_values: Array<Record<string, any>>
}

// fs-chat uses `body_content`/`footer_content` and an array-shaped
// `sample_values`; the form state uses `body`/`footer` and a keyed record.
// This function is the single place that crosses that boundary — used by
// the templates page and every AI CRUD tool so the two paths can never
// drift.
export function buildTemplatePayload(data: TemplateFormLike): TemplateApiPayload {
  const bodyText = data.body ?? data.body_content ?? ""
  const footerText = data.footer ?? data.footer_content ?? ""
  const headerText = data.header_content ?? ""

  const hasHeaderContent = !!headerText.trim()
  const effectiveHeaderType = data.header_type === "none" || !hasHeaderContent
    ? ""
    : (data.header_type || "")

  const samples = data.sample_values ?? {}

  const buttons = (data.buttons || []).map((btn) => {
    if (btn.type === "url" && typeof btn.url === "string" && btn.url.includes("{{")) {
      const urlVars = extractTemplateVariables(btn.url)
      const example = urlVars.length > 0 ? samples[urlVars[0]] || "" : ""
      return { ...btn, example }
    }
    return btn
  })

  const bodyVars = extractTemplateVariables(bodyText)
  const headerVars = effectiveHeaderType === "text" ? extractTemplateVariables(headerText) : []
  const sampleValues: Array<Record<string, any>> = []
  const pushSample = (component: "body" | "header", v: string) => {
    const val = samples[v]
    if (!val) return
    const isPositional = /^\d+$/.test(v)
    sampleValues.push({
      component,
      ...(isPositional ? { index: parseInt(v, 10) } : { param_name: v }),
      value: val,
    })
  }
  bodyVars.forEach((v) => pushSample("body", v))
  headerVars.forEach((v) => pushSample("header", v))

  return {
    whatsapp_account: data.whatsapp_account || "",
    name: data.name,
    display_name: data.display_name || data.name,
    language: data.language,
    category: data.category,
    header_type: effectiveHeaderType,
    header_content: effectiveHeaderType ? headerText : "",
    body_content: bodyText,
    footer_content: footerText,
    buttons,
    sample_values: sampleValues,
  }
}
