import { extractTemplateVariables } from "@/utils/template-helpers"

// Sample values exposed in the v1 API are a named-only map
// (e.g. { customer_name: "Asha", order_id: "ORD-1" }). fs-whatsapp wants
// a flat array of { component, param_name, value } entries — one per
// placeholder, with the component telling Meta whether the variable lives
// in the body or header. Build it from the body/header text.
function expandSampleValues(args: {
  bodyContent: string
  headerContent?: string
  headerType?: string
  samples: Record<string, string>
}): Array<{ component: "body" | "header"; param_name: string; value: string }> {
  const out: Array<{ component: "body" | "header"; param_name: string; value: string }> = []

  for (const v of extractTemplateVariables(args.bodyContent)) {
    const value = args.samples[v]
    if (value === undefined) continue
    out.push({ component: "body", param_name: v, value })
  }

  // Header variables only matter when the header is text (image/video/document
  // headers don't take {{}} placeholders).
  if (args.headerContent && args.headerType?.toUpperCase() === "TEXT") {
    for (const v of extractTemplateVariables(args.headerContent)) {
      const value = args.samples[v]
      if (value === undefined) continue
      out.push({ component: "header", param_name: v, value })
    }
  }

  return out
}

interface V1TemplateBody {
  account_name: string
  body_content: string
  header_content?: string
  header_type?: string
  sample_values?: Record<string, string>
  [k: string]: unknown
}

// Translates the v1 template body to fs-whatsapp's TemplateRequest JSON.
// Two mismatches handled:
//   1. account_name → whatsapp_account (legacy JSON key on fs-whatsapp).
//   2. sample_values map → flat [{component, param_name, value}] array.
export function toFsTemplatePayload(body: V1TemplateBody): Record<string, unknown> {
  const { account_name, sample_values, ...rest } = body
  const payload: Record<string, unknown> = {
    ...rest,
    whatsapp_account: account_name,
  }
  if (sample_values) {
    payload.sample_values = expandSampleValues({
      bodyContent: body.body_content,
      headerContent: body.header_content,
      headerType: body.header_type,
      samples: sample_values,
    })
  }
  return payload
}
