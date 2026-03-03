import { describe, it, expect } from "vitest"
import {
  createQuestionNode,
  createQuickReplyNode,
  createListNode,
  createCommentNode,
  createSuperNode,
  createFulfillmentNode,
  createIntegrationNode,
  createMessageNode,
  createConditionNode,
  createNode,
} from "../node-factory"
import { NODE_TEMPLATES } from "@/constants/node-categories"
import type { Platform } from "@/types"

const platforms: Platform[] = ["web", "whatsapp", "instagram"]
const position = { x: 100, y: 200 }

describe("createQuestionNode", () => {
  platforms.forEach((platform) => {
    it(`creates question node for ${platform}`, () => {
      const node = createQuestionNode(platform, position)
      expect(node.id).toBeDefined()
      expect(node.position).toEqual(position)
      expect(node.data.platform).toBe(platform)
      expect(node.data.question).toBeDefined()
    })
  })

  it("uses custom ID when provided", () => {
    const node = createQuestionNode("web", position, "custom-id")
    expect(node.id).toBe("custom-id")
  })

  it("sets platform-specific type", () => {
    expect(createQuestionNode("web", position).type).toBe("question")
    expect(createQuestionNode("whatsapp", position).type).toBe("whatsappQuestion")
    expect(createQuestionNode("instagram", position).type).toBe("instagramQuestion")
  })

  it("includes storeAs default", () => {
    const node = createQuestionNode("whatsapp", position)
    expect(node.data.storeAs).toBe("")
  })
})

describe("createQuickReplyNode", () => {
  platforms.forEach((platform) => {
    it(`creates quick reply node for ${platform}`, () => {
      const node = createQuickReplyNode(platform, position)
      expect(node.data.platform).toBe(platform)
      expect(node.data.buttons).toBeDefined()
      expect((node.data.buttons as any[]).length).toBeGreaterThan(0)
    })
  })

  it("sets correct type per platform", () => {
    expect(createQuickReplyNode("web", position).type).toBe("quickReply")
    expect(createQuickReplyNode("whatsapp", position).type).toBe("whatsappQuickReply")
    expect(createQuickReplyNode("instagram", position).type).toBe("instagramQuickReply")
  })

  it("includes storeAs default", () => {
    const node = createQuickReplyNode("whatsapp", position)
    expect(node.data.storeAs).toBe("")
  })
})

describe("createListNode", () => {
  platforms.forEach((platform) => {
    it(`creates list node for ${platform}`, () => {
      const node = createListNode(platform, position)
      expect(node.data.platform).toBe(platform)
      expect(node.data.options).toBeDefined()
      expect((node.data.options as any[]).length).toBeGreaterThan(0)
    })
  })

  it("sets correct type based on platform mapping", () => {
    expect(createListNode("whatsapp", position).type).toBe("whatsappInteractiveList")
  })

  it("includes storeAs default", () => {
    const node = createListNode("whatsapp", position)
    expect(node.data.storeAs).toBe("")
  })
})

describe("createCommentNode", () => {
  it("creates comment node with default text", () => {
    const node = createCommentNode("web", position)
    expect(node.type).toBe("comment")
    expect(node.data.comment).toBeDefined()
    expect(node.data.createdBy).toBe("You")
    expect(node.data.createdAt).toBeDefined()
  })
})

describe("createSuperNode", () => {
  const superTypes = ["name", "email", "dob", "address"] as const

  superTypes.forEach((type) => {
    platforms.forEach((platform) => {
      it(`creates ${type} node for ${platform}`, () => {
        const node = createSuperNode(type, platform, position)
        expect(node.type).toBe(type)
        expect(node.data.platform).toBe(platform)
        expect(node.data.question).toBeDefined()
        expect(node.data.label).toBeDefined()
      })
    })
  })

  it("sets validation rules for name node", () => {
    const node = createSuperNode("name", "web", position)
    expect(node.data.validationRules).toBeDefined()
    expect((node.data.validationRules as any).minLength).toBe(2)
  })

  it("sets validation rules for email node", () => {
    const node = createSuperNode("email", "web", position)
    expect((node.data.validationRules as any).format).toBe("RFC 5322")
  })

  it("sets validation rules for dob node", () => {
    const node = createSuperNode("dob", "web", position)
    expect((node.data.validationRules as any).minAge).toBe(13)
  })

  it("sets address components for address node", () => {
    const node = createSuperNode("address", "web", position)
    expect(node.data.addressComponents).toBeDefined()
    expect((node.data.addressComponents as string[]).length).toBeGreaterThan(0)
  })

  it("enables autocomplete for web address node", () => {
    const node = createSuperNode("address", "web", position)
    expect((node.data.validationRules as any).autocomplete).toBe(true)
  })

  it("disables autocomplete for whatsapp address node", () => {
    const node = createSuperNode("address", "whatsapp", position)
    expect((node.data.validationRules as any).autocomplete).toBe(false)
  })

  it("auto-sets storeAs for each super node type", () => {
    expect(createSuperNode("name", "whatsapp", position).data.storeAs).toBe("user_name")
    expect(createSuperNode("email", "whatsapp", position).data.storeAs).toBe("user_email")
    expect(createSuperNode("dob", "whatsapp", position).data.storeAs).toBe("user_dob")
    expect(createSuperNode("address", "whatsapp", position).data.storeAs).toBe("user_address")
  })
})

describe("createFulfillmentNode", () => {
  const fulfillmentTypes = ["homeDelivery", "trackingNotification", "event", "retailStore"] as const

  fulfillmentTypes.forEach((type) => {
    it(`creates ${type} node`, () => {
      const node = createFulfillmentNode(type, "web", position)
      expect(node.type).toBe(type)
      expect(node.data.platform).toBe("web")
      expect(node.data.label).toBeDefined()
    })
  })

  it("includes vendor info for homeDelivery", () => {
    const node = createFulfillmentNode("homeDelivery", "web", position)
    expect(node.data.vendor).toBeDefined()
  })

  it("includes message for trackingNotification", () => {
    const node = createFulfillmentNode("trackingNotification", "web", position)
    expect(node.data.message).toBeDefined()
  })
})

describe("createIntegrationNode", () => {
  const integrationTypes = [
    "shopify", "metaAudience", "stripe", "zapier", "google",
    "salesforce", "mailchimp", "twilio", "slack", "airtable",
  ] as const

  integrationTypes.forEach((type) => {
    it(`creates ${type} node`, () => {
      const node = createIntegrationNode(type, "web", position)
      expect(node.type).toBe(type)
      expect(node.data.platform).toBe("web")
      expect(node.data.label).toBeDefined()
      expect(node.data.description).toBeDefined()
    })
  })
})

describe("createMessageNode", () => {
  const messageTypes = ["whatsappMessage", "instagramDM", "instagramStory"] as const

  messageTypes.forEach((type) => {
    it(`creates ${type} node`, () => {
      const node = createMessageNode(type, type === "whatsappMessage" ? "whatsapp" : "instagram", position)
      expect(node.type).toBe(type)
      expect(node.data.label).toBeDefined()
      expect(node.data.text).toBeDefined()
    })
  })
})

describe("createConditionNode", () => {
  it("creates condition node with default groups", () => {
    const node = createConditionNode("web", position)
    expect(node.type).toBe("condition")
    expect(node.data.conditionLogic).toBe("AND")
    expect(node.data.conditionGroups).toBeDefined()
    expect((node.data.conditionGroups as any[]).length).toBe(1)
  })
})

describe("createNode (factory function)", () => {
  it("creates question nodes", () => {
    const node = createNode("question", "web", position)
    expect(node.type).toBe("question")
  })

  it("creates quickReply nodes", () => {
    const node = createNode("quickReply", "whatsapp", position)
    expect(node.type).toBe("whatsappQuickReply")
  })

  it("creates interactiveList nodes", () => {
    const node = createNode("interactiveList", "whatsapp", position)
    expect(node.type).toBe("whatsappInteractiveList")
  })

  it("creates comment nodes", () => {
    const node = createNode("comment", "web", position)
    expect(node.type).toBe("comment")
  })

  it("creates condition nodes", () => {
    const node = createNode("condition", "web", position)
    expect(node.type).toBe("condition")
  })

  it("creates super nodes", () => {
    ;(["name", "email", "dob", "address"] as const).forEach((type) => {
      const node = createNode(type, "web", position)
      expect(node.type).toBe(type)
    })
  })

  it("creates fulfillment nodes", () => {
    ;(["homeDelivery", "trackingNotification", "event", "retailStore"] as const).forEach((type) => {
      const node = createNode(type, "web", position)
      expect(node.type).toBe(type)
    })
  })

  it("creates integration nodes", () => {
    ;(["shopify", "stripe", "zapier", "google", "salesforce", "mailchimp", "twilio", "slack", "airtable"] as const).forEach((type) => {
      const node = createNode(type, "web", position)
      expect(node.type).toBe(type)
    })
  })

  it("creates message nodes", () => {
    expect(createNode("whatsappMessage", "whatsapp", position).type).toBe("whatsappMessage")
    expect(createNode("instagramDM", "instagram", position).type).toBe("instagramDM")
    expect(createNode("instagramStory", "instagram", position).type).toBe("instagramStory")
  })

  it("throws for unknown node types", () => {
    expect(() => createNode("unknownType", "web", position)).toThrow("Unknown node type")
  })

  it("uses custom ID when provided", () => {
    const node = createNode("question", "web", position, "my-id")
    expect(node.id).toBe("my-id")
  })

  it("merges additional data when provided", () => {
    const node = createNode("question", "web", position, undefined, { label: "Custom Label" } as any)
    expect(node.data.label).toBe("Custom Label")
  })

  // Exhaustive: every NODE_TEMPLATES type can be created
  NODE_TEMPLATES.forEach((template) => {
    it(`createNode handles "${template.type}" (from NODE_TEMPLATES)`, () => {
      const platform = template.platforms[0]
      expect(() => createNode(template.type, platform, position)).not.toThrow()
    })
  })
})
