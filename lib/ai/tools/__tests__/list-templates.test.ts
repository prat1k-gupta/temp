import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  createListTemplatesTool,
  fetchTemplates,
} from "../list-templates"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.FS_WHATSAPP_API_URL = "http://fs-wa.test"
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("createListTemplatesTool (factory)", () => {
  it("returns null when authHeader is missing", () => {
    const t = createListTemplatesTool({ publishedFlowId: "x" } as any)
    expect(t).toBeNull()
  })

  it("returns null when FS_WHATSAPP_API_URL is unset", () => {
    delete process.env.FS_WHATSAPP_API_URL
    const t = createListTemplatesTool({ authHeader: "Bearer abc" })
    expect(t).toBeNull()
  })

  it("returns null when toolContext is undefined", () => {
    expect(createListTemplatesTool(undefined)).toBeNull()
  })

  it("returns a tool object when auth + apiUrl present", () => {
    const t = createListTemplatesTool({ authHeader: "Bearer abc" })
    expect(t).not.toBeNull()
    expect(t).toHaveProperty("description")
  })
})

describe("fetchTemplates (executor)", () => {
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

  it("defaults to APPROVED status with Authorization header", async () => {
    const fetchMock = mockFetchResponse(200, { templates: [] })

    await fetchTemplates("http://fs-wa.test", "Bearer abc")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates?status=APPROVED",
      { headers: { Authorization: "Bearer abc" } }
    )
  })

  it("honours an explicit status filter (REJECTED)", async () => {
    const fetchMock = mockFetchResponse(200, { templates: [] })

    await fetchTemplates("http://fs-wa.test", "Bearer abc", "REJECTED")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates?status=REJECTED",
      { headers: { Authorization: "Bearer abc" } }
    )
  })

  it("sends X-API-Key header (not Authorization) when authHeader starts with whm_", async () => {
    const fetchMock = mockFetchResponse(200, { templates: [] })

    await fetchTemplates("http://fs-wa.test", "whm_secret123")

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toHaveProperty("X-API-Key", "whm_secret123")
    expect(init.headers).not.toHaveProperty("Authorization")
  })

  it("shapes a template response with status + rejectionReason", async () => {
    mockFetchResponse(200, {
      templates: [
        {
          id: "tpl-1",
          name: "sofa_sale",
          display_name: "Sofa Sale",
          language: "en",
          category: "MARKETING",
          status: "REJECTED",
          rejection_reason: "INVALID_FORMAT",
          header_type: "TEXT",
          body_content: "Hi {{first_name}}",
          buttons: [],
        },
      ],
    })

    const result = await fetchTemplates("http://fs-wa.test", "Bearer abc", "REJECTED")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.templates[0]).toMatchObject({
      id: "tpl-1",
      status: "REJECTED",
      rejectionReason: "INVALID_FORMAT",
    })
  })

  it("omits rejectionReason when template has none", async () => {
    mockFetchResponse(200, {
      templates: [
        { id: "t", name: "x", language: "en", category: "UTILITY", status: "APPROVED", body_content: "hi", buttons: [] },
      ],
    })
    const result = await fetchTemplates("http://fs-wa.test", "Bearer abc")
    if (!result.success) throw new Error("expected success")
    expect(result.templates[0]).not.toHaveProperty("rejectionReason")
  })

  it("unwraps fs-chat envelope {status, data: {templates}}", async () => {
    mockFetchResponse(200, {
      status: "success",
      data: {
        templates: [
          { id: "t1", name: "a", language: "en", category: "UTILITY", status: "APPROVED", body_content: "hi", buttons: [] },
        ],
      },
    })

    const result = await fetchTemplates("http://fs-wa.test", "Bearer abc")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.templates).toHaveLength(1)
    expect(result.templates[0].id).toBe("t1")
  })

  it("returns success=false on non-OK response", async () => {
    mockFetchResponse(500, { error: "boom" })
    const result = await fetchTemplates("http://fs-wa.test", "Bearer abc")
    expect(result).toEqual({ success: false, error: "HTTP 500" })
  })

  it("returns success=false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    const result = await fetchTemplates("http://fs-wa.test", "Bearer abc")
    expect(result).toEqual({ success: false, error: "ECONNREFUSED" })
  })
})
