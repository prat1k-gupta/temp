"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/page-header"
import { CampaignStatusBadge } from "./campaign-status-badge"
import { RecipientTable } from "./recipient-table"
import { useCampaignStatsSubscription } from "./use-campaign-stats-subscription"
import {
  useStartCampaign,
  usePauseCampaign,
  useCancelCampaign,
} from "@/hooks/queries/use-campaigns"
import type { Campaign } from "@/types/campaigns"
import { FileText, GitBranch } from "lucide-react"

export function CampaignDetail({ campaign }: { campaign: Campaign }) {
  useCampaignStatsSubscription(campaign.id)

  const { mutate: startCampaign, isPending: starting } = useStartCampaign()
  const { mutate: pauseCampaign, isPending: pausing } = usePauseCampaign()
  const { mutate: cancelCampaign, isPending: cancelling } = useCancelCampaign()

  const canStart = campaign.status === "draft" || campaign.status === "scheduled"
  const canPause = campaign.status === "processing"
  const canCancel =
    campaign.status === "processing" ||
    campaign.status === "paused" ||
    campaign.status === "scheduled"

  const progressPct = campaign.total_recipients
    ? Math.round(
        ((campaign.sent_count + campaign.failed_count) / campaign.total_recipients) * 100,
      )
    : 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title={campaign.name}>
        <div className="flex items-center gap-2">
          {canStart && (
            <Button
              onClick={() => startCampaign(campaign.id)}
              disabled={starting}
              className="cursor-pointer"
            >
              Start Campaign
            </Button>
          )}
          {canPause && (
            <Button
              variant="outline"
              onClick={() => pauseCampaign(campaign.id)}
              disabled={pausing}
              className="cursor-pointer"
            >
              Pause
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => cancelCampaign(campaign.id)}
              disabled={cancelling}
              className="cursor-pointer"
            >
              Cancel
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <CampaignStatusBadge status={campaign.status} />
        <span className="flex items-center gap-1.5">
          {campaign.flow_id ? (
            <GitBranch className="h-3.5 w-3.5" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          {campaign.flow_id ? "Flow campaign" : "Template campaign"}
        </span>
        <span>·</span>
        <span>{campaign.account_name}</span>
        {campaign.source_system && (
          <>
            <span>·</span>
            <span>
              Source: {campaign.source_system}
              {campaign.source_external_id ? ` / ${campaign.source_external_id}` : ""}
            </span>
          </>
        )}
      </div>

      <Progress value={progressPct} className="h-2" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Recipients" value={campaign.total_recipients} />
        <Stat label="Sent" value={campaign.sent_count} />
        <Stat label="Delivered" value={campaign.delivered_count} />
        <Stat label="Read" value={campaign.read_count} />
        <Stat label="Failed" value={campaign.failed_count} highlight="destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipientTable campaignId={campaign.id} />
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: "destructive"
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          highlight === "destructive" && value > 0 ? "text-destructive" : ""
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  )
}
