import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST } from "../route"
import { POST as startPOST } from "../../campaigns/[campaign_id]/start/route"
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

const validCampaignBody = {
  name: "Summer Sale",
  flow_id: "550e8400-e29b-41d4-a716-446655440000",
  account_name: "default",
  audience_source: "contacts",
  audience_config: { channel: "whatsapp", filter: {} },
}

describe("GET /api/v1/campaigns", () => {
  it("forwards status filter to fs-whatsapp", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({ ok: true, status: 200, data: { campaigns: [] } })
    const req = new Request("http://localhost/api/v1/campaigns?status=scheduled", {
      headers: { "X-API-Key": "whm_x" },
    })
    await GET(req)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls[0][0].query?.status).toBe("scheduled")
  })

  it("rejects invalid status enum with 400", async () => {
    const req = new Request("http://localhost/api/v1/campaigns?status=BOGUS", {
      headers: { "X-API-Key": "whm_x" },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})

// POST /v1/campaigns resolves body.flow_id (magic_flow_projects.id) to
// published_flow_id (chatbot_flows.id) via a preflight GET to
// /api/magic-flow/projects/{id} before forwarding to /api/campaigns.
const RUNTIME_FLOW_ID = "0a479bc1-9633-4548-b0d1-ef218e349d9b"

type ProxyResult = Awaited<ReturnType<typeof proxyToFsWhatsApp>>

function mockProjectThenCampaign(campaignResult: ProxyResult) {
  // 1st call: project lookup. 2nd call: /api/campaigns.
  vi.mocked(proxyToFsWhatsApp)
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { project: { published_flow_id: RUNTIME_FLOW_ID } },
    })
    .mockResolvedValueOnce(campaignResult)
}

describe("POST /api/v1/campaigns", () => {
  it("resolves project flow_id to published_flow_id before forwarding", async () => {
    mockProjectThenCampaign({
      ok: true,
      status: 200,
      data: { id: "cmp_1", platform_url: "https://app.test/campaigns/cmp_1", warnings: [] },
    })
    const req = new Request("http://localhost/api/v1/campaigns", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify(validCampaignBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const calls = vi.mocked(proxyToFsWhatsApp).mock.calls
    expect(calls[0][0].path).toBe(`/api/magic-flow/projects/${validCampaignBody.flow_id}`)
    expect(calls[1][0].path).toBe("/api/campaigns")
    expect((calls[1][0].body as { flow_id: string }).flow_id).toBe(RUNTIME_FLOW_ID)
  })

  it("returns 400 flow_not_published when the project has no published_flow_id", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { project: { published_flow_id: null } },
    })
    const req = new Request("http://localhost/api/v1/campaigns", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify(validCampaignBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("flow_not_published")
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls).toHaveLength(1)
  })

  it("propagates upstream project-lookup errors (e.g. 404 flow_not_found)", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: { code: "flow_not_found", message: "Flow not found" },
    })
    const req = new Request("http://localhost/api/v1/campaigns", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify(validCampaignBody),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe("flow_not_found")
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls).toHaveLength(1)
  })

  it("preserves warnings[] from fs-whatsapp in the response", async () => {
    mockProjectThenCampaign({
      ok: true,
      status: 200,
      data: {
        id: "cmp_1",
        platform_url: "https://app.test/campaigns/cmp_1",
        warnings: [{ code: "first_message_not_template", message: "..." }],
      },
      warnings: [{ code: "first_message_not_template", message: "..." }],
    })
    const req = new Request("http://localhost/api/v1/campaigns", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify(validCampaignBody),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0].code).toBe("first_message_not_template")
  })

  it("rejects missing required fields with 400", async () => {
    const req = new Request("http://localhost/api/v1/campaigns", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Missing fields" }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    // Schema validation happens before any proxy call
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls).toHaveLength(0)
  })
})

describe("POST /api/v1/campaigns/:id/start", () => {
  it("passes through 409 campaign_materializing from fs-whatsapp", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: false,
      status: 409,
      error: { code: "campaign_materializing", message: "Campaign is still materializing recipients" },
    })
    const req = new Request("http://localhost/api/v1/campaigns/cmp_1/start", {
      method: "POST",
      headers: { "X-API-Key": "whm_x" },
    })
    const res = await startPOST(req)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("campaign_materializing")
  })
})
