"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket } from "@/hooks/use-websocket"
import { campaignKeys } from "@/hooks/queries/use-campaigns"

/**
 * Subscribes to the server-emitted campaign_materializing_progress WebSocket
 * event and invalidates the campaign detail cache so the progress bar in
 * campaign-detail.tsx re-renders with fresh numbers.
 *
 * Mirrors use-campaign-stats-subscription.ts — same shape, different event.
 * Invalidation is all we need: the campaign row carries materialized_count
 * and audience_total, and useCampaign has staleTime=0 + refetchOnMount="always"
 * so the detail query refetches instantly.
 */
export function useCampaignMaterializationSubscription(campaignId: string | undefined) {
  const { subscribe } = useWebSocket()
  const qc = useQueryClient()

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = subscribe("campaign_materializing_progress", (payload: any) => {
      if (payload?.campaign_id !== campaignId) return
      qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
    })
    return unsubscribe
  }, [campaignId, subscribe, qc])
}
