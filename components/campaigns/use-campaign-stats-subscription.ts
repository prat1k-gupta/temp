"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket } from "@/hooks/use-websocket"
import { campaignKeys } from "@/hooks/queries/use-campaigns"

/**
 * Subscribe to the "campaign_stats_update" WebSocket event and invalidate the
 * campaign detail + recipients queries when stats for this campaign change.
 *
 * The backend publishes campaign_stats_update events via
 * queue.Publisher.PublishCampaignStats — see fs-whatsapp/internal/worker/worker.go
 * checkCampaignCompletion and publishCampaignStats for the emitter side.
 */
export function useCampaignStatsSubscription(campaignId: string) {
  const { subscribe } = useWebSocket()
  const qc = useQueryClient()

  useEffect(() => {
    if (!campaignId) return
    const unsubscribe = subscribe("campaign_stats_update", (payload: any) => {
      if (payload?.campaign_id === campaignId) {
        qc.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) })
        qc.invalidateQueries({ queryKey: campaignKeys.recipients(campaignId) })
      }
    })
    return unsubscribe
  }, [campaignId, subscribe, qc])
}
