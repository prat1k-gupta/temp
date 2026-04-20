import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, PATCH, DELETE } from "../route"
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

const FLOW_ID = "a7dd810f-5ee5-4173-8c9d-81f55604a300"

function req(method: "GET" | "PATCH" | "DELETE", body?: unknown) {
  return new Request(`http://localhost/api/v1/flows/${FLOW_ID}`, {
    method,
    headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe("GET /api/v1/flows/:id", () => {
  it("forwards to fs-whatsapp project fetch", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true,
      status: 200,
      data: { project: { id: FLOW_ID, name: "Pedigree" } },
    })
    const res = await GET(req("GET"))
    expect(res.status).toBe(200)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls[0][0].path).toBe(
      `/api/magic-flow/projects/${FLOW_ID}`,
    )
  })
})

describe("PATCH /api/v1/flows/:id", () => {
  it("forwards a single-field name update to fs-whatsapp PUT", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true,
      status: 200,
      data: { project: { id: FLOW_ID, name: "New Name" } },
    })
    const res = await PATCH(req("PATCH", { name: "New Name" }))
    expect(res.status).toBe(200)
    const call = vi.mocked(proxyToFsWhatsApp).mock.calls[0][0]
    expect(call.method).toBe("PUT")
    expect(call.path).toBe(`/api/magic-flow/projects/${FLOW_ID}`)
    expect(call.body).toEqual({ name: "New Name" })
  })

  it("accepts all six fields together and forwards them", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({ ok: true, status: 200, data: {} })
    const body = {
      name: "n",
      description: "d",
      trigger_keywords: ["offer", "deal"],
      trigger_match_type: "exact" as const,
      trigger_ref: "summer-2025",
      is_enabled: false,
    }
    const res = await PATCH(req("PATCH", body))
    expect(res.status).toBe(200)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls[0][0].body).toEqual(body)
  })

  it("rejects an empty body with 400", async () => {
    const res = await PATCH(req("PATCH", {}))
    expect(res.status).toBe(400)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls).toHaveLength(0)
  })

  it("rejects unknown trigger_match_type enum with 400", async () => {
    const res = await PATCH(req("PATCH", { trigger_match_type: "regex" }))
    expect(res.status).toBe(400)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls).toHaveLength(0)
  })

  it("rejects trigger_keywords over the 20-item cap with 400", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `kw${i}`)
    const res = await PATCH(req("PATCH", { trigger_keywords: tooMany }))
    expect(res.status).toBe(400)
  })

  it("propagates upstream 404 (flow not found)", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: false,
      status: 404,
      error: { code: "flow_not_found", message: "Project not found" },
    })
    const res = await PATCH(req("PATCH", { name: "x" }))
    expect(res.status).toBe(404)
    const j = await res.json()
    expect(j.code).toBe("flow_not_found")
  })

  it("accepts the 4 match_type variants", async () => {
    for (const match of ["exact", "contains_whole_word", "contains", "starts_with"] as const) {
      vi.mocked(proxyToFsWhatsApp).mockResolvedValue({ ok: true, status: 200, data: {} })
      const res = await PATCH(req("PATCH", { trigger_match_type: match }))
      expect(res.status).toBe(200)
    }
  })
})

describe("DELETE /api/v1/flows/:id", () => {
  it("returns 204 on success", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({ ok: true, status: 204, data: null })
    const res = await DELETE(req("DELETE"))
    expect(res.status).toBe(204)
  })
})
