import { describe, it, expect } from "vitest"
import { nodeTypes, initialNodes, initialEdges } from "../node-types-registry"
import { NODE_TEMPLATES } from "../node-categories"
import { getPlatformSpecificNodeType } from "@/utils/platform-helpers"

describe("nodeTypes registry", () => {
  it("has start node registered", () => {
    expect(nodeTypes.start).toBeDefined()
  })

  it("has comment node registered", () => {
    expect(nodeTypes.comment).toBeDefined()
  })

  it("has web question and quick reply nodes", () => {
    expect(nodeTypes.webQuestion).toBeDefined()
    expect(nodeTypes.webQuickReply).toBeDefined()
  })

  it("has whatsapp question, quick reply, and list nodes", () => {
    expect(nodeTypes.whatsappQuestion).toBeDefined()
    expect(nodeTypes.whatsappQuickReply).toBeDefined()
    expect(nodeTypes.whatsappInteractiveList).toBeDefined()
  })

  it("has backward compatibility alias for interactiveList", () => {
    expect(nodeTypes.interactiveList).toBeDefined()
  })

  it("has backward compatibility aliases for base types", () => {
    expect(nodeTypes.question).toBeDefined()
    expect(nodeTypes.quickReply).toBeDefined()
  })

  it("has instagram nodes (no list)", () => {
    expect(nodeTypes.instagramQuestion).toBeDefined()
    expect(nodeTypes.instagramQuickReply).toBeDefined()
    expect(nodeTypes.instagramDM).toBeDefined()
    expect(nodeTypes.instagramStory).toBeDefined()
  })

  it("does NOT have instagramList", () => {
    expect((nodeTypes as any).instagramList).toBeUndefined()
  })

  it("does NOT have whatsappListSpecific (old name)", () => {
    expect((nodeTypes as any).whatsappListSpecific).toBeUndefined()
  })

  it("has all super nodes", () => {
    expect(nodeTypes.name).toBeDefined()
    expect(nodeTypes.email).toBeDefined()
    expect(nodeTypes.address).toBeDefined()
    expect(nodeTypes.dob).toBeDefined()
  })

  it("has condition node", () => {
    expect(nodeTypes.condition).toBeDefined()
  })

  it("has all fulfillment nodes", () => {
    expect(nodeTypes.homeDelivery).toBeDefined()
    expect(nodeTypes.trackingNotification).toBeDefined()
    expect(nodeTypes.event).toBeDefined()
    expect(nodeTypes.retailStore).toBeDefined()
  })

  it("has all integration nodes", () => {
    const integrations = [
      "shopify", "metaAudience", "stripe", "zapier", "google",
      "salesforce", "mailchimp", "twilio", "slack", "airtable",
    ]
    integrations.forEach((name) => {
      expect((nodeTypes as any)[name]).toBeDefined()
    })
  })

  // Registry completeness test — catches forgotten registrations
  NODE_TEMPLATES.forEach((template) => {
    template.platforms.forEach((platform) => {
      it(`resolves "${template.type}" on ${platform} to a registered component`, () => {
        const resolvedType = getPlatformSpecificNodeType(template.type, platform)
        expect(
          (nodeTypes as any)[resolvedType],
          `nodeTypes["${resolvedType}"] is not registered (template: ${template.type}, platform: ${platform})`
        ).toBeDefined()
      })
    })
  })
})

describe("initialNodes", () => {
  it("has exactly one start node", () => {
    expect(initialNodes).toHaveLength(1)
    expect(initialNodes[0].type).toBe("start")
    expect(initialNodes[0].id).toBe("1")
  })
})

describe("initialEdges", () => {
  it("has an initial edge", () => {
    expect(initialEdges).toHaveLength(1)
    expect(initialEdges[0].source).toBe("1")
  })
})
