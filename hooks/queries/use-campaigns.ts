import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type {
  Campaign,
  CampaignRecipient,
  AudiencePreview,
  CreateCampaignInput,
  CreateCampaignResponse,
  CampaignStatus,
} from "@/types/campaigns"

export const campaignKeys = {
  all: ["campaigns"] as const,
  lists: () => [...campaignKeys.all, "list"] as const,
  list: (filters: Record<string, unknown> = {}) => [...campaignKeys.lists(), filters] as const,
  details: () => [...campaignKeys.all, "detail"] as const,
  detail: (id: string) => [...campaignKeys.details(), id] as const,
  recipients: (campaignId: string) => [...campaignKeys.detail(campaignId), "recipients"] as const,
  recipientsPage: (
    campaignId: string,
    page: number,
    limit: number,
    status: RecipientStatusFilter,
    search: string,
  ) => [...campaignKeys.recipients(campaignId), { page, limit, status, search }] as const,
} as const

export const RECIPIENTS_PAGE_SIZE = 50

export type RecipientStatusFilter = "all" | "pending" | "sent" | "delivered" | "read" | "failed"

export function useCampaigns(filters: { status?: CampaignStatus } = {}) {
  return useQuery({
    queryKey: campaignKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.status) params.set("status", filters.status)
      const qs = params.toString() ? `?${params}` : ""
      return apiClient.get<{ campaigns: Campaign[]; total: number }>(`/api/campaigns${qs}`)
    },
    staleTime: 30 * 1000,
  })
}

export function useCampaign(id: string | undefined) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ""),
    queryFn: () => apiClient.get<Campaign>(`/api/campaigns/${id}`),
    enabled: Boolean(id),
    // Always refetch on mount — stale data is confusing for in-progress
    // campaigns where counters change by the second. WebSocket updates are
    // the primary refresh mechanism; this is a fallback when the page first
    // loads or the tab is refocused.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  })
}

export function useCampaignRecipients(
  campaignId: string | undefined,
  page: number = 1,
  limit: number = RECIPIENTS_PAGE_SIZE,
  status: RecipientStatusFilter = "all",
  search: string = "",
) {
  return useQuery({
    queryKey: campaignKeys.recipientsPage(campaignId ?? "", page, limit, status, search),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (status !== "all") params.set("status", status)
      if (search) params.set("search", search)
      return apiClient.get<{ recipients: CampaignRecipient[]; total: number; page: number; limit: number }>(
        `/api/campaigns/${campaignId}/recipients?${params.toString()}`,
      )
    },
    enabled: Boolean(campaignId),
    // Keep the previous page visible while the next page loads — prevents the
    // table from flashing empty on every page click.
    placeholderData: keepPreviousData,
    // Match useCampaign so recipient statuses refresh alongside counters.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiClient.post<CreateCampaignResponse>("/api/campaigns", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

// Shared invalidation: Start/Pause/Cancel all change both the campaign row
// (status, timestamps) AND recipient rows (status transitions from pending →
// sent/failed). Invalidate both queries so the UI reflects the truth after
// any mutation. Note: `campaignKeys.recipients(id)` is a descendant of
// `campaignKeys.detail(id)` so technically one invalidate would suffice,
// but being explicit avoids future drift if the key shape changes.
function invalidateCampaignQueries(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
  qc.invalidateQueries({ queryKey: campaignKeys.recipients(id) })
  qc.invalidateQueries({ queryKey: campaignKeys.lists() })
}

export function useStartCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/start`, {}),
    onSuccess: (_data, id) => invalidateCampaignQueries(qc, id),
  })
}

export function usePauseCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/pause`, {}),
    onSuccess: (_data, id) => invalidateCampaignQueries(qc, id),
  })
}

export function useCancelCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/cancel`, {}),
    onSuccess: (_data, id) => invalidateCampaignQueries(qc, id),
  })
}

export function useRetryFailedCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ retry_count: number }>(`/api/campaigns/${id}/retry-failed`, {}),
    onSuccess: (_data, id) => invalidateCampaignQueries(qc, id),
  })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/campaigns/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
      qc.removeQueries({ queryKey: campaignKeys.detail(id) })
    },
  })
}

export function useRescheduleCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduled_at }: { id: string; scheduled_at: string }) =>
      apiClient.post(`/api/campaigns/${id}/reschedule`, { scheduled_at }),
    onSuccess: (_data, { id }) => invalidateCampaignQueries(qc, id),
  })
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: (input: { source: string; audience_id?: string; filter?: unknown }) =>
      apiClient.post<AudiencePreview>("/api/campaigns/preview-audience", input),
  })
}
