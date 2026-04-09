"use client"

import type { ReactNode } from "react"

interface ChatLayoutProps {
  contactList: ReactNode
  conversation: ReactNode
  infoPanel?: ReactNode
}

export function ChatLayout({ contactList, conversation, infoPanel }: ChatLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <div className="w-80 border-r flex-shrink-0 overflow-hidden">
        {contactList}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        {conversation}
      </div>
      {infoPanel && (
        <div className="w-80 border-l flex-shrink-0 overflow-hidden">
          {infoPanel}
        </div>
      )}
    </div>
  )
}
