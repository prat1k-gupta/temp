import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { profileKeys } from "./query-keys"
import { setUser, getUser } from "@/lib/auth"

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  organization_id: string
  organization_name?: string
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
