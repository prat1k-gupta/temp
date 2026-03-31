import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export const accountKeys = {
  all: ["accounts"] as const,
  list: () => [...accountKeys.all, "list"] as const,
} as const

export interface Account {
  id: string
  name: string
  phone_number: string
  phone_number_id: string
  business_id: string
  waba_id: string
  access_token: string
  is_active: boolean
  webhook_verified: boolean
  created_at: string
  updated_at: string
}

/**
 * Fetch WhatsApp Business accounts.
 * Used by: flow-setup-modal, publish-modal, template-builder, whatsapp-flow-builder-modal, whatsapp-publish-panel
 */
export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: accountKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/accounts")
      return data?.accounts || data || []
    },
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      phone_number: string
      phone_number_id: string
      business_id: string
      waba_id: string
      access_token: string
    }) => apiClient.post("/api/accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Partial<{
      name: string
      phone_number: string
      phone_number_id: string
      business_id: string
      waba_id: string
      access_token: string
      is_active: boolean
    }>) => apiClient.put(`/api/accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
    },
  })
}
