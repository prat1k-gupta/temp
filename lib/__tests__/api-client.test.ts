import { describe, it, expect, beforeEach, vi } from "vitest"

/**
 * Test the apiClient's URL routing and envelope unwrapping logic.
 * We can't fully test the class in Node env (no window/localStorage),
 * but we can test the routing and unwrapping logic by extracting it.
 */

// Replicate the routing logic from api-client.ts for unit testing
const LOCAL_PREFIXES = ["/api/auth/", "/api/ai/", "/api/test-api", "/api/campaigns", "/api/debug"]

function getFullUrl(url: string, baseUrl: string | undefined): string {
  if (LOCAL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return url
  }
  return baseUrl ? `${baseUrl}${url}` : url
}

function unwrapEnvelope(json: any): any {
  if (json && typeof json === "object" && "status" in json && "data" in json) {
    return json.data
  }
  return json
}

describe("getFullUrl — URL routing", () => {
  const BASE = "http://localhost:8080"

  describe("routes to fs-whatsapp (prepends base URL)", () => {
    it("magic-flow project routes", () => {
      expect(getFullUrl("/api/magic-flow/projects", BASE)).toBe(`${BASE}/api/magic-flow/projects`)
      expect(getFullUrl("/api/magic-flow/projects/abc-123", BASE)).toBe(`${BASE}/api/magic-flow/projects/abc-123`)
      expect(getFullUrl("/api/magic-flow/projects/abc/draft", BASE)).toBe(`${BASE}/api/magic-flow/projects/abc/draft`)
      expect(getFullUrl("/api/magic-flow/projects/abc/versions", BASE)).toBe(`${BASE}/api/magic-flow/projects/abc/versions`)
    })

    it("template routes", () => {
      expect(getFullUrl("/api/templates", BASE)).toBe(`${BASE}/api/templates`)
      expect(getFullUrl("/api/templates/t1", BASE)).toBe(`${BASE}/api/templates/t1`)
      expect(getFullUrl("/api/templates/t1/publish", BASE)).toBe(`${BASE}/api/templates/t1/publish`)
      expect(getFullUrl("/api/templates/sync", BASE)).toBe(`${BASE}/api/templates/sync`)
    })

    it("whatsapp-flows routes", () => {
      expect(getFullUrl("/api/whatsapp-flows", BASE)).toBe(`${BASE}/api/whatsapp-flows`)
      expect(getFullUrl("/api/whatsapp-flows/wf-1", BASE)).toBe(`${BASE}/api/whatsapp-flows/wf-1`)
    })

    it("account routes", () => {
      expect(getFullUrl("/api/accounts", BASE)).toBe(`${BASE}/api/accounts`)
      expect(getFullUrl("/api/accounts/a1/test", BASE)).toBe(`${BASE}/api/accounts/a1/test`)
    })

    it("chatbot routes (used by whatsapp-api.ts)", () => {
      expect(getFullUrl("/api/chatbot/flows", BASE)).toBe(`${BASE}/api/chatbot/flows`)
      expect(getFullUrl("/api/chatbot/flows/f1", BASE)).toBe(`${BASE}/api/chatbot/flows/f1`)
      expect(getFullUrl("/api/chatbot/settings", BASE)).toBe(`${BASE}/api/chatbot/settings`)
    })
  })

  describe("keeps on Next.js (no base URL prefix)", () => {
    it("auth routes stay local", () => {
      expect(getFullUrl("/api/auth/login", BASE)).toBe("/api/auth/login")
      expect(getFullUrl("/api/auth/register", BASE)).toBe("/api/auth/register")
      expect(getFullUrl("/api/auth/refresh", BASE)).toBe("/api/auth/refresh")
      expect(getFullUrl("/api/auth/me", BASE)).toBe("/api/auth/me")
    })

    it("AI routes stay local", () => {
      expect(getFullUrl("/api/ai/flow-assistant", BASE)).toBe("/api/ai/flow-assistant")
      expect(getFullUrl("/api/ai/suggest-nodes", BASE)).toBe("/api/ai/suggest-nodes")
      expect(getFullUrl("/api/ai/improve-copy", BASE)).toBe("/api/ai/improve-copy")
      expect(getFullUrl("/api/ai/generate-buttons", BASE)).toBe("/api/ai/generate-buttons")
      expect(getFullUrl("/api/ai/shorten-text", BASE)).toBe("/api/ai/shorten-text")
      expect(getFullUrl("/api/ai/generate-template", BASE)).toBe("/api/ai/generate-template")
    })

    it("test-api stays local", () => {
      expect(getFullUrl("/api/test-api", BASE)).toBe("/api/test-api")
    })

    it("campaigns stays local", () => {
      expect(getFullUrl("/api/campaigns/create", BASE)).toBe("/api/campaigns/create")
    })

    it("debug stays local", () => {
      expect(getFullUrl("/api/debug/ai-logs", BASE)).toBe("/api/debug/ai-logs")
    })
  })

  describe("edge cases", () => {
    it("returns url as-is when base URL is undefined", () => {
      expect(getFullUrl("/api/magic-flow/projects", undefined)).toBe("/api/magic-flow/projects")
    })

    it("returns url as-is when base URL is empty string", () => {
      expect(getFullUrl("/api/magic-flow/projects", "")).toBe("/api/magic-flow/projects")
    })

    it("handles production URLs", () => {
      const prod = "https://fschat.freestand.in"
      expect(getFullUrl("/api/magic-flow/projects", prod)).toBe(`${prod}/api/magic-flow/projects`)
    })

    it("handles ngrok URLs", () => {
      const ngrok = "https://randomly-learning-worm.ngrok-free.app"
      expect(getFullUrl("/api/templates", ngrok)).toBe(`${ngrok}/api/templates`)
    })
  })
})

describe("unwrapEnvelope — response envelope handling", () => {
  it("unwraps fs-whatsapp success envelope", () => {
    const envelope = {
      status: "success",
      data: { projects: [{ id: "1", name: "Flow" }] },
    }
    expect(unwrapEnvelope(envelope)).toEqual({ projects: [{ id: "1", name: "Flow" }] })
  })

  it("unwraps error envelope", () => {
    const envelope = {
      status: "error",
      data: null,
      message: "Not found",
    }
    expect(unwrapEnvelope(envelope)).toBeNull()
  })

  it("passes through non-envelope responses unchanged", () => {
    const plain = { id: "1", name: "Flow" }
    expect(unwrapEnvelope(plain)).toEqual({ id: "1", name: "Flow" })
  })

  it("passes through arrays unchanged", () => {
    const arr = [{ id: "1" }, { id: "2" }]
    expect(unwrapEnvelope(arr)).toEqual(arr)
  })

  it("passes through null/undefined unchanged", () => {
    expect(unwrapEnvelope(null)).toBeNull()
    expect(unwrapEnvelope(undefined)).toBeUndefined()
  })

  it("passes through strings unchanged", () => {
    expect(unwrapEnvelope("ok")).toBe("ok")
  })

  it("unwraps when data is an empty object", () => {
    const envelope = { status: "success", data: {} }
    expect(unwrapEnvelope(envelope)).toEqual({})
  })

  it("unwraps when data is an array", () => {
    const envelope = { status: "success", data: [1, 2, 3] }
    expect(unwrapEnvelope(envelope)).toEqual([1, 2, 3])
  })

  it("does NOT unwrap objects that only have status but no data", () => {
    const noData = { status: "success", message: "ok" }
    expect(unwrapEnvelope(noData)).toEqual(noData)
  })
})
