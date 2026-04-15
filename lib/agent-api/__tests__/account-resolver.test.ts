import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getActingAccount } from "@/lib/agent-api/account-resolver"
import { AgentError } from "@/lib/agent-api/errors"

describe("getActingAccount", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns the first account normalized to our Account shape", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [
            { id: "acc_1", name: "Acme Main", phone_number: "+919876543210", status: "active", has_access_token: true },
            { id: "acc_2", name: "Second", phone_number: "+919988776655", status: "active", has_access_token: true },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const account = await getActingAccount("whm_abc")
    expect(account).toEqual({
      id: "acc_1",
      name: "Acme Main",
      phone_number: "+919876543210",
      connected_channels: ["whatsapp"],
    })
  })

  it("forwards X-API-Key header on the fetch call", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ accounts: [{ id: "a", name: "n", status: "active", has_access_token: true }] }), {
        status: 200,
      }),
    )
    await getActingAccount("whm_abc")
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("throws unauthorized AgentError when fs-whatsapp returns 401", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("", { status: 401 }))
    await expect(getActingAccount("whm_bad")).rejects.toMatchObject({
      name: "AgentError",
      code: "unauthorized",
    })
  })

  it("throws no_account_configured when accounts list is empty", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ accounts: [] }), { status: 200 }))
    await expect(getActingAccount("whm_abc")).rejects.toMatchObject({
      name: "AgentError",
      code: "no_account_configured",
    })
  })

  it("throws internal_error when fs-whatsapp returns non-401 failure status", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("oops", { status: 500 }))
    await expect(getActingAccount("whm_abc")).rejects.toMatchObject({
      name: "AgentError",
      code: "internal_error",
    })
  })

  it("throws internal_error when the fetch itself rejects (network error)", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(getActingAccount("whm_abc")).rejects.toMatchObject({
      name: "AgentError",
      code: "internal_error",
    })
  })

  it("propagates an undefined phone_number when the field is omitted", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [{ id: "a", name: "n", status: "active", has_access_token: true }],
        }),
        { status: 200 },
      ),
    )
    const account = await getActingAccount("whm_abc")
    expect(account.phone_number).toBeUndefined()
  })
})
