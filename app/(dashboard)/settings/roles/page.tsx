"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useRolePermissions, useUpdateRolePermissions, useFeatures } from "@/hooks/queries/use-role-permissions"
import { FEATURES } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, ShieldCheck, Shield, UserCog } from "lucide-react"
import { toast } from "sonner"

const FEATURE_LABELS: Record<string, string> = {
  flows: "Flows",
  templates: "Templates",
  chat: "Chat",
  campaigns: "Campaigns",
  contacts: "Contacts",
  analytics: "Analytics",
  "accounts": "Accounts",
  "users": "User Management",
  "teams": "Teams",
  "chatbot-settings": "Chatbot Settings",
  "api-keys": "API Keys",
}

const BUILT_IN_ROLES = ["admin", "manager", "agent"] as const

const ROLE_CONFIG: Record<string, { label: string; icon: typeof ShieldCheck; description: string }> = {
  admin: { label: "Admin", icon: ShieldCheck, description: "Full access" },
  manager: { label: "Manager", icon: Shield, description: "All except user management" },
  agent: { label: "Agent", icon: UserCog, description: "Chat only" },
}

export default function RolesPage() {
  const { can } = useAuth()
  const { data: featureDefinitions } = useFeatures()
  const { data: rolePermissions, isLoading } = useRolePermissions()
  // Use API features if available, fall back to hardcoded
  const features = featureDefinitions?.map((f) => f.key) ?? [...FEATURES]
  const featureLabels: Record<string, string> = Object.fromEntries(
    featureDefinitions?.map((f) => [f.key, f.label]) ?? FEATURES.map((f) => [f, FEATURE_LABELS[f] ?? f])
  )
  const [editedFeatures, setEditedFeatures] = useState<Record<string, string[]>>({})
  const [savingRole, setSavingRole] = useState<string | null>(null)

  const updateAdmin = useUpdateRolePermissions("admin")
  const updateManager = useUpdateRolePermissions("manager")
  const updateAgent = useUpdateRolePermissions("agent")

  const mutationMap: Record<string, typeof updateAdmin> = {
    admin: updateAdmin,
    manager: updateManager,
    agent: updateAgent,
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const getFeaturesForRole = (role: string): string[] => {
    if (editedFeatures[role]) return editedFeatures[role]
    return rolePermissions?.find((r) => r.role === role)?.features ?? []
  }

  const toggleFeature = (role: string, feature: string) => {
    const current = getFeaturesForRole(role)
    const updated = current.includes(feature)
      ? current.filter((f) => f !== feature)
      : [...current, feature]
    setEditedFeatures((prev) => ({ ...prev, [role]: updated }))
  }

  const hasChanges = (role: string): boolean => {
    if (!editedFeatures[role]) return false
    const serverFeatures = rolePermissions?.find((r) => r.role === role)?.features ?? []
    const edited = editedFeatures[role]
    return JSON.stringify([...serverFeatures].sort()) !== JSON.stringify([...edited].sort())
  }

  const handleSave = async (role: string) => {
    const features = getFeaturesForRole(role)
    const mutation = mutationMap[role]
    if (!mutation) return

    setSavingRole(role)
    try {
      await mutation.mutateAsync(features)
      setEditedFeatures((prev) => {
        const next = { ...prev }
        delete next[role]
        return next
      })
      toast.success(`${ROLE_CONFIG[role]?.label ?? role} permissions updated`)
    } catch {
      toast.error(`Failed to update ${ROLE_CONFIG[role]?.label ?? role} permissions`)
    } finally {
      setSavingRole(null)
    }
  }

  const canEdit = can("users")
  const anyChanges = BUILT_IN_ROLES.some((role) => hasChanges(role))

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Configure which features each role can access
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-3 gap-4">
        {BUILT_IN_ROLES.map((role) => {
          const config = ROLE_CONFIG[role]
          const Icon = config.icon
          return (
            <Card key={role} className="py-4">
              <CardContent className="flex items-start gap-3">
                <div className="rounded-lg bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Permissions table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 pr-4 font-medium">Feature</th>
                  {BUILT_IN_ROLES.map((role) => (
                    <th key={role} className="text-center py-3 px-6 font-medium">
                      <div className="flex items-center justify-center gap-1.5">
                        {ROLE_CONFIG[role].label}
                        {hasChanges(role) && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            edited
                          </Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <tr key={feature} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 pr-4">{featureLabels[feature] ?? feature}</td>
                    {BUILT_IN_ROLES.map((role) => {
                      const features = getFeaturesForRole(role)
                      const checked = features.includes(feature)
                      return (
                        <td key={role} className="text-center py-3 px-6">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleFeature(role, feature)}
                            disabled={!canEdit}
                            className="cursor-pointer"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {anyChanges && (
            <div className="flex gap-2 mt-6 justify-end border-t pt-4">
              {BUILT_IN_ROLES.map((role) =>
                hasChanges(role) ? (
                  <Button
                    key={role}
                    onClick={() => handleSave(role)}
                    disabled={savingRole === role || !canEdit}
                    size="sm"
                    className="cursor-pointer"
                  >
                    {savingRole === role ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save {ROLE_CONFIG[role].label}
                  </Button>
                ) : null
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
