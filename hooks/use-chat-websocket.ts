"use client"

import { useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket } from "@/hooks/use-websocket"
import { contactKeys, messageKeys } from "@/hooks/queries/query-keys"
import type {
  Contact,
  ContactsResponse,
  Message,
  MessagesResponse,
} from "@/types/chat"

type InfiniteData<T> = { pages: T[]; pageParams: unknown[] }

/**
 * Subscribe to WebSocket events and patch React Query caches
 * for real-time message delivery and status updates.
 */
export function useChatWebSocket(activeContactId: string | null) {
  const queryClient = useQueryClient()
  const { subscribe } = useWebSocket()

  // Keep a ref so event handlers always see the latest value
  // without needing to re-subscribe on every change.
  const activeContactIdRef = useRef(activeContactId)
  activeContactIdRef.current = activeContactId

  const handleNewMessage = useCallback(
    (payload: Message) => {
      const contactId = payload.contact_id
      const viewingThisContact = activeContactIdRef.current === contactId

      // --- Patch message cache (only if this contact's messages are loaded) ---
      if (viewingThisContact) {
        queryClient.setQueryData<InfiniteData<MessagesResponse>>(
          messageKeys.list(contactId),
          (old) => {
            if (!old) return old

            // Dedup: check all pages for existing message
            for (const page of old.pages) {
              if (page.messages.some((m) => m.id === payload.id)) {
                return old
              }
            }

            // API returns messages in ASC order (oldest first).
            // New messages go at the end of the first page (most recent).
            const firstPage = old.pages[0]
            if (!firstPage) return old

            return {
              ...old,
              pages: [
                { ...firstPage, messages: [...firstPage.messages, payload] },
                ...old.pages.slice(1),
              ],
            }
          }
        )
      }

      // --- Patch contact list cache (all matching query keys) ---
      queryClient.setQueriesData<InfiniteData<ContactsResponse>>(
        { queryKey: contactKeys.lists() },
        (old) => {
          if (!old) return old

          // Flatten all contacts from all pages
          const allContacts = old.pages.flatMap((page) => page.contacts)

          const idx = allContacts.findIndex((c) => c.id === contactId)
          let contact: Contact

          if (idx >= 0) {
            contact = {
              ...allContacts[idx],
              last_message_preview:
                payload.content?.body ?? allContacts[idx].last_message_preview,
              last_message_at: payload.created_at,
              unread_count: viewingThisContact
                ? allContacts[idx].unread_count
                : allContacts[idx].unread_count + 1,
            }
            allContacts.splice(idx, 1)
          } else {
            // Contact not in cache yet -- skip patching, let next fetch pick it up
            return old
          }

          // Move to top
          allContacts.unshift(contact)

          // Merge everything into page 0, keep last page intact for getNextPageParam
          if (old.pages.length <= 1) {
            return {
              ...old,
              pages: [
                {
                  ...old.pages[0],
                  contacts: allContacts,
                  total: old.pages[0].total,
                },
              ],
            }
          }

          const lastPage = old.pages[old.pages.length - 1]
          return {
            ...old,
            pages: [
              {
                ...old.pages[0],
                contacts: allContacts,
                total: old.pages[0].total,
              },
              // Keep last page intact so getNextPageParam can read its shape
              lastPage,
            ],
            pageParams: [old.pageParams[0], old.pageParams[old.pageParams.length - 1]],
          }
        }
      )
    },
    [queryClient]
  )

  const handleStatusUpdate = useCallback(
    (payload: { id: string; status: Message["status"] }) => {
      const contactId = activeContactIdRef.current
      if (!contactId) return

      queryClient.setQueryData<InfiniteData<MessagesResponse>>(
        messageKeys.list(contactId),
        (old) => {
          if (!old) return old

          let found = false
          const updatedPages = old.pages.map((page) => {
            const msgIdx = page.messages.findIndex(
              (m) => m.id === payload.id
            )
            if (msgIdx === -1) return page

            found = true
            const updatedMessages = [...page.messages]
            updatedMessages[msgIdx] = {
              ...updatedMessages[msgIdx],
              status: payload.status,
            }
            return { ...page, messages: updatedMessages }
          })

          return found ? { ...old, pages: updatedPages } : old
        }
      )
    },
    [queryClient]
  )

  useEffect(() => {
    const unsubMessage = subscribe("new_message", handleNewMessage)
    const unsubStatus = subscribe("status_update", handleStatusUpdate)

    return () => {
      unsubMessage()
      unsubStatus()
    }
  }, [subscribe, handleNewMessage, handleStatusUpdate])
}
