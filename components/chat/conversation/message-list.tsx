"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { useMessages } from "@/hooks/queries/use-messages"
import { getAccessToken } from "@/lib/auth"
import { MessageBubble } from "./message-bubble"
import type { Message, MessageType } from "@/types/chat"

const MEDIA_TYPES: Set<MessageType> = new Set(["image", "video", "audio", "document", "sticker"])

function isGroupedWithPrevious(current: Message, previous: Message | null): boolean {
  if (!previous) return false
  if (current.direction !== previous.direction) return false
  const currentTime = new Date(current.created_at).getTime()
  const prevTime = new Date(previous.created_at).getTime()
  return Math.abs(currentTime - prevTime) < 60000 // within 1 minute
}

interface MessageListProps {
  contactId: string
  isAtBottom: boolean
  onAtBottomChange: (atBottom: boolean) => void
}

export function MessageList({ contactId, isAtBottom, onAtBottomChange }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const blobCacheRef = useRef<Map<string, string>>(new Map())
  const inFlightRef = useRef<Set<string>>(new Set())
  const [blobVersion, setBlobVersion] = useState(0)
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useMessages(contactId)

  // Flatten pages — API returns messages in chronological order (ASC)
  const messages: Message[] = data?.pages.flatMap((p) => p.messages) ?? []

  // Fetch blob URLs for media messages
  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_FS_WHATSAPP_URL || ""

    for (const msg of messages) {
      if (!MEDIA_TYPES.has(msg.message_type)) continue
      if (blobCacheRef.current.has(msg.id)) continue
      if (inFlightRef.current.has(msg.id)) continue

      inFlightRef.current.add(msg.id)
      const token = getAccessToken()

      fetch(`${baseUrl}/api/media/${msg.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Media fetch failed: ${res.status}`)
          return res.blob()
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          blobCacheRef.current.set(msg.id, url)
          setBlobVersion((v) => v + 1)
        })
        .catch(() => {
          // Silently fail — message renderers fall back to placeholder
        })
        .finally(() => {
          inFlightRef.current.delete(msg.id)
        })
    }
  }, [messages])

  // Revoke blob URLs when contact changes
  useEffect(() => {
    return () => {
      for (const url of blobCacheRef.current.values()) {
        URL.revokeObjectURL(url)
      }
      blobCacheRef.current.clear()
      inFlightRef.current.clear()
    }
  }, [contactId])

  // Scroll to bottom on initial load and new messages (when at bottom)
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isAtBottom])

  // Infinite scroll upward — load older messages
  const handleScroll = useCallback(async () => {
    const el = scrollRef.current
    if (!el) return

    // Track isAtBottom
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
    onAtBottomChange(atBottom)

    // Load older when near top
    if (el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
      const prevScrollHeight = el.scrollHeight
      const prevScrollTop = el.scrollTop
      await fetchNextPage()
      // Preserve scroll position after prepend
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop
        }
      })
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, onAtBottomChange])

  // Date separator helper
  const getDateLabel = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return "Today"
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-2">
      {isFetchingNextPage && (
        <div className="flex justify-center py-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null
        const nextMessage = index < messages.length - 1 ? messages[index + 1] : null
        const showDate = !prevMessage ||
          new Date(message.created_at).toDateString() !== new Date(prevMessage.created_at).toDateString()

        // A date separator breaks any group
        const grouped = !showDate && isGroupedWithPrevious(message, prevMessage)

        // Check if next message continues the group — if not, this is the last in group (show timestamp)
        const nextShowDate = nextMessage &&
          new Date(message.created_at).toDateString() !== new Date(nextMessage.created_at).toDateString()
        const nextGrouped = nextMessage && !nextShowDate && isGroupedWithPrevious(nextMessage, message)
        const isLastInGroup = grouped && !nextGrouped

        return (
          <div key={message.id}>
            {showDate && (
              <div className="flex justify-center my-3">
                <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {getDateLabel(message.created_at)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              blobUrl={blobCacheRef.current.get(message.id)}
              isGrouped={grouped && !isLastInGroup}
              showAvatar={!grouped}
            />
          </div>
        )
      })}
    </div>
  )
}
