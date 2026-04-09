import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { contactKeys, messageKeys } from "./query-keys"
import type { Message, MessagesResponse } from "@/types/chat"

const PAGE_SIZE = 50

/**
 * Fetch messages for a contact with cursor-based pagination.
 * staleTime: 0 ensures React Query refetches on contact switch so new messages
 * appear immediately. Cached data is served instantly while refetch runs in
 * background. Previously used staleTime: Infinity which caused stale cache bugs
 * (messages missing after contact switch, status ticks not updating).
 * The mark-as-read side effect on GET is acceptable since we only refetch when
 * the user is actively viewing the contact.
 */
export function useMessages(contactId: string) {
  return useInfiniteQuery<MessagesResponse>({
    queryKey: messageKeys.list(contactId),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (pageParam) {
        params.set("before_id", pageParam as string)
      }
      return apiClient.get<MessagesResponse>(
        `/api/contacts/${contactId}/messages?${params.toString()}`
      )
    },
    initialPageParam: "" as string,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more || lastPage.messages.length === 0) return undefined
      // Oldest message in the page is the cursor for the next page
      return lastPage.messages[lastPage.messages.length - 1].id
    },
    enabled: !!contactId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

/**
 * Send a text message to a contact.
 * On success, appends the returned message to the first page of the cache
 * (with dedup) and invalidates the contacts list to update last_message_preview.
 */
export function useSendMessage(contactId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ body, replyToMessageId }: { body: string; replyToMessageId?: string }) =>
      apiClient.post<Message>(`/api/contacts/${contactId}/messages`, {
        type: "text",
        content: { body },
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),
    onSuccess: (newMessage) => {
      appendMessageToCache(queryClient, contactId, newMessage)
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

interface SendMediaParams {
  file: File
  type: "image" | "video" | "audio" | "document"
  caption?: string
}

/**
 * Send a media message (image, video, audio, document).
 * Uses apiClient.fetch with FormData -- no Content-Type header so the browser
 * sets the multipart boundary automatically.
 */
export function useSendMedia(contactId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ file, type, caption }: SendMediaParams) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("contact_id", contactId)
      formData.append("type", type)
      if (caption) {
        formData.append("caption", caption)
      }
      // Use apiClient.fetch directly -- the .post() helper sets
      // Content-Type: application/json which breaks FormData uploads.
      return apiClient.fetch<Message>("/api/messages/media", {
        method: "POST",
        body: formData,
      })
    },
    onSuccess: (newMessage) => {
      appendMessageToCache(queryClient, contactId, newMessage)
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
    },
  })
}

/**
 * Send or remove a reaction on a message.
 * Optimistic update: immediately patches the local reactions array.
 * WebSocket `reaction_update` will also arrive and overwrite with server truth.
 */
export function useReaction(contactId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      apiClient.post(`/api/contacts/${contactId}/messages/${messageId}/reaction`, { emoji }),
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: messageKeys.list(contactId) })

      const previous = queryClient.getQueryData<{
        pages: MessagesResponse[]
        pageParams: unknown[]
      }>(messageKeys.list(contactId))

      queryClient.setQueryData<{
        pages: MessagesResponse[]
        pageParams: unknown[]
      }>(messageKeys.list(contactId), (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) => {
              if (m.id !== messageId) return m
              const reactions = (m.reactions ?? []).filter(
                (r) => r.from_user !== "self" && r.from_phone !== "self"
              )
              if (emoji) {
                reactions.push({ emoji, from_user: "self" })
              }
              return { ...m, reactions }
            }),
          })),
        }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messageKeys.list(contactId), context.previous)
      }
    },
  })
}

/**
 * Append or update a message in the first page of the messages cache.
 * If the message already exists (e.g. from WebSocket), merge with the richer
 * REST response data (which includes reply_to_message preview, etc.).
 */
function appendMessageToCache(
  queryClient: ReturnType<typeof useQueryClient>,
  contactId: string,
  message: Message
) {
  queryClient.setQueryData<{
    pages: MessagesResponse[]
    pageParams: unknown[]
  }>(messageKeys.list(contactId), (old) => {
    if (!old) return old

    const firstPage = old.pages[0]
    if (!firstPage) return old

    // Check if message already exists (WebSocket may have added it first)
    const existingIdx = firstPage.messages.findIndex((m) => m.id === message.id)
    if (existingIdx >= 0) {
      // Merge: REST response has richer data (reply_to_message, etc.)
      const updatedMessages = [...firstPage.messages]
      updatedMessages[existingIdx] = { ...updatedMessages[existingIdx], ...message }
      return {
        ...old,
        pages: [
          { ...firstPage, messages: updatedMessages },
          ...old.pages.slice(1),
        ],
      }
    }

    return {
      ...old,
      pages: [
        { ...firstPage, messages: [...firstPage.messages, message] },
        ...old.pages.slice(1),
      ],
    }
  })
}
