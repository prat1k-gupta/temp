"use client"

import { PanelRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Contact } from "@/types/chat"
import { cn } from "@/lib/utils"

interface ConversationHeaderProps {
  contact: Contact
  showInfoPanel?: boolean
  onInfoToggle?: () => void
}

export function ConversationHeader({ contact, showInfoPanel, onInfoToggle }: ConversationHeaderProps) {
  const initials = (contact.name || contact.profile_name || "?")
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b shadow-sm">
      <div className="flex items-center gap-3">
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

      {onInfoToggle && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onInfoToggle}
          className={cn("h-8 w-8 cursor-pointer", showInfoPanel && "bg-muted")}
          title="Contact Info"
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
