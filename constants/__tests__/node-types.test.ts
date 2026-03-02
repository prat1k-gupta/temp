import { describe, it, expect } from "vitest"
import { NODE_TYPE_MAPPINGS, NODE_LABELS, NODE_CONTENT } from "../node-types"

describe("NODE_TYPE_MAPPINGS", () => {
  it("has question mapping for all platforms", () => {
    expect(NODE_TYPE_MAPPINGS.question.web).toBe("webQuestion")
    expect(NODE_TYPE_MAPPINGS.question.whatsapp).toBe("whatsappQuestion")
    expect(NODE_TYPE_MAPPINGS.question.instagram).toBe("instagramQuestion")
  })

  it("has quickReply mapping for all platforms", () => {
    expect(NODE_TYPE_MAPPINGS.quickReply.web).toBe("webQuickReply")
    expect(NODE_TYPE_MAPPINGS.quickReply.whatsapp).toBe("whatsappQuickReply")
    expect(NODE_TYPE_MAPPINGS.quickReply.instagram).toBe("instagramQuickReply")
  })

  it("has interactiveList mapping for all platforms", () => {
    expect(NODE_TYPE_MAPPINGS.interactiveList.web).toBe("interactiveList")
    expect(NODE_TYPE_MAPPINGS.interactiveList.whatsapp).toBe("whatsappInteractiveList")
    expect(NODE_TYPE_MAPPINGS.interactiveList.instagram).toBe("interactiveList")
  })

  it("does NOT have whatsappList key", () => {
    expect((NODE_TYPE_MAPPINGS as any).whatsappList).toBeUndefined()
  })
})

describe("NODE_LABELS", () => {
  it("has labels for all mapped types", () => {
    Object.keys(NODE_TYPE_MAPPINGS).forEach((baseType) => {
      expect(NODE_LABELS[baseType]).toBeDefined()
    })
  })

  it("each label has web, whatsapp, and instagram entries", () => {
    Object.values(NODE_LABELS).forEach((labels) => {
      expect(labels.web).toBeDefined()
      expect(labels.whatsapp).toBeDefined()
      expect(labels.instagram).toBeDefined()
    })
  })
})

describe("NODE_CONTENT", () => {
  it("has content for all mapped types", () => {
    Object.keys(NODE_TYPE_MAPPINGS).forEach((baseType) => {
      expect(NODE_CONTENT[baseType]).toBeDefined()
    })
  })

  it("each content has web, whatsapp, and instagram entries", () => {
    Object.values(NODE_CONTENT).forEach((content) => {
      expect(content.web).toBeDefined()
      expect(content.whatsapp).toBeDefined()
      expect(content.instagram).toBeDefined()
    })
  })
})
