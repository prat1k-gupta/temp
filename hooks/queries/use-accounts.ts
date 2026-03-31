import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export const accountKeys = {
  all: ["accounts"] as const,
  list: () => [...accountKeys.all, "list"] as const,
} as const

/**
 * Fetch WhatsApp Business accounts.
 * Used by: flow-setup-modal, publish-modal, template-builder, whatsapp-flow-builder-modal, whatsapp-publish-panel
 */
export function useAccounts() {
  return useQuery<any[]>({
    queryKey: accountKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/accounts")
      return data?.accounts || data || []
    },
  })
}
