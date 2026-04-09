"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useContact } from "@/hooks/queries/use-contacts"
import { useWebSocket } from "@/hooks/use-websocket"
import { contactKeys } from "@/hooks/queries/query-keys"
import type { Contact as ContactType, ContactsResponse } from "@/types/chat"
import { ConversationHeader } from "./conversation-header"
import { MessageList } from "./message-list"
import { MessageInput } from "./message-input"
import { MediaUploadPreview } from "./media-upload-preview"
import type { Message } from "@/types/chat"

interface ConversationProps {
  contactId: string
  isAtBottom: boolean
  onAtBottomChange: (atBottom: boolean) => void
  replyingTo: Message | null
  onReply: (message: Message) => void
  onClearReply: () => void
  showInfoPanel?: boolean
  onInfoToggle?: () => void
}

export function Conversation({ contactId, isAtBottom, onAtBottomChange, replyingTo, onReply, onClearReply, showInfoPanel, onInfoToggle }: ConversationProps) {
  const queryClient = useQueryClient()
  const { data: contact, isLoading } = useContact(contactId)
  const { sendEvent } = useWebSocket()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tell server which contact we're viewing + reset unread count in cache
  useEffect(() => {
    sendEvent("set_contact", { contact_id: contactId })

    // Reset unread count in contact list cache (backend marks as read on fetch)
    queryClient.setQueriesData<{ pages: ContactsResponse[]; pageParams: unknown[] }>(
      { queryKey: contactKeys.lists() },
      (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            contacts: page.contacts.map((c: ContactType) =>
              c.id === contactId ? { ...c, unread_count: 0 } : c
            ),
          })),
        }
      }
    )

    return () => {
      sendEvent("set_contact", { contact_id: null })
    }
  }, [contactId, sendEvent, queryClient])

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
    // Reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  if (isLoading || !contact) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <>
      <ConversationHeader contact={contact} showInfoPanel={showInfoPanel} onInfoToggle={onInfoToggle} />
      <MessageList
        contactId={contactId}
        isAtBottom={isAtBottom}
        onAtBottomChange={onAtBottomChange}
        onReply={onReply}
      />
      <MessageInput
        contactId={contactId}
        contact={contact}
        onAttachClick={handleAttachClick}
        replyingTo={replyingTo}
        onClearReply={onClearReply}
        onAtBottomChange={onAtBottomChange}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        className="hidden"
        onChange={handleFileChange}
      />

      {selectedFile && (
        <MediaUploadPreview
          file={selectedFile}
          contactId={contactId}
          onClose={() => setSelectedFile(null)}
          onSent={() => setSelectedFile(null)}
        />
      )}
    </>
  )
}
