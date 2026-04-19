// @vitest-environment jsdom
import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Hoisted so vi.mock below can reach them.
const { subscribe, unsubscribe } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock("@/hooks/use-websocket", () => ({
  useWebSocket: () => ({ subscribe }),
}))

import { useCampaignMaterializationSubscription } from "../use-campaign-materialization-subscription"
import { campaignKeys } from "@/hooks/queries/use-campaigns"

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

describe("useCampaignMaterializationSubscription", () => {
  beforeEach(() => {
    subscribe.mockReset()
    unsubscribe.mockReset()
    // Every subscribe call returns the same unsubscribe fn so we can assert on it.
    subscribe.mockImplementation(() => unsubscribe)
  })

  it("subscribes to campaign_materializing_progress", () => {
    const qc = new QueryClient()
    renderHook(() => useCampaignMaterializationSubscription("campaign-1"), {
      wrapper: makeWrapper(qc),
    })
    expect(subscribe).toHaveBeenCalledTimes(1)
    const [event, handler] = subscribe.mock.calls[0]
    expect(event).toBe("campaign_materializing_progress")
    expect(typeof handler).toBe("function")
  })

  it("invalidates the campaign detail query when the event matches", () => {
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    renderHook(() => useCampaignMaterializationSubscription("campaign-1"), {
      wrapper: makeWrapper(qc),
    })

    const handler = subscribe.mock.calls[0][1] as (payload: unknown) => void
    handler({ campaign_id: "campaign-1" })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: campaignKeys.detail("campaign-1"),
    })
  })

  it("ignores events for other campaigns", () => {
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries")
    renderHook(() => useCampaignMaterializationSubscription("campaign-1"), {
      wrapper: makeWrapper(qc),
    })

    const handler = subscribe.mock.calls[0][1] as (payload: unknown) => void
    handler({ campaign_id: "campaign-other" })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it("does not subscribe when campaignId is undefined", () => {
    const qc = new QueryClient()
    renderHook(() => useCampaignMaterializationSubscription(undefined), {
      wrapper: makeWrapper(qc),
    })
    expect(subscribe).not.toHaveBeenCalled()
  })

  it("calls the unsubscribe function on unmount", () => {
    const qc = new QueryClient()
    const { unmount } = renderHook(
      () => useCampaignMaterializationSubscription("campaign-1"),
      { wrapper: makeWrapper(qc) },
    )
    expect(unsubscribe).not.toHaveBeenCalled()
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
