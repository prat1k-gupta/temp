import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export const waFlowKeys = {
  all: ["whatsappFlows"] as const,
  list: () => [...waFlowKeys.all, "list"] as const,
  detail: (id: string) => [...waFlowKeys.all, "detail", id] as const,
} as const

/**
 * Fetch WhatsApp Flows (Meta form flows, not chatbot flows).
 * Used by: flow/[id]/page.tsx
 */
export function useWhatsAppFlows() {
  return useQuery<any[]>({
    queryKey: waFlowKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/flows")
      return data?.flows || data || []
    },
  })
}

/**
 * Create a WhatsApp Flow.
 */
export function useCreateWhatsAppFlow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Record<string, any>) =>
      apiClient.post<any>("/api/flows", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waFlowKeys.all })
    },
  })
}

/**
 * Update a WhatsApp Flow.
 */
export function useUpdateWhatsAppFlow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.put<any>(`/api/flows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waFlowKeys.all })
    },
  })
}

/**
 * Save a WhatsApp Flow to Meta.
 */
export function useSaveWhatsAppFlowToMeta() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<any>(`/api/flows/${id}/save-to-meta`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waFlowKeys.all })
    },
  })
}

/**
 * Publish a WhatsApp Flow.
 */
export function usePublishWhatsAppFlow() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<any>(`/api/flows/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: waFlowKeys.all })
    },
  })
}
