import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock localStorage
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value
  },
  removeItem: (key: string) => {
    delete storage[key]
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k])
  },
}
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock })

// Mock window so typeof window !== "undefined" checks pass
if (typeof globalThis.window === "undefined") {
  ;(globalThis as any).window = globalThis
}

// Mock document.cookie
let cookieValue = ""
Object.defineProperty(globalThis, "document", {
  value: {
    get cookie() {
      return cookieValue
    },
    set cookie(val: string) {
      cookieValue = val
    },
  },
})

// Import after mocks are set up
import {
  setTokens,
  getAccessToken,
  getRefreshToken,
  clearAuth,
  isAuthenticated,
  getUser,
  setUser,
  type AuthUser,
} from "../auth"

describe("auth", () => {
  beforeEach(() => {
    localStorageMock.clear()
    cookieValue = ""
  })

  describe("setTokens / getAccessToken / getRefreshToken", () => {
    it("stores and retrieves tokens", () => {
      setTokens("access-123", "refresh-456")

      expect(getAccessToken()).toBe("access-123")
      expect(getRefreshToken()).toBe("refresh-456")
    })

    it("sets the auth cookie", () => {
      setTokens("tok", "ref")

      expect(cookieValue).toContain("mf_access_token=tok")
      expect(cookieValue).toContain("path=/")
      expect(cookieValue).toContain("SameSite=Lax")
    })
  })

  describe("clearAuth", () => {
    it("removes tokens and user from localStorage", () => {
      setTokens("a", "b")
      setUser({ id: "1", email: "x@y.com", full_name: "X", role: "admin", organization_id: "org1" })

      clearAuth()

      expect(getAccessToken()).toBeNull()
      expect(getRefreshToken()).toBeNull()
      expect(getUser()).toBeNull()
    })

    it("clears the auth cookie", () => {
      setTokens("a", "b")
      clearAuth()

      expect(cookieValue).toContain("max-age=0")
    })
  })

  describe("isAuthenticated", () => {
    it("returns false when no token", () => {
      expect(isAuthenticated()).toBe(false)
    })

    it("returns true when token exists", () => {
      setTokens("token", "refresh")
      expect(isAuthenticated()).toBe(true)
    })

    it("returns false after clearAuth", () => {
      setTokens("token", "refresh")
      clearAuth()
      expect(isAuthenticated()).toBe(false)
    })
  })

  describe("getUser / setUser", () => {
    it("stores and retrieves user", () => {
      const user: AuthUser = {
        id: "u1",
        email: "test@example.com",
        full_name: "Test User",
        role: "admin",
        organization_id: "org1",
        organization_name: "Test Org",
      }
      setUser(user)

      const retrieved = getUser()
      expect(retrieved).toEqual(user)
    })

    it("returns null when no user stored", () => {
      expect(getUser()).toBeNull()
    })
  })
})
