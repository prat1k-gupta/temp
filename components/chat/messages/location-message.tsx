"use client"

import { MapPin } from "lucide-react"
import type { Message } from "@/types/chat"

export function LocationMessage({ message }: { message: Message }) {
  const body = message.content?.body || ""

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      <div className="text-sm">{body || "Location shared"}</div>
    </div>
  )
}
