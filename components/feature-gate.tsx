"use client"

import { ShieldX } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

export function FeatureGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { can, isLoading } = useAuth()

  if (isLoading) return null

  if (!can(feature)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-2">
        <div className="rounded-full bg-muted p-4">
          <ShieldX className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to access this feature.
        </p>
      </div>
    )
  }

  return children
}
