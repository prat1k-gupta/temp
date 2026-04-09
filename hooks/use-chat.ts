"use client"

import { useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"

export function useChat() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isAtBottom, setIsAtBottom] = useState(true)

  const activeContactId = searchParams.get("contact")

  const setActiveContact = useCallback((contactId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (contactId) {
      params.set("contact", contactId)
    } else {
      params.delete("contact")
    }
    router.push(`/chat?${params}`)
  }, [searchParams, router])

  return { activeContactId, setActiveContact, isAtBottom, setIsAtBottom }
}
