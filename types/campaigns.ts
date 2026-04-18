// Campaign statuses mirror fs-whatsapp/internal/models/constants.go:143-151.
// NOTE: "processing" (not "running") matches the backend enum.
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"

export type AudienceSource = "contacts" | "csv" | "sampling-central"

export interface Campaign {
  id: string
  name: string
  account_name: string
  template_id: string | null
  template_name?: string | null
  flow_id: string | null
  flow_name?: string | null
  audience_source: AudienceSource
  source_system: string | null
  source_external_id: string | null
  status: CampaignStatus
  total_recipients: number
  recipients_completed: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  error_message?: string
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  contact_id: string | null
  phone_number: string
  status: "pending" | "sent" | "delivered" | "read" | "failed"
  provider_message_id: string | null
  error_message: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
}

export interface AudiencePreview {
  total_count: number
  name?: string
  audience_type?: string
  available_columns: string[]
}

export interface CreateCampaignInput {
  name: string
  account_name: string
  template_id: string | null
  flow_id: string | null
  audience_source: AudienceSource
  audience_config: unknown // shape varies by source; see spec
  scheduled_at: string | null
}

export interface CreateCampaignResponse {
  id: string
  name: string
  account_name: string
  template_id: string | null
  flow_id: string | null
  audience_source: AudienceSource
  status: CampaignStatus
  total_recipients: number
  contacts_created?: number
  contacts_reused?: number
  invalid_phones?: number
}
