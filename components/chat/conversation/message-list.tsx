"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useMessages, useSendMessage, useReaction } from "@/hooks/queries/use-messages"
import { messageKeys } from "@/hooks/queries/query-keys"
import { apiClient } from "@/lib/api-client"
import { MessageBubble } from "./message-bubble"
import { MessageActions } from "./message-actions"
import type { Message, MessageType, MessagesResponse } from "@/types/chat"

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
  onReply: (message: Message) => void
}

export function MessageList({ contactId, isAtBottom, onAtBottomChange, onReply }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const blobCacheRef = useRef<Map<string, string>>(new Map())
  const inFlightRef = useRef<Set<string>>(new Set())
  const [blobVersion, setBlobVersion] = useState(0)
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useMessages(contactId)
  const queryClient = useQueryClient()
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null)
  const { mutate: retrySend } = useSendMessage(contactId)
  const { mutate: sendReaction } = useReaction(contactId)

  // Flatten pages — API returns messages in chronological order (ASC)
  const messages: Message[] = data?.pages.flatMap((p) => p.messages) ?? []

  // Fetch blob URLs for media messages.
  // apiClient.raw routes /api/media/* directly to fs-whatsapp (it's not
  // in LOCAL_PREFIXES) and inherits 401 → refresh → retry, so media
  // doesn't disappear from the chat panel after the access token expires.
  useEffect(() => {
    for (const msg of messages) {
      if (!MEDIA_TYPES.has(msg.message_type)) continue
      if (blobCacheRef.current.has(msg.id)) continue
      if (inFlightRef.current.has(msg.id)) continue

      inFlightRef.current.add(msg.id)

      apiClient
        .raw(`/api/media/${msg.id}`)
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

  // Scroll to bottom: on contact switch (always) or new messages (when at bottom)
  const prevContactIdRef = useRef(contactId)
  const shouldForceScrollRef = useRef(true)
  if (prevContactIdRef.current !== contactId) {
    prevContactIdRef.current = contactId
    shouldForceScrollRef.current = true
  }
  const lastMessageId = messages[messages.length - 1]?.id
  useEffect(() => {
    if (!scrollRef.current) return
    const shouldScroll = shouldForceScrollRef.current || isAtBottom
    if (shouldScroll) {
      const el = scrollRef.current
      el.scrollTop = el.scrollHeight
      shouldForceScrollRef.current = false
      // Scroll again after images/media load (they increase scrollHeight)
      const timer = setTimeout(() => { el.scrollTop = el.scrollHeight }, 300)
      return () => clearTimeout(timer)
    }
  }, [lastMessageId, isAtBottom])

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

  const handleRetry = useCallback((message: Message) => {
    if (retryingMessageId) return
    setRetryingMessageId(message.id)
    const body = typeof message.content === "string" ? message.content : message.content?.body || ""
    retrySend(
      { body },
      {
        onSuccess: (newMessage) => {
          // Atomic: remove failed + append new in single update
          queryClient.setQueryData<{
            pages: MessagesResponse[]
            pageParams: unknown[]
          }>(messageKeys.list(contactId), (old) => {
            if (!old) return old
            return {
              ...old,
              pages: old.pages.map((page, i) => ({
                ...page,
                messages: [
                  ...page.messages.filter((m) => m.id !== message.id),
                  ...(i === 0 && !page.messages.some((m) => m.id === newMessage.id)
                    ? [newMessage]
                    : []),
                ],
              })),
            }
          })
          setRetryingMessageId(null)
        },
        onError: () => setRetryingMessageId(null),
      }
    )
  }, [retryingMessageId, retrySend, contactId, queryClient])

  const handleReact = useCallback((messageId: string, emoji: string) => {
    sendReaction({ messageId, emoji })
  }, [sendReaction])

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
              <div className="sticky top-0 z-10 flex justify-center my-3 bg-background">
                <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full shadow-sm">
                  {getDateLabel(message.created_at)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              blobUrl={blobCacheRef.current.get(message.id)}
              isGrouped={grouped && !isLastInGroup}
              showAvatar={!grouped}
              actions={
                <MessageActions
                  message={message}
                  onReply={onReply}
                  onReact={handleReact}
                  onRetry={handleRetry}
                  isRetrying={retryingMessageId === message.id}
                />
              }
            />
          </div>
        )
      })}
    </div>
  )
}
