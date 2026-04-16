import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createListApprovedTemplatesTool,
  fetchApprovedTemplates,
} from "../list-approved-templates"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.FS_WHATSAPP_API_URL = "http://fs-wa.test"
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("createListApprovedTemplatesTool (factory)", () => {
  it("returns null when authHeader is missing", () => {
    const t = createListApprovedTemplatesTool({ publishedFlowId: "x" } as any)
    expect(t).toBeNull()
  })

  it("returns null when FS_WHATSAPP_API_URL is unset", () => {
    delete process.env.FS_WHATSAPP_API_URL
    const t = createListApprovedTemplatesTool({ authHeader: "Bearer abc" })
    expect(t).toBeNull()
  })

  it("returns null when toolContext is undefined", () => {
    expect(createListApprovedTemplatesTool(undefined)).toBeNull()
  })

  it("returns a tool object when auth + apiUrl present", () => {
    const t = createListApprovedTemplatesTool({ authHeader: "Bearer abc" })
    expect(t).not.toBeNull()
    expect(t).toHaveProperty("description")
  })
})

describe("fetchApprovedTemplates (executor)", () => {
  function mockFetchResponse(status: number, body: any) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("hits the correct URL with Authorization header", async () => {
    const fetchMock = mockFetchResponse(200, { templates: [] })

    await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates?status=APPROVED",
      { headers: { Authorization: "Bearer abc" } }
    )
  })

  it("shapes a template response into the expected payload", async () => {
    mockFetchResponse(200, {
      templates: [
        {
          id: "tpl-1",
          name: "order_confirmation",
          display_name: "Order Confirmation",
          language: "en",
          category: "UTILITY",
          header_type: "TEXT",
          body_content: "Hi {{first_name}}, order {{order_id}} is ready",
          buttons: [
            { type: "QUICK_REPLY", text: "Track" },
            { type: "URL", text: "View", url: "https://x.test/{{order_id}}" },
          ],
        },
      ],
    })

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.count).toBe(1)
    expect(result.templates[0]).toEqual({
      id: "tpl-1",
      name: "order_confirmation",
      displayName: "Order Confirmation",
      language: "en",
      category: "UTILITY",
      headerType: "TEXT",
      body: "Hi {{first_name}}, order {{order_id}} is ready",
      variables: ["first_name", "order_id"],
      buttons: [
        { type: "quick_reply", text: "Track" },
        { type: "url", text: "View", url: "https://x.test/{{order_id}}" },
      ],
    })
  })

  it("handles bare-array response (no 'templates' wrapper)", async () => {
    mockFetchResponse(200, [
      { id: "t1", name: "a", language: "en", category: "UTILITY", body_content: "hi", buttons: [] },
    ])

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.templates).toHaveLength(1)
  })

  it("unwraps fs-chat envelope {status, data: {templates}}", async () => {
    // This is the shape production fs-chat actually returns. Without
    // unwrapping, `data.templates` is undefined and the AI sees zero
    // templates even when the user has real ones. Regression guard.
    mockFetchResponse(200, {
      status: "success",
      data: {
        templates: [
          { id: "t1", name: "a", language: "en", category: "UTILITY", body_content: "hi", buttons: [] },
        ],
      },
    })

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.templates).toHaveLength(1)
    expect(result.templates[0].id).toBe("t1")
  })

  it("returns success=false on non-OK response", async () => {
    mockFetchResponse(500, { error: "boom" })
    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")
    expect(result).toEqual({ success: false, error: "HTTP 500" })
  })

  it("returns success=false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")
    expect(result).toEqual({ success: false, error: "ECONNREFUSED" })
  })

  it("omits url field for non-URL buttons", async () => {
    mockFetchResponse(200, {
      templates: [
        {
          id: "t",
          name: "x",
          language: "en",
          category: "MARKETING",
          body_content: "",
          buttons: [
            { type: "QUICK_REPLY", text: "Hi", url: undefined },
            { type: "PHONE_NUMBER", text: "Call" },
          ],
        },
      ],
    })

    const result = await fetchApprovedTemplates("http://fs-wa.test", "Bearer abc")
    if (!result.success) throw new Error("expected success")
    const btns = result.templates[0].buttons
    expect(btns[0]).not.toHaveProperty("url")
    expect(btns[1]).not.toHaveProperty("url")
  })
})
