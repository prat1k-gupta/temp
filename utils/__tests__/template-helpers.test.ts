import { describe, it, expect } from "vitest"
import { extractTemplateVariables, formatRejectionReason } from "@/utils/template-helpers"

describe("extractTemplateVariables", () => {
  it("extracts named variables in first-occurrence order", () => {
    expect(extractTemplateVariables("Hi {{first_name}} {{last_name}}"))
      .toEqual(["first_name", "last_name"])
  })

  it("extracts positional variables", () => {
    expect(extractTemplateVariables("Order {{1}} ready {{2}}"))
      .toEqual(["1", "2"])
  })

  it("handles mixed named and positional", () => {
    expect(extractTemplateVariables("{{name}} ordered {{1}}"))
      .toEqual(["name", "1"])
  })

  it("deduplicates repeated variables", () => {
    expect(extractTemplateVariables("Hi {{name}} — your order {{name}}"))
      .toEqual(["name"])
  })

  it("preserves first-occurrence order when deduping", () => {
    expect(extractTemplateVariables("{{b}} then {{a}} then {{b}} then {{c}}"))
      .toEqual(["b", "a", "c"])
  })

  it("returns empty array for body with no variables", () => {
    expect(extractTemplateVariables("No variables here")).toEqual([])
  })

  it("returns empty array for empty string", () => {
    expect(extractTemplateVariables("")).toEqual([])
  })

  it("ignores malformed braces", () => {
    expect(extractTemplateVariables("{not a var} {{valid}} {also not}"))
      .toEqual(["valid"])
  })

  it("accepts names with digits and underscores after the first char", () => {
    expect(extractTemplateVariables("Order {{order_id_1}} for {{firstName2}}"))
      .toEqual(["order_id_1", "firstName2"])
  })

  it("extracts consecutive variables with no separator", () => {
    expect(extractTemplateVariables("{{a}}{{b}}{{c}}"))
      .toEqual(["a", "b", "c"])
  })
})

describe("formatRejectionReason", () => {
  it("returns empty string for NONE or missing reason", () => {
    expect(formatRejectionReason("NONE")).toBe("")
    expect(formatRejectionReason("")).toBe("")
    expect(formatRejectionReason(undefined)).toBe("")
    expect(formatRejectionReason(null)).toBe("")
  })

  it("maps known Meta rejection codes to human-readable labels", () => {
    expect(formatRejectionReason("INVALID_FORMAT"))
      .toBe("Invalid format (check variables, structure, or characters)")
    expect(formatRejectionReason("ABUSIVE_CONTENT")).toBe("Abusive content")
    expect(formatRejectionReason("TAG_CONTENT_MISMATCH"))
      .toBe("Content doesn't match the selected category")
  })

  it("falls back to a prettified code for unknown reasons", () => {
    expect(formatRejectionReason("SOME_NEW_REASON")).toBe("some new reason")
  })
})
