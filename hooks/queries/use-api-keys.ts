import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { apiKeyKeys } from "./query-keys"

export interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  is_active: boolean
  created_at: string
}

export interface CreateApiKeyResponse {
  id: string
  name: string
  key: string
}

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: apiKeyKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/api-keys")
      return data?.api_keys || data || []
    },
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; expires_at?: string }) =>
      apiClient.post<CreateApiKeyResponse>("/api/api-keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() })
    },
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() })
    },
  })
}
