import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createTemplateCrudTools } from "../template-crud"

const ORIGINAL_ENV = { ...process.env }

const validCreateInput = {
  name: "valid_name",
  display_name: "Valid",
  language: "en",
  category: "MARKETING" as const,
  header_type: "none" as const,
  body: "Hi {{customer_name}}, order {{order_id}}",
  sample_values: { customer_name: "John", order_id: "ORD-1" },
}

function mockFetch(status: number, body: any) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  process.env.FS_WHATSAPP_API_URL = "http://fs-wa.test"
  vi.restoreAllMocks()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("createTemplateCrudTools — auth gating", () => {
  it("returns error-stubs when authHeader is missing", async () => {
    const tools = createTemplateCrudTools({ publishedFlowId: "x" } as any)
    const result = await (tools.create_template.execute as any)(validCreateInput)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Authentication/)
  })

  it("returns error-stubs when FS_WHATSAPP_API_URL is unset", async () => {
    delete process.env.FS_WHATSAPP_API_URL
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc" })
    const result = await (tools.create_template.execute as any)(validCreateInput)
    expect(result.success).toBe(false)
  })
})

describe("create_template", () => {
  it("refuses when no whatsapp account is in toolContext", async () => {
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc" })
    const result = await (tools.create_template.execute as any)(validCreateInput)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/account/i)
  })

  it("rejects input that fails the shared zod schema (no samples for variables)", async () => {
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    const result = await (tools.create_template.execute as any)({
      ...validCreateInput,
      sample_values: { customer_name: "John" }, // missing order_id
    })
    expect(result.success).toBe(false)
    expect(result.issues?.join(" ")).toMatch(/order_id/)
  })

  it("POSTs the payload built from the form input", async () => {
    const fetchMock = mockFetch(200, { status: "success", data: { id: "tpl-123", name: "valid_name", status: "DRAFT" } })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })

    const result = await (tools.create_template.execute as any)(validCreateInput)

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer abc",
          "Content-Type": "application/json",
        }),
      }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.whatsapp_account).toBe("Test WA")
    expect(body.body_content).toBe("Hi {{customer_name}}, order {{order_id}}")
    expect(body.sample_values).toContainEqual({ component: "body", param_name: "customer_name", value: "John" })
    expect(result).toEqual({ success: true, id: "tpl-123", name: "valid_name", status: "DRAFT" })
  })

  it("uses X-API-Key header when auth is a whm_ key", async () => {
    const fetchMock = mockFetch(200, { status: "success", data: { id: "1", name: "x", status: "DRAFT" } })
    const tools = createTemplateCrudTools({ authHeader: "whm_abc", waAccountName: "Test WA" })
    await (tools.create_template.execute as any)(validCreateInput)
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "X-API-Key": "whm_abc" })
  })

  it("surfaces backend validation issues when the API returns them", async () => {
    const fetchMock = mockFetch(400, { status: "error", data: ["name: Template name is required"], message: "Template validation failed" })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    const result = await (tools.create_template.execute as any)(validCreateInput)
    expect(fetchMock).toHaveBeenCalled()
    expect(result.success).toBe(false)
    // unwrap returns the data array; the tool captures it into issues
    expect(result.issues).toEqual(["name: Template name is required"])
  })
})

describe("update_template", () => {
  it("PUTs to /api/templates/{id} with the merged payload", async () => {
    const fetchMock = mockFetch(200, { status: "success", data: { id: "tpl-123", status: "DRAFT" } })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })

    const result = await (tools.update_template.execute as any)({
      ...validCreateInput,
      id: "tpl-123",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates/tpl-123",
      expect.objectContaining({ method: "PUT" }),
    )
    expect(result).toEqual({ success: true, id: "tpl-123", status: "DRAFT" })
  })
})

describe("submit_template", () => {
  it("POSTs to /{id}/publish and returns PENDING on success", async () => {
    const fetchMock = mockFetch(200, { status: "success" })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    const result = await (tools.submit_template.execute as any)({ id: "tpl-123" })
    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates/tpl-123/publish",
      expect.objectContaining({ method: "POST" }),
    )
    expect(result).toEqual({ success: true, status: "PENDING" })
  })
})

describe("get_template", () => {
  it("returns the template with status + rejection_reason", async () => {
    mockFetch(200, {
      status: "success",
      data: {
        id: "tpl-123",
        name: "x",
        status: "REJECTED",
        rejection_reason: "INVALID_FORMAT",
        header_type: "TEXT",
        header_content: "hi",
        body_content: "hello",
        footer_content: "",
        buttons: [],
        sample_values: [],
        language: "en",
        category: "MARKETING",
      },
    })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    const result = await (tools.get_template.execute as any)({ id: "tpl-123" })
    expect(result).toMatchObject({
      success: true,
      id: "tpl-123",
      status: "REJECTED",
      rejection_reason: "INVALID_FORMAT",
      body: "hello",
    })
  })
})

describe("sync_templates", () => {
  it("POSTs to /sync with the account from context when caller omits one", async () => {
    const fetchMock = mockFetch(200, { status: "success", data: { count: 5, message: "Synced 5 templates" } })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    const result = await (tools.sync_templates.execute as any)({})
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.whatsapp_account).toBe("Test WA")
    expect(result).toMatchObject({ success: true, count: 5 })
  })

  it("lets caller override the account", async () => {
    const fetchMock = mockFetch(200, { status: "success", data: { count: 0 } })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    await (tools.sync_templates.execute as any)({ account: "Another WA" })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.whatsapp_account).toBe("Another WA")
  })
})

describe("delete_template", () => {
  it("DELETEs /{id}", async () => {
    const fetchMock = mockFetch(200, { status: "success" })
    const tools = createTemplateCrudTools({ authHeader: "Bearer abc", waAccountName: "Test WA" })
    const result = await (tools.delete_template.execute as any)({ id: "tpl-123" })
    expect(fetchMock).toHaveBeenCalledWith(
      "http://fs-wa.test/api/templates/tpl-123",
      expect.objectContaining({ method: "DELETE" }),
    )
    expect(result).toEqual({ success: true })
  })
})
