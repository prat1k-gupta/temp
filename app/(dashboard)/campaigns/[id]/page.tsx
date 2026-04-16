"use client"

import { useParams } from "next/navigation"
import { useCampaign } from "@/hooks/queries/use-campaigns"
import { CampaignDetail } from "@/components/campaigns/campaign-detail"

export default function CampaignDetailPage() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : undefined
  const { data, isLoading, isError } = useCampaign(id)

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>
  if (isError || !data) return <div className="p-6 text-destructive">Campaign not found</div>

  return <CampaignDetail campaign={data} />
}
