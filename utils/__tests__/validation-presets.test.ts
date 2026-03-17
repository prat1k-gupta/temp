import { describe, it, expect } from "vitest"
import { VALIDATION_PRESETS, getImplicitInputType } from "../validation-presets"

describe("VALIDATION_PRESETS", () => {
  it("has presets for all input types", () => {
    const expectedTypes = ["text", "number", "email", "phone", "date", "select", "button", "none"]
    expectedTypes.forEach((type) => {
      expect(VALIDATION_PRESETS[type as keyof typeof VALIDATION_PRESETS]).toBeDefined()
    })
  })

  it("text preset has regex and error message", () => {
    const preset = VALIDATION_PRESETS.text
    expect(preset.regex).toBeDefined()
    expect(preset.errorMessage).toBe("Please enter a valid response")
    expect(preset.retryOnInvalid).toBe(true)
    expect(preset.maxRetries).toBe(3)
  })

  it("number preset validates digits only", () => {
    const preset = VALIDATION_PRESETS.number
    const regex = new RegExp(preset.regex!)
    expect(regex.test("123")).toBe(true)
    expect(regex.test("abc")).toBe(false)
    expect(regex.test("12.5")).toBe(false)
  })

  it("email preset validates email format", () => {
    const preset = VALIDATION_PRESETS.email
    const regex = new RegExp(preset.regex!)
    expect(regex.test("user@example.com")).toBe(true)
    expect(regex.test("user@sub.domain.co")).toBe(true)
    expect(regex.test("notanemail")).toBe(false)
    expect(regex.test("@missing.com")).toBe(false)
  })

  it("phone preset validates phone numbers", () => {
    const preset = VALIDATION_PRESETS.phone
    const regex = new RegExp(preset.regex!)
    expect(regex.test("+919876543210")).toBe(true)
    expect(regex.test("1234567890")).toBe(true)
    expect(regex.test("123")).toBe(false)
    expect(regex.test("abc")).toBe(false)
  })

  it("date preset validates DD/MM/YYYY format", () => {
    const preset = VALIDATION_PRESETS.date
    const regex = new RegExp(preset.regex!)
    expect(regex.test("15/06/1990")).toBe(true)
    expect(regex.test("01/01/2000")).toBe(true)
    expect(regex.test("2000-01-01")).toBe(false)
    expect(regex.test("32/13/2000")).toBe(false)
  })

  it("select and button presets have error messages but no regex", () => {
    expect(VALIDATION_PRESETS.select.regex).toBeUndefined()
    expect(VALIDATION_PRESETS.select.errorMessage).toBeDefined()
    expect(VALIDATION_PRESETS.button.regex).toBeUndefined()
    expect(VALIDATION_PRESETS.button.errorMessage).toBeDefined()
  })

  it("none preset is empty", () => {
    const preset = VALIDATION_PRESETS.none
    expect(preset.regex).toBeUndefined()
    expect(preset.errorMessage).toBeUndefined()
    expect(preset.retryOnInvalid).toBeUndefined()
  })
})

describe("getImplicitInputType", () => {
  it("maps question nodes to text", () => {
    expect(getImplicitInputType("whatsappQuestion")).toBe("text")
    expect(getImplicitInputType("question")).toBe("text")
  })

  it("maps quick reply nodes to button", () => {
    expect(getImplicitInputType("whatsappQuickReply")).toBe("button")
    expect(getImplicitInputType("quickReply")).toBe("button")
  })

  it("maps list nodes to select", () => {
    expect(getImplicitInputType("whatsappInteractiveList")).toBe("select")
    expect(getImplicitInputType("interactiveList")).toBe("select")
  })

  it("maps message nodes to none", () => {
    expect(getImplicitInputType("whatsappMessage")).toBe("none")
    expect(getImplicitInputType("message")).toBe("none")
  })

  it("returns none for removed super node types (now created as flowTemplate)", () => {
    expect(getImplicitInputType("name")).toBe("none")
    expect(getImplicitInputType("email")).toBe("none")
    expect(getImplicitInputType("dob")).toBe("none")
    expect(getImplicitInputType("address")).toBe("none")
  })

  it("maps condition to none", () => {
    expect(getImplicitInputType("condition")).toBe("none")
  })

  it("returns none for unknown types", () => {
    expect(getImplicitInputType("unknownType")).toBe("none")
    expect(getImplicitInputType("")).toBe("none")
  })
})
