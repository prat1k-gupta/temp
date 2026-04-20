import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST } from "../route"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

vi.mock("@/lib/agent-api/proxy")
vi.mock("@/lib/agent-api/account-resolver", () => ({
  getActingAccount: vi.fn().mockResolvedValue({
    id: "acc_1",
    name: "Acme",
    phone_number: "+919876543210",
    connected_channels: ["whatsapp"],
  }),
}))

import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

beforeEach(() => {
  vi.mocked(proxyToFsWhatsApp).mockReset()
  __resetRateLimitForTests()
})

const validBody = {
  name: "test_template",
  language: "en_US",
  category: "UTILITY",
  components: [{ type: "BODY", text: "Hello {{1}}" }],
  account_name: "default",
}

describe("GET /api/v1/templates", () => {
  it("forwards status filter to fs-whatsapp", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({ ok: true, status: 200, data: { templates: [] } })
    const req = new Request("http://localhost/api/v1/templates?status=APPROVED", {
      headers: { "X-API-Key": "whm_x" },
    })
    await GET(req)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls[0][0].query?.status).toBe("APPROVED")
  })

  it("rejects invalid status enum with 400", async () => {
    const req = new Request("http://localhost/api/v1/templates?status=BOGUS", {
      headers: { "X-API-Key": "whm_x" },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})

describe("POST /api/v1/templates", () => {
  it("validates body shape, forwards on success", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true, status: 201,
      data: { id: "tpl_new", name: "test_template", platform_url: "https://app/templates/tpl_new" },
    })
    const req = new Request("http://localhost/api/v1/templates", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })

  it("rejects invalid name regex with 400", async () => {
    const req = new Request("http://localhost/api/v1/templates", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, name: "BAD-NAME-WITH-DASHES" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
