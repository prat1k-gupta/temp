import { describe, it, expect } from "vitest"
import { formatAudienceSummary } from "@/utils/campaign-audience"

describe("formatAudienceSummary", () => {
  it("handles CSV", () => {
    expect(formatAudienceSummary("csv", null)).toBe("CSV upload")
  })

  it("handles contacts with no config", () => {
    expect(formatAudienceSummary("contacts", null)).toBe("All contacts")
    expect(formatAudienceSummary("contacts", {})).toBe("All contacts")
  })

  it("handles contacts with a tag filter", () => {
    const cfg = { filter: { op: "is", type: "tag", values: ["promo"] } }
    expect(formatAudienceSummary("contacts", cfg)).toBe("Tag: promo")
  })

  it("shows '+N' on multi-value tag filters", () => {
    const cfg = { filter: { op: "is", type: "tag", values: ["a", "b", "c"] } }
    expect(formatAudienceSummary("contacts", cfg)).toBe("Tag: a +2")
  })

  it("truncates long tag names", () => {
    const long = "x".repeat(50)
    const cfg = { filter: { op: "is", type: "tag", values: [long] } }
    expect(formatAudienceSummary("contacts", cfg)).toBe("Tag: " + "x".repeat(27) + "…")
  })

  it("combines search + channel", () => {
    expect(formatAudienceSummary("contacts", { search: "acme", channel: "whatsapp" }))
      .toBe("Search: 'acme' · Channel: whatsapp")
  })

  it("handles freestand-claimant with audience_id", () => {
    const cfg = { audience_id: "26d49d09-3502-49ec-a226-cfd5adaddfca" }
    expect(formatAudienceSummary("freestand-claimant", cfg)).toBe("Claimant audience 26d49d09…")
  })

  it("handles freestand-claimant without audience_id", () => {
    expect(formatAudienceSummary("freestand-claimant", {})).toBe("Claimant audience")
  })

  it("handles undefined source", () => {
    expect(formatAudienceSummary(undefined, null)).toBe("Unknown")
  })
})
