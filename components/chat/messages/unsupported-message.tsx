"use client"

import type { Message } from "@/types/chat"

export function UnsupportedMessage({ message }: { message: Message }) {
  return (
    <div className="text-xs italic opacity-70">
      This message type ({message.message_type}) is not supported yet
    </div>
  )
}
