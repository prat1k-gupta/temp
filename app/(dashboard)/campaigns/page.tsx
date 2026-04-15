"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { useCampaigns } from "@/hooks/queries/use-campaigns"
import { CampaignList } from "@/components/campaigns/campaign-list"
import { Plus } from "lucide-react"

export default function CampaignsPage() {
  const { data, isLoading, isError } = useCampaigns()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Campaigns">
        <Button asChild>
          <Link href="/campaigns/new" className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </PageHeader>

      {isLoading && <div className="text-muted-foreground">Loading campaigns...</div>}
      {isError && <div className="text-destructive">Failed to load campaigns</div>}
      {data && <CampaignList campaigns={data.campaigns} />}
    </div>
  )
}
