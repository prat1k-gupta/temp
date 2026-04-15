import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
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
} as const

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
    staleTime: 10 * 1000,
  })
}

export function useCampaignRecipients(campaignId: string | undefined) {
  return useInfiniteQuery({
    queryKey: campaignKeys.recipients(campaignId ?? ""),
    queryFn: async ({ pageParam = 1 }) => {
      return apiClient.get<{ recipients: CampaignRecipient[]; total: number }>(
        `/api/campaigns/${campaignId}/recipients?page=${pageParam}&limit=50`,
      )
    },
    enabled: Boolean(campaignId),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.recipients.length === 50 ? allPages.length + 1 : undefined),
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

export function useStartCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/start`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

export function usePauseCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/pause`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
    },
  })
}

export function useCancelCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/campaigns/${id}/cancel`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) })
      qc.invalidateQueries({ queryKey: campaignKeys.lists() })
    },
  })
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: (input: { source: string; audience_id?: string; filter?: unknown }) =>
      apiClient.post<AudiencePreview>("/api/campaigns/preview-audience", input),
  })
}
