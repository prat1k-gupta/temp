import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { rolePermissionKeys } from "./query-keys"

interface FeatureDefinition {
  key: string
  label: string
}

interface RolePermission {
  id: string
  organization_id: string
  role: string
  features: string[]
  is_custom: boolean
  display_name: string | null
}

/**
 * Fetch the feature registry from the backend — single source of truth.
 * Used by the Roles & Permissions settings page.
 */
export function useFeatures() {
  return useQuery({
    queryKey: [...rolePermissionKeys.all, "features"] as const,
    queryFn: () => apiClient.get<FeatureDefinition[]>("/api/settings/features"),
    staleTime: 30 * 60 * 1000, // 30 minutes — features rarely change
  })
}

export function useRolePermissions() {
  return useQuery({
    queryKey: rolePermissionKeys.list(),
    queryFn: () => apiClient.get<RolePermission[]>("/api/settings/role-permissions"),
  })
}

export function useUpdateRolePermissions(role: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (features: string[]) =>
      apiClient.put<RolePermission>(`/api/settings/role-permissions/${role}`, { features }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all })
    },
  })
}
