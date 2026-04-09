"use client"

import { User } from "lucide-react"
import type { Message } from "@/types/chat"

export function ContactsMessage({ message }: { message: Message }) {
  return (
    <div className="flex items-center gap-2">
      <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      <div className="text-sm">{message.content?.body || "Contact shared"}</div>
    </div>
  )
}
