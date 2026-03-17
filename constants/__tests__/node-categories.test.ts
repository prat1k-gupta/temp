import { describe, it, expect } from "vitest"
import {
  NODE_CATEGORIES,
  NODE_TEMPLATES,
  getNodesByCategory,
  getAllCategories,
  type NodeTemplate,
} from "../node-categories"

describe("NODE_CATEGORIES", () => {
  it("has all expected categories", () => {
    expect(NODE_CATEGORIES.information).toBeDefined()
    expect(NODE_CATEGORIES.interaction).toBeDefined()
    expect(NODE_CATEGORIES.logic).toBeDefined()
    expect(NODE_CATEGORIES.fulfillment).toBeDefined()
    expect(NODE_CATEGORIES.integration).toBeDefined()
  })

  it("each category has label, description, and icon", () => {
    Object.values(NODE_CATEGORIES).forEach((cat) => {
      expect(cat.label).toBeDefined()
      expect(cat.description).toBeDefined()
      expect(cat.icon).toBeDefined()
    })
  })
})

describe("NODE_TEMPLATES", () => {
  it("has at least 20 templates", () => {
    expect(NODE_TEMPLATES.length).toBeGreaterThanOrEqual(20)
  })

  it("every template has required fields", () => {
    NODE_TEMPLATES.forEach((template) => {
      expect(template.type).toBeDefined()
      expect(template.icon).toBeDefined()
      expect(template.label).toBeDefined()
      expect(template.description).toBeDefined()
      expect(template.category).toBeDefined()
      expect(template.platforms).toBeDefined()
      expect(template.platforms.length).toBeGreaterThan(0)
    })
  })

  it("every template category exists in NODE_CATEGORIES", () => {
    const validCategories = Object.keys(NODE_CATEGORIES)
    NODE_TEMPLATES.forEach((template) => {
      expect(validCategories).toContain(template.category)
    })
  })

  it("every platform value is valid", () => {
    const validPlatforms = ["web", "whatsapp", "instagram"]
    NODE_TEMPLATES.forEach((template) => {
      template.platforms.forEach((p) => {
        expect(validPlatforms).toContain(p)
      })
    })
  })

  it("has no duplicate template types", () => {
    const types = NODE_TEMPLATES.map((t) => t.type)
    expect(new Set(types).size).toBe(types.length)
  })

  it("does NOT contain instagramList type", () => {
    const types = NODE_TEMPLATES.map((t) => t.type)
    expect(types).not.toContain("instagramList")
  })

  it("does NOT contain whatsappList type (renamed to interactiveList)", () => {
    const types = NODE_TEMPLATES.map((t) => t.type)
    expect(types).not.toContain("whatsappList")
  })

  it("contains interactiveList type", () => {
    const types = NODE_TEMPLATES.map((t) => t.type)
    expect(types).toContain("interactiveList")
  })

  it("interactiveList is WhatsApp only", () => {
    const listTemplate = NODE_TEMPLATES.find((t) => t.type === "interactiveList")
    expect(listTemplate).toBeDefined()
    expect(listTemplate!.platforms).toEqual(["whatsapp"])
  })

  it("name/email/dob/address are flow templates in 'template' category", () => {
    const templateTypes = ["name", "email", "dob", "address"]
    templateTypes.forEach((type) => {
      const template = NODE_TEMPLATES.find((t) => t.type === type)
      expect(template).toBeDefined()
      expect(template?.category).toBe("template")
    })
  })

  it("dob description mentions validation", () => {
    const dob = NODE_TEMPLATES.find((t) => t.type === "dob")
    expect(dob?.description).toContain("validate")
  })
})

describe("getNodesByCategory", () => {
  it("returns only interaction nodes for interaction category", () => {
    const nodes = getNodesByCategory("interaction", "web")
    nodes.forEach((n) => {
      expect(n.category).toBe("interaction")
    })
  })

  it("filters by platform", () => {
    const whatsappNodes = getNodesByCategory("interaction", "whatsapp")
    whatsappNodes.forEach((n) => {
      expect(n.platforms).toContain("whatsapp")
    })
  })

  it("includes interactiveList for whatsapp", () => {
    const nodes = getNodesByCategory("interaction", "whatsapp")
    const types = nodes.map((n) => n.type)
    expect(types).toContain("interactiveList")
  })

  it("excludes interactiveList for web", () => {
    const nodes = getNodesByCategory("interaction", "web")
    const types = nodes.map((n) => n.type)
    expect(types).not.toContain("interactiveList")
  })

  it("returns empty array for invalid category", () => {
    expect(getNodesByCategory("nonexistent", "web")).toEqual([])
  })
})

describe("getAllCategories", () => {
  it("returns all categories with keys", () => {
    const categories = getAllCategories()
    expect(categories.length).toBe(Object.keys(NODE_CATEGORIES).length)
    categories.forEach((cat) => {
      expect(cat.key).toBeDefined()
      expect(cat.label).toBeDefined()
    })
  })
})
