import { PageHeader } from "@/components/page-header"
import { CampaignCreateForm } from "@/components/campaigns/campaign-create-form"

export default function NewCampaignPage() {
  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <PageHeader title="New Campaign" />
      <CampaignCreateForm />
    </div>
  )
}
