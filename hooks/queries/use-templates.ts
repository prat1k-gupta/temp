import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export const templateKeys = {
  all: ["templates"] as const,
  list: (status?: string) => [...templateKeys.all, "list", status || "all"] as const,
  approved: () => [...templateKeys.all, "list", "APPROVED"] as const,
} as const

/**
 * Fetch WhatsApp message templates (Meta templates).
 * Used by: templates/page.tsx, properties-panel (APPROVED only)
 */
export function useTemplates(status?: string) {
  return useQuery<any[]>({
    queryKey: templateKeys.list(status),
    queryFn: async () => {
      const qs = status && status !== "all" ? `?status=${status}` : ""
      const data = await apiClient.get<any>(`/api/templates${qs}`)
      return Array.isArray(data) ? data : data?.templates || []
    },
  })
}

/**
 * Sync templates from Meta.
 */
export function useSyncTemplates() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.post("/api/templates/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

/**
 * Delete a template.
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

/**
 * Submit a template to Meta for review (publish).
 */
export function usePublishTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/templates/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

/**
 * Create or update a template.
 */
export function useSaveTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: Record<string, any> }) =>
      id
        ? apiClient.put(`/api/templates/${id}`, data)
        : apiClient.post("/api/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}

/**
 * Duplicate a template (create copy).
 */
export function useDuplicateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post("/api/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all })
    },
  })
}
