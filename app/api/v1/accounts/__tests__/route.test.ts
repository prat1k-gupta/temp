import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
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

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/accounts", {
    method: "GET",
    headers,
  })
}

describe("GET /api/v1/accounts", () => {
  it("returns 401 without X-API-Key", async () => {
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it("forwards to fs-whatsapp /api/accounts and returns the data", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true,
      status: 200,
      data: { accounts: [{ id: "a_1", name: "Account 1", platform_url: "https://app.test/accounts/a_1" }] },
    })

    const res = await GET(makeRequest({ "X-API-Key": "whm_test_xyz" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0].platform_url).toContain("/accounts/a_1")
  })
})
