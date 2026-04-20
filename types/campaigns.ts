// Campaign statuses mirror fs-whatsapp/internal/models/constants.go:143-151.
// NOTE: "processing" (not "running") matches the backend enum.
export type CampaignStatus =
  | "draft"
  | "materializing"
  | "scheduled"
  | "queued"
  | "processing"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed"

export type AudienceSource = "contacts" | "csv" | "freestand-claimant"

export interface Campaign {
  id: string
  name: string
  account_name: string
  template_id: string | null
  template_name?: string | null
  flow_id: string | null
  flow_name?: string | null
  audience_source: AudienceSource
  // Shape varies by source; see CreateCampaignInput for the full spec.
  // Backend now returns this on CampaignResponse so the UI can render
  // filter details (tag/search/claimant id) without re-fetching.
  audience_config?: Record<string, unknown> | null
  source_system: string | null
  source_external_id: string | null
  status: CampaignStatus
  total_recipients: number
  materialized_count: number | null
  audience_total: number | null
  recipients_completed: number
  sent_count: number
  delivered_count: number
  read_count: number
  failed_count: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at?: string
  error_message?: string
}

export interface CampaignRecipient {
  id: string
  campaign_id: string
  contact_id: string | null
  phone_number: string
  recipient_name: string
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

// Columns exposed in the freestand-claimant column-mapping UI.
// Must match fs-whatsapp/internal/handlers/materialize_go_backend.go's
// freestandClaimantAllowedColumns(). Rename/extend in lockstep with that file.
export const FREESTAND_CLAIMANT_ALLOWED_COLUMNS = [
  "name", "city", "state", "pincode", "country", "address",
  "status", "claim_date", "campaign_name", "skus", "utm_source",
  "order_status", "delivery_status", "waybill_number",
] as const

export type FreestandClaimantColumn = typeof FREESTAND_CLAIMANT_ALLOWED_COLUMNS[number]

// Shape of audience_config when audience_source === "freestand-claimant".
export interface AudienceConfigFreestandClaimant {
  audience_id: string
  column_mapping: Record<string, FreestandClaimantColumn>
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
