import { describe, it, expect, vi, beforeEach } from "vitest"
import { proxyToFsWhatsApp } from "../proxy"

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch)
  mockFetch.mockReset()
})

describe("proxyToFsWhatsApp", () => {
  it("forwards X-API-Key from the caller", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: "success", data: { ok: true } }), { status: 200 }))

    await proxyToFsWhatsApp({
      apiKey: "whm_test_123",
      method: "GET",
      path: "/api/templates",
    })

    const init = mockFetch.mock.calls[0][1]
    expect(init.headers["X-API-Key"]).toBe("whm_test_123")
  })

  it("returns the unwrapped data envelope on 2xx", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: "success", data: { id: "tpl_1", name: "X" } }), { status: 200 }))

    const result = await proxyToFsWhatsApp({
      apiKey: "whm_x",
      method: "GET",
      path: "/api/templates/tpl_1",
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ id: "tpl_1", name: "X" })
  })

  it("preserves status code and message on error envelope", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      status: "error",
      message: "Campaign is still materializing recipients — try again shortly",
      data: { code: "campaign_materializing" },
    }), { status: 409 }))

    const result = await proxyToFsWhatsApp({
      apiKey: "whm_x",
      method: "POST",
      path: "/api/campaigns/c_1/start",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(result.error?.code).toBe("campaign_materializing")
    expect(result.error?.message).toContain("materializing")
  })
})
