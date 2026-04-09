"use client"

import { Suspense } from "react"
import { ChatLayout } from "@/components/chat/chat-layout"
import { ContactList } from "@/components/chat/contact-list/contact-list"
import { Conversation } from "@/components/chat/conversation/conversation"
import { useChat } from "@/hooks/use-chat"
import { useChatWebSocket } from "@/hooks/use-chat-websocket"
import { useWebSocket } from "@/hooks/use-websocket"

function ChatPageContent() {
  const { activeContactId, setActiveContact, isAtBottom, setIsAtBottom } = useChat()
  const { isConnected } = useWebSocket()
  useChatWebSocket(activeContactId)

  return (
    <div className="flex flex-col h-full">
      {!isConnected && (
        <div className="bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2 text-sm flex items-center gap-2">
          <div className="animate-spin h-3 w-3 border-2 border-yellow-600 border-t-transparent rounded-full" />
          Connection lost. Reconnecting...
        </div>
      )}
      <ChatLayout
        contactList={
          <ContactList
            activeContactId={activeContactId}
            onSelectContact={setActiveContact}
          />
        }
        conversation={
          activeContactId ? (
            <Conversation
              contactId={activeContactId}
              isAtBottom={isAtBottom}
              onAtBottomChange={setIsAtBottom}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a conversation to start messaging
            </div>
          )
        }
      />
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full">Loading...</div>}>
      <ChatPageContent />
    </Suspense>
  )
}
