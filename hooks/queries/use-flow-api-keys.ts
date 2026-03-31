import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { flowApiKeyKeys } from "./query-keys"

export interface FlowApiKey {
  id: string
  name: string
  flow_id: string
  flow_name: string
  key: string
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

export function useFlowApiKeys() {
  return useQuery<FlowApiKey[]>({
    queryKey: flowApiKeyKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<FlowApiKey[]>("/api/flow-api-keys")
      return Array.isArray(data) ? data : []
    },
  })
}

export function useCreateFlowApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; flow_id: string; expires_at?: string }) =>
      apiClient.post<FlowApiKey & { key: string }>("/api/flow-api-keys", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowApiKeyKeys.list() })
    },
  })
}

export function useDeleteFlowApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/flow-api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: flowApiKeyKeys.list() })
    },
  })
}
