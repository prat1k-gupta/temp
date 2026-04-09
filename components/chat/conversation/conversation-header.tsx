"use client"

import type { Contact } from "@/types/chat"

interface ConversationHeaderProps {
  contact: Contact
}

export function ConversationHeader({ contact }: ConversationHeaderProps) {
  const initials = (contact.name || contact.profile_name || "?")
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b shadow-sm">
      {contact.avatar_url ? (
        <img src={contact.avatar_url} alt="" className="w-9 h-9 rounded-full" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
          {initials}
        </div>
      )}
      <div>
        <div className="font-medium text-sm">
          {contact.name || contact.profile_name || contact.phone_number}
        </div>
        <div className="text-xs text-muted-foreground">
          {contact.channel === "instagram" ? "Instagram" : "WhatsApp"}
          {contact.phone_number ? ` · ${contact.phone_number}` : ""}
        </div>
      </div>
    </div>
  )
}
