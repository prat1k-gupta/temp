import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { teamKeys } from "./query-keys"

export interface Team {
  id: string
  name: string
  description: string
  assignment_strategy: "round_robin" | "load_balanced" | "manual"
  is_active: boolean
  member_count: number
  created_at: string
}

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: teamKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/teams")
      return data?.teams || data || []
    },
  })
}

export function useCreateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; assignment_strategy?: string }) =>
      apiClient.post("/api/teams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list() })
    },
  })
}

export function useUpdateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; assignment_strategy?: string; is_active?: boolean }) =>
      apiClient.put(`/api/teams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list() })
    },
  })
}

export function useDeleteTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list() })
    },
  })
}
