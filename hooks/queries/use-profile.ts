import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { profileKeys } from "./query-keys"
import { setUser, getUser } from "@/lib/auth"

export interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  is_available: boolean
  organization_id: string
  created_at: string
  updated_at: string
}

export function useProfile() {
  return useQuery<Profile>({
    queryKey: profileKeys.me(),
    queryFn: () => apiClient.get<Profile>("/api/me"),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { full_name?: string; email?: string }) =>
      apiClient.put<Profile>("/api/me", data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.me() })
      const current = getUser()
      if (current && updated) {
        setUser({ ...current, ...updated })
      }
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      apiClient.put("/api/me/password", data),
  })
}
