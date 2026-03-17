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

  it("does NOT have legacy super nodes (removed — now created as flowTemplate)", () => {
    expect((nodeTypes as any).name).toBeUndefined()
    expect((nodeTypes as any).email).toBeUndefined()
    expect((nodeTypes as any).address).toBeUndefined()
    expect((nodeTypes as any).dob).toBeUndefined()
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
  // Skip "template" category (name, email, dob, address) — those are created as
  // flowTemplate nodes by the factory, not registered as standalone components.
  NODE_TEMPLATES.filter(t => t.category !== "template").forEach((template) => {
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
