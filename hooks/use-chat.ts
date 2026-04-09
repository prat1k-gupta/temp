"use client"

import { useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import type { Message } from "@/types/chat"

export function useChat() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [replyingTo, setReplyingToState] = useState<Message | null>(null)
  const [showInfoPanel, setShowInfoPanel] = useState(true)

  const activeContactId = searchParams.get("contact")

  const setActiveContact = useCallback((contactId: string | null) => {
    setReplyingToState(null)
    const params = new URLSearchParams(searchParams.toString())
    if (contactId) {
      params.set("contact", contactId)
    } else {
      params.delete("contact")
    }
    router.push(`/chat?${params}`)
  }, [searchParams, router])

  const setReplyingTo = useCallback((message: Message) => {
    setReplyingToState(message)
  }, [])

  const clearReplyingTo = useCallback(() => {
    setReplyingToState(null)
  }, [])

  const toggleInfoPanel = useCallback(() => setShowInfoPanel((prev) => !prev), [])

  return {
    activeContactId,
    setActiveContact,
    isAtBottom,
    setIsAtBottom,
    replyingTo,
    setReplyingTo,
    clearReplyingTo,
    showInfoPanel,
    toggleInfoPanel,
  }
}
