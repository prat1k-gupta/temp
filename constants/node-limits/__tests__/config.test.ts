import { describe, it, expect } from "vitest"
import { getNodeLimits } from "../config"
import { BUTTON_LIMITS, CHARACTER_LIMITS } from "../../platform-limits"
import type { Platform } from "@/types"

const platforms: Platform[] = ["web", "whatsapp", "instagram"]

describe("getNodeLimits", () => {
  describe("question nodes", () => {
    platforms.forEach((platform) => {
      it(`returns correct limits for question on ${platform}`, () => {
        const limits = getNodeLimits("question", platform)
        expect(limits.question).toBeDefined()
        expect(limits.question!.max).toBe(CHARACTER_LIMITS[platform].question)
        expect(limits.maxConnections).toBe(1)
        expect(limits.allowMultipleOutputs).toBe(false)
        expect(limits.allowMultipleInputs).toBe(true)
      })
    })

    it("works with platform-specific type names", () => {
      const limits = getNodeLimits("whatsappQuestion", "whatsapp")
      expect(limits.question).toBeDefined()
      expect(limits.question!.max).toBe(CHARACTER_LIMITS.whatsapp.question)
    })
  })

  describe("quickReply nodes", () => {
    platforms.forEach((platform) => {
      it(`returns correct limits for quickReply on ${platform}`, () => {
        const limits = getNodeLimits("quickReply", platform)
        expect(limits.question).toBeDefined()
        expect(limits.buttons).toBeDefined()
        expect(limits.buttons!.max).toBe(BUTTON_LIMITS[platform])
        expect(limits.buttons!.textMaxLength).toBe(CHARACTER_LIMITS[platform].button)
        expect(limits.maxConnections).toBe(BUTTON_LIMITS[platform])
        expect(limits.allowMultipleOutputs).toBe(true)
      })
    })
  })

  describe("list nodes", () => {
    it("returns list limits for interactiveList", () => {
      const limits = getNodeLimits("interactiveList", "whatsapp")
      expect(limits.options).toBeDefined()
      expect(limits.options!.max).toBe(10)
      expect(limits.options!.descriptionMaxLength).toBe(72)
      expect(limits.listTitle).toBeDefined()
      expect(limits.listTitle!.max).toBe(20)
      expect(limits.maxConnections).toBe(10)
      expect(limits.allowMultipleOutputs).toBe(true)
    })

    it("resolves whatsappInteractiveList to list limits", () => {
      const limits = getNodeLimits("whatsappInteractiveList", "whatsapp")
      expect(limits.options).toBeDefined()
      expect(limits.options!.max).toBe(10)
    })
  })

  describe("comment nodes", () => {
    it("returns comment limits", () => {
      const limits = getNodeLimits("comment", "web")
      expect(limits.comment).toBeDefined()
      expect(limits.maxConnections).toBe(0)
      expect(limits.allowMultipleOutputs).toBe(false)
      expect(limits.allowMultipleInputs).toBe(false)
    })
  })

  describe("start nodes", () => {
    it("returns start limits", () => {
      const limits = getNodeLimits("start", "web")
      expect(limits.maxConnections).toBe(1)
      expect(limits.allowMultipleOutputs).toBe(false)
      expect(limits.allowMultipleInputs).toBe(false)
    })
  })

  describe("platform-specific message nodes", () => {
    it("returns whatsappMessage limits", () => {
      const limits = getNodeLimits("whatsappMessage", "whatsapp")
      expect(limits.text).toBeDefined()
      expect(limits.text!.max).toBe(4096)
    })

    it("returns instagramDM limits", () => {
      const limits = getNodeLimits("instagramDM", "instagram")
      expect(limits.text).toBeDefined()
      expect(limits.text!.max).toBe(1000)
    })

    it("returns instagramStory limits", () => {
      const limits = getNodeLimits("instagramStory", "instagram")
      expect(limits.text).toBeDefined()
      expect(limits.text!.max).toBe(500)
    })
  })

  describe("trackingNotification", () => {
    it("returns tracking notification limits", () => {
      const limits = getNodeLimits("trackingNotification", "whatsapp")
      expect(limits.text).toBeDefined()
      expect(limits.maxConnections).toBe(1)
    })
  })

  describe("default fallback", () => {
    it("returns default limits for unknown types", () => {
      const limits = getNodeLimits("shopify", "web")
      expect(limits.maxConnections).toBe(1)
      expect(limits.allowMultipleOutputs).toBe(false)
      expect(limits.allowMultipleInputs).toBe(true)
    })

    it("returns default limits for super nodes", () => {
      const limits = getNodeLimits("name", "web")
      expect(limits.maxConnections).toBe(1)
    })
  })

  describe("webForm is removed", () => {
    it("webForm falls through to default", () => {
      const limits = getNodeLimits("webForm", "web")
      // Should get default limits, not a specific webForm handler
      expect(limits.title).toBeUndefined()
      expect(limits.maxConnections).toBe(1)
    })
  })
})
