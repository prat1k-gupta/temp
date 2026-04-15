import { CampaignCreateForm } from "@/components/campaigns/campaign-create-form"

// The form owns its own PageHeader so the Cancel / Create Draft buttons can
// live inside the header's children slot (right side of the title row). This
// keeps action layout consistent with /campaigns/[id] and avoids floating a
// second toolbar below the page title.
export default function NewCampaignPage() {
  return (
    <div className="p-6">
      <CampaignCreateForm />
    </div>
  )
}
