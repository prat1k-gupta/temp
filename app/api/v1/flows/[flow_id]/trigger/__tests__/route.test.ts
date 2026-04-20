import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "../route"
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

describe("POST /api/v1/flows/:id/trigger", () => {
  it("rejects invalid phone format with 400", async () => {
    const req = new Request("http://localhost/api/v1/flows/flow_1/trigger", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "not-a-phone" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("forwards trigger to fs-whatsapp on valid phone", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true,
      status: 200,
      data: { triggered: true },
    })
    const req = new Request("http://localhost/api/v1/flows/flow_1/trigger", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+919876543210" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls[0][0].path).toContain("/trigger")
  })
})
