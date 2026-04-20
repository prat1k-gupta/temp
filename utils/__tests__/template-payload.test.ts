import { describe, it, expect } from "vitest"
import { buildTemplatePayload } from "@/utils/template-payload"

describe("buildTemplatePayload", () => {
  it("maps form keys to backend keys", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "welcome",
      display_name: "Welcome",
      language: "en",
      category: "MARKETING",
      header_type: "none",
      body: "Hi there",
      footer: "Thanks",
    })
    expect(payload.body_content).toBe("Hi there")
    expect(payload.footer_content).toBe("Thanks")
    expect(payload.header_type).toBe("")
  })

  it("defaults display_name to name when omitted", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "welcome",
      language: "en",
      category: "MARKETING",
      body: "Hi",
    })
    expect(payload.display_name).toBe("welcome")
  })

  it("clears header when content is empty — protects Meta from 131008", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      header_type: "text",
      header_content: "   ",
      body: "Hi",
    })
    expect(payload.header_type).toBe("")
    expect(payload.header_content).toBe("")
  })

  it("keeps media header handle through", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      header_type: "image",
      header_content: "4::aW1hZ2...",
      body: "Hi",
    })
    expect(payload.header_type).toBe("image")
    expect(payload.header_content).toBe("4::aW1hZ2...")
  })

  it("emits named sample_values for body variables", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      body: "Hi {{customer_name}}, order {{order_id}}",
      sample_values: { customer_name: "John", order_id: "ORD-1" },
    })
    expect(payload.sample_values).toEqual([
      { component: "body", param_name: "customer_name", value: "John" },
      { component: "body", param_name: "order_id", value: "ORD-1" },
    ])
  })

  it("emits positional index from variable name, not array position", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      body: "Order {{2}} then {{1}}",
      sample_values: { "1": "first", "2": "second" },
    })
    expect(payload.sample_values).toEqual([
      { component: "body", index: 2, value: "second" },
      { component: "body", index: 1, value: "first" },
    ])
  })

  it("drops sample entries for variables with empty values", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      body: "Hi {{a}} and {{b}}",
      sample_values: { a: "value", b: "" },
    })
    expect(payload.sample_values).toEqual([
      { component: "body", param_name: "a", value: "value" },
    ])
  })

  it("fills URL button example from the sample_values keyed by URL variable", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      body: "Track at the link below",
      buttons: [{ type: "url", text: "Track", url: "https://x.com/{{tracking_id}}" }],
      sample_values: { tracking_id: "TRK-42" },
    })
    expect(payload.buttons[0]).toMatchObject({ example: "TRK-42" })
  })

  it("emits header sample entries alongside body when header has a variable", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      header_type: "text",
      header_content: "Update for {{customer_name}}",
      body: "Your order {{order_id}}",
      sample_values: { customer_name: "John", order_id: "ORD-1" },
    })
    expect(payload.sample_values).toContainEqual(
      { component: "body", param_name: "order_id", value: "ORD-1" },
    )
    expect(payload.sample_values).toContainEqual(
      { component: "header", param_name: "customer_name", value: "John" },
    )
  })

  it("prefers body field but falls back to body_content when reloading a stored template", () => {
    const payload = buildTemplatePayload({
      whatsapp_account: "Test WA",
      name: "x",
      language: "en",
      category: "MARKETING",
      body_content: "Stored body",
    })
    expect(payload.body_content).toBe("Stored body")
  })
})
