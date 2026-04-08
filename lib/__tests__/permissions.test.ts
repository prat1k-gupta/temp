import { describe, it, expect } from "vitest"
import { canAccess, DEFAULT_ROLE_FEATURES, FEATURES, type Role } from "../permissions"

describe("canAccess", () => {
  it("returns true for exact match", () => {
    expect(canAccess(["flows", "chat"], "flows")).toBe(true)
  })

  it("returns false when feature not in permissions", () => {
    expect(canAccess(["chat"], "flows")).toBe(false)
  })

  it("returns true for sub-feature when parent module is granted", () => {
    expect(canAccess(["flows"], "flows.publish")).toBe(true)
    expect(canAccess(["flows"], "flows.delete")).toBe(true)
  })

  it("returns false for sub-feature when only sibling is granted", () => {
    expect(canAccess(["flows.view"], "flows.publish")).toBe(false)
  })

  it("returns false for parent when only sub-feature is granted", () => {
    expect(canAccess(["flows.view"], "flows")).toBe(false)
  })

  it("returns false for empty permissions", () => {
    expect(canAccess([], "flows")).toBe(false)
  })

  it("handles flat feature names correctly", () => {
    expect(canAccess(["users"], "users")).toBe(true)
    expect(canAccess(["users"], "api-keys")).toBe(false)
  })
})

describe("DEFAULT_ROLE_FEATURES", () => {
  it("admin has all features", () => {
    for (const feature of FEATURES) {
      expect(canAccess(DEFAULT_ROLE_FEATURES.admin, feature)).toBe(true)
    }
  })

  it("agent only has chat and contacts", () => {
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "chat")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "contacts")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "flows")).toBe(false)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "templates")).toBe(false)
    expect(canAccess(DEFAULT_ROLE_FEATURES.agent, "users")).toBe(false)
  })

  it("manager has flows but not users", () => {
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "flows")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "chat")).toBe(true)
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "users")).toBe(false)
    expect(canAccess(DEFAULT_ROLE_FEATURES.manager, "api-keys")).toBe(false)
  })

  it("unknown role falls back to empty array", () => {
    const permissions = DEFAULT_ROLE_FEATURES["flow-designer" as Role] ?? []
    expect(permissions).toEqual([])
    expect(canAccess(permissions, "flows")).toBe(false)
  })
})
