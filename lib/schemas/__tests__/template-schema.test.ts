import { describe, it, expect } from "vitest"
import { TemplateSchema, formatTemplateIssues, type Template } from "@/lib/schemas/template-schema"

function base(overrides: Partial<Template> = {}): Template {
  return {
    name: "valid_name",
    display_name: "Valid name",
    whatsapp_account: "Test WA",
    language: "en",
    category: "MARKETING",
    header_type: "none",
    header_content: "",
    body: "Hello world",
    footer: "",
    buttons: [],
    sample_values: {},
    ...overrides,
  } as Template
}

describe("TemplateSchema — basics", () => {
  it("accepts a minimal valid template", () => {
    expect(TemplateSchema.safeParse(base()).success).toBe(true)
  })

  it("rejects empty body", () => {
    const r = TemplateSchema.safeParse(base({ body: "" }))
    expect(r.success).toBe(false)
  })

  it("rejects body >1024 chars", () => {
    const r = TemplateSchema.safeParse(base({ body: "x".repeat(1025) }))
    expect(r.success).toBe(false)
  })

  it("rejects name with uppercase or dashes", () => {
    expect(TemplateSchema.safeParse(base({ name: "Bad-Name" })).success).toBe(false)
    expect(TemplateSchema.safeParse(base({ name: "bad name" })).success).toBe(false)
    expect(TemplateSchema.safeParse(base({ name: "_leading" })).success).toBe(false)
    expect(TemplateSchema.safeParse(base({ name: "trailing_" })).success).toBe(false)
  })

  it("rejects footer >60 chars", () => {
    const r = TemplateSchema.safeParse(base({ footer: "x".repeat(61) }))
    expect(r.success).toBe(false)
  })

  it("rejects variables inside footer", () => {
    const r = TemplateSchema.safeParse(base({ footer: "Call {{name}}" }))
    expect(r.success).toBe(false)
  })
})

describe("TemplateSchema — header rules", () => {
  it("rejects empty text header when type=text", () => {
    const r = TemplateSchema.safeParse(base({ header_type: "text", header_content: "" }))
    expect(r.success).toBe(false)
  })

  it("rejects header text >60 chars", () => {
    const r = TemplateSchema.safeParse(base({ header_type: "text", header_content: "x".repeat(61) }))
    expect(r.success).toBe(false)
  })

  it("rejects emoji in header", () => {
    const r = TemplateSchema.safeParse(base({ header_type: "text", header_content: "Hello 👋" }))
    expect(r.success).toBe(false)
    expect(formatTemplateIssues(r).join(" ")).toMatch(/emoji/i)
  })

  it("rejects newlines in header", () => {
    const r = TemplateSchema.safeParse(base({ header_type: "text", header_content: "Line 1\nLine 2" }))
    expect(r.success).toBe(false)
  })

  it("rejects more than one variable in header", () => {
    const r = TemplateSchema.safeParse(base({
      header_type: "text",
      header_content: "{{a}} and {{b}}",
      body: "Body {{a}} {{b}}",
      sample_values: { a: "1", b: "2" },
    }))
    expect(r.success).toBe(false)
  })

  it("requires a handle for media headers", () => {
    const r = TemplateSchema.safeParse(base({ header_type: "image", header_content: "" }))
    expect(r.success).toBe(false)
  })

  it("accepts a media header when handle is present", () => {
    const r = TemplateSchema.safeParse(base({ header_type: "image", header_content: "4::aW1hZ2..." }))
    expect(r.success).toBe(true)
  })
})

describe("TemplateSchema — variable grammar", () => {
  it("rejects mixing named and positional variables", () => {
    const r = TemplateSchema.safeParse(base({
      body: "Hi {{name}} order {{1}}",
      sample_values: { name: "x", "1": "y" },
    }))
    expect(r.success).toBe(false)
  })

  it("rejects non-sequential positional variables", () => {
    const r = TemplateSchema.safeParse(base({
      body: "Order {{1}} and {{3}}",
      sample_values: { "1": "a", "3": "b" },
    }))
    expect(r.success).toBe(false)
  })

  it("accepts sequential positional variables", () => {
    const r = TemplateSchema.safeParse(base({
      body: "Order {{1}} delivered at {{2}}",
      sample_values: { "1": "a", "2": "b" },
    }))
    expect(r.success).toBe(true)
  })

  it("requires sample values for every body variable", () => {
    const r = TemplateSchema.safeParse(base({
      body: "Hi {{customer_name}}, your order {{order_id}}",
      sample_values: { customer_name: "John" },
    }))
    expect(r.success).toBe(false)
    expect(formatTemplateIssues(r).join(" ")).toMatch(/order_id/)
  })

  it("accepts when all variables have sample values", () => {
    const r = TemplateSchema.safeParse(base({
      body: "Hi {{customer_name}}",
      sample_values: { customer_name: "John" },
    }))
    expect(r.success).toBe(true)
  })
})

describe("TemplateSchema — buttons", () => {
  it("rejects button text >25 chars", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "quick_reply", text: "x".repeat(26) }],
    }))
    expect(r.success).toBe(false)
  })

  it("rejects URL without http(s) prefix", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "url", text: "Visit", url: "example.com" }],
    }))
    expect(r.success).toBe(false)
  })

  it("accepts URL button with https", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "url", text: "Visit", url: "https://example.com" }],
    }))
    expect(r.success).toBe(true)
  })

  it("rejects URL with variable but no example", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "url", text: "Track", url: "https://x.com/{{id}}" }],
    }))
    expect(r.success).toBe(false)
  })

  it("rejects phone in non-E.164 format", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "phone_number", text: "Call", phone_number: "1234567890" }],
    }))
    expect(r.success).toBe(false)
  })

  it("accepts phone in E.164 format", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "phone_number", text: "Call", phone_number: "+14155551234" }],
    }))
    expect(r.success).toBe(true)
  })

  it("rejects more than 3 quick-reply buttons", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: Array.from({ length: 4 }, (_, i) => ({ type: "quick_reply" as const, text: `QR${i}` })),
    }))
    expect(r.success).toBe(false)
  })

  it("rejects interleaved quick-reply and CTA buttons", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [
        { type: "quick_reply", text: "Yes" },
        { type: "url", text: "Visit", url: "https://example.com" },
        { type: "quick_reply", text: "No" },
      ],
    }))
    expect(r.success).toBe(false)
    expect(formatTemplateIssues(r).join(" ")).toMatch(/grouped/i)
  })

  it("accepts grouped quick-replies followed by CTAs", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [
        { type: "quick_reply", text: "Yes" },
        { type: "quick_reply", text: "No" },
        { type: "url", text: "Visit", url: "https://example.com" },
      ],
    }))
    expect(r.success).toBe(true)
  })

  it("rejects copy-code button without example_code", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "copy_code", text: "Copy" }],
    }))
    expect(r.success).toBe(false)
    expect(formatTemplateIssues(r).join(" ")).toMatch(/example/i)
  })

  it("accepts copy-code button with example_code", () => {
    const r = TemplateSchema.safeParse(base({
      buttons: [{ type: "copy_code", text: "Copy", example_code: "SAVE20" }],
    }))
    expect(r.success).toBe(true)
  })

  it("accepts plain ASCII symbols in header (no emoji false-positive)", () => {
    for (const s of ["Order ^ Update", "Foo `bar` baz", "100% off"]) {
      const r = TemplateSchema.safeParse(base({ header_type: "text", header_content: s }))
      expect(r.success).toBe(true)
    }
  })

  it("rejects © ™ ® in header (parity with Go)", () => {
    for (const s of ["© 2026", "Brand ™", "® Co"]) {
      const r = TemplateSchema.safeParse(base({ header_type: "text", header_content: s }))
      expect(r.success).toBe(false)
      expect(formatTemplateIssues(r).join(" ")).toMatch(/emoji/i)
    }
  })
})

describe("formatTemplateIssues", () => {
  it("returns [] for a successful parse", () => {
    const r = TemplateSchema.safeParse(base())
    expect(formatTemplateIssues(r)).toEqual([])
  })

  it("formats nested paths readably", () => {
    const r = TemplateSchema.safeParse(base({
      body: "Hi {{name}}",
      sample_values: {},
    }))
    expect(r.success).toBe(false)
    const issues = formatTemplateIssues(r)
    expect(issues.some((i) => i.startsWith("sample_values.name:"))).toBe(true)
  })
})
