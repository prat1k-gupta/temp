"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { SETTINGS_CHILDREN } from "@/components/app-sidebar"

export default function SettingsPage() {
  const router = useRouter()
  const { can } = useAuth()

  useEffect(() => {
    const first = SETTINGS_CHILDREN.find(r => can(r.feature))
    router.replace(first?.path ?? "/")
  }, [router, can])

  return null
}
