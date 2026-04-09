"use client"

import type { Message } from "@/types/chat"

export function ButtonReplyMessage({ message }: { message: Message }) {
  return <div className="whitespace-pre-wrap">{message.content?.body || ""}</div>
}
