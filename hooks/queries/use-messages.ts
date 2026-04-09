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
 * First page has staleTime: Infinity because the backend marks messages
 * as read on fetch -- refetching would be a no-op that wastes a round trip.
 * Older pages use normal staleTime since they don't trigger read receipts.
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
    staleTime: Infinity,
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
    mutationFn: (body: string) =>
      apiClient.post<Message>(`/api/contacts/${contactId}/messages`, {
        type: "text",
        content: { body },
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
 * Append a message to the first page of the messages cache.
 * Deduplicates by message ID to handle race conditions with WebSocket.
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

    // Dedup: skip if message already exists in first page
    if (firstPage.messages.some((m) => m.id === message.id)) {
      return old
    }

    return {
      ...old,
      pages: [
        { ...firstPage, messages: [message, ...firstPage.messages] },
        ...old.pages.slice(1),
      ],
    }
  })
}
