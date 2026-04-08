"use client"

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import {
  type AuthUser,
  getAccessToken,
  fetchCurrentUser,
  clearAuth,
} from "@/lib/auth"
import { canAccess, DEFAULT_ROLE_FEATURES, type Role } from "@/lib/permissions"
import { apiClient } from "@/lib/api-client"
import { rolePermissionKeys } from "@/hooks/queries/query-keys"

interface RolePermission {
  role: string
  features: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  role: Role
  permissions: string[]
  can: (feature: string) => boolean
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    fetchCurrentUser()
      .then((freshUser) => {
        if (freshUser) {
          setUser(freshUser)
        } else {
          clearAuth()
          router.push("/login")
        }
      })
      .finally(() => setIsLoading(false))
  }, [router])

  const role: Role = (user?.role as Role) || "agent"

  // Fetch org-level permissions (Phase B)
  const { data: rolePermissions } = useQuery({
    queryKey: rolePermissionKeys.list(),
    queryFn: () => apiClient.get<RolePermission[]>("/api/settings/role-permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes — match Redis TTL
  })

  // Use API permissions if available, fall back to hardcoded defaults
  // Deny-all (empty array) for unknown roles when API is unavailable
  const permissions = useMemo(() => {
    const apiPerms = rolePermissions?.find((r) => r.role === user?.role)?.features
    return apiPerms ?? DEFAULT_ROLE_FEATURES[role] ?? []
  }, [rolePermissions, role, user?.role])

  const can = useCallback(
    (feature: string) => canAccess(permissions, feature),
    [permissions]
  )

  const handleLogout = useCallback(() => {
    clearAuth()
    window.location.href = "/login"
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, role, permissions, can, isLoading, logout: handleLogout }),
    [user, role, permissions, can, isLoading, handleLogout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
