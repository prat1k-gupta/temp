"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useContact } from "@/hooks/queries/use-contacts"
import { useWebSocket } from "@/hooks/use-websocket"
import { ConversationHeader } from "./conversation-header"
import { MessageList } from "./message-list"
import { MessageInput } from "./message-input"
import { MediaUploadPreview } from "./media-upload-preview"

interface ConversationProps {
  contactId: string
  isAtBottom: boolean
  onAtBottomChange: (atBottom: boolean) => void
}

export function Conversation({ contactId, isAtBottom, onAtBottomChange }: ConversationProps) {
  const { data: contact, isLoading } = useContact(contactId)
  const { sendEvent } = useWebSocket()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tell server which contact we're viewing (for broadcast scoping + read status)
  useEffect(() => {
    sendEvent("set_contact", { contact_id: contactId })
    return () => {
      sendEvent("set_contact", { contact_id: null })
    }
  }, [contactId, sendEvent])

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
      <ConversationHeader contact={contact} />
      <MessageList
        contactId={contactId}
        isAtBottom={isAtBottom}
        onAtBottomChange={onAtBottomChange}
      />
      <MessageInput
        contactId={contactId}
        onAttachClick={handleAttachClick}
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
