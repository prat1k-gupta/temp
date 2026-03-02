import { describe, it, expect } from "vitest"
import {
  getPlatformSpecificNodeType,
  getPlatformSpecificLabel,
  getPlatformSpecificContent,
  getBaseNodeType,
  isMultiOutputType,
} from "../platform-helpers"

describe("getPlatformSpecificNodeType", () => {
  it("returns base type for web platform (web shortcut)", () => {
    expect(getPlatformSpecificNodeType("question", "web")).toBe("question")
  })

  it("returns whatsapp type for whatsapp platform", () => {
    expect(getPlatformSpecificNodeType("question", "whatsapp")).toBe("whatsappQuestion")
  })

  it("returns instagram type for instagram platform", () => {
    expect(getPlatformSpecificNodeType("question", "instagram")).toBe("instagramQuestion")
  })

  it("returns correct quickReply types per platform", () => {
    expect(getPlatformSpecificNodeType("quickReply", "web")).toBe("quickReply")
    expect(getPlatformSpecificNodeType("quickReply", "whatsapp")).toBe("whatsappQuickReply")
    expect(getPlatformSpecificNodeType("quickReply", "instagram")).toBe("instagramQuickReply")
  })

  it("returns correct interactiveList types per platform", () => {
    expect(getPlatformSpecificNodeType("interactiveList", "web")).toBe("interactiveList")
    expect(getPlatformSpecificNodeType("interactiveList", "whatsapp")).toBe("whatsappInteractiveList")
    expect(getPlatformSpecificNodeType("interactiveList", "instagram")).toBe("interactiveList")
  })

  it("returns base type when no platform mapping exists", () => {
    expect(getPlatformSpecificNodeType("comment", "web")).toBe("comment")
    expect(getPlatformSpecificNodeType("start", "whatsapp")).toBe("start")
    expect(getPlatformSpecificNodeType("name", "instagram")).toBe("name")
  })
})

describe("getPlatformSpecificLabel", () => {
  it("returns correct label for question type per platform", () => {
    expect(getPlatformSpecificLabel("question", "web")).toBe("Question")
    expect(getPlatformSpecificLabel("question", "whatsapp")).toBe("WhatsApp Question")
    expect(getPlatformSpecificLabel("question", "instagram")).toBe("Instagram Question")
  })

  it("returns fallback label for unknown types", () => {
    expect(getPlatformSpecificLabel("unknownType", "web")).toBe("Node")
  })
})

describe("getPlatformSpecificContent", () => {
  it("returns correct content for question type", () => {
    expect(getPlatformSpecificContent("question", "web")).toBe("What would you like to know?")
    expect(getPlatformSpecificContent("question", "whatsapp")).toBe("What would you like to know?")
  })

  it("returns empty string for unknown types", () => {
    expect(getPlatformSpecificContent("unknownType", "web")).toBe("")
  })
})

describe("getBaseNodeType", () => {
  it("maps question variants to 'question'", () => {
    expect(getBaseNodeType("question")).toBe("question")
    expect(getBaseNodeType("webQuestion")).toBe("question")
    expect(getBaseNodeType("whatsappQuestion")).toBe("question")
    expect(getBaseNodeType("instagramQuestion")).toBe("question")
  })

  it("maps quickReply variants to 'quickReply'", () => {
    expect(getBaseNodeType("quickReply")).toBe("quickReply")
    expect(getBaseNodeType("webQuickReply")).toBe("quickReply")
    expect(getBaseNodeType("whatsappQuickReply")).toBe("quickReply")
    expect(getBaseNodeType("instagramQuickReply")).toBe("quickReply")
  })

  it("maps list variants to 'list'", () => {
    expect(getBaseNodeType("interactiveList")).toBe("list")
    expect(getBaseNodeType("whatsappInteractiveList")).toBe("list")
  })

  it("maps platform-specific nodes correctly", () => {
    expect(getBaseNodeType("whatsappMessage")).toBe("whatsappMessage")
    expect(getBaseNodeType("instagramDM")).toBe("instagramDM")
    expect(getBaseNodeType("instagramStory")).toBe("instagramStory")
    expect(getBaseNodeType("trackingNotification")).toBe("trackingNotification")
  })

  it("maps special nodes correctly", () => {
    expect(getBaseNodeType("comment")).toBe("comment")
    expect(getBaseNodeType("start")).toBe("start")
  })

  it("returns input unchanged for unknown types", () => {
    expect(getBaseNodeType("shopify")).toBe("shopify")
    expect(getBaseNodeType("name")).toBe("name")
    expect(getBaseNodeType("condition")).toBe("condition")
  })
})

describe("isMultiOutputType", () => {
  it("returns true for base quickReply and list types", () => {
    expect(isMultiOutputType("quickReply")).toBe(true)
    expect(isMultiOutputType("interactiveList")).toBe(true)
  })

  it("returns true for platform-specific quickReply and list types", () => {
    expect(isMultiOutputType("whatsappQuickReply")).toBe(true)
    expect(isMultiOutputType("instagramQuickReply")).toBe(true)
    expect(isMultiOutputType("webQuickReply")).toBe(true)
    expect(isMultiOutputType("whatsappInteractiveList")).toBe(true)
  })

  it("returns false for non-multi-output types", () => {
    expect(isMultiOutputType("question")).toBe(false)
    expect(isMultiOutputType("whatsappQuestion")).toBe(false)
    expect(isMultiOutputType("name")).toBe(false)
    expect(isMultiOutputType("shopify")).toBe(false)
    expect(isMultiOutputType("homeDelivery")).toBe(false)
    expect(isMultiOutputType("whatsappMessage")).toBe(false)
  })
})
