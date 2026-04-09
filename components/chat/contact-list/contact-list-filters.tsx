"use client"

import { cn } from "@/lib/utils"

const CHANNELS = [
  { label: "All", value: null },
  { label: "WhatsApp", value: "whatsapp" as const },
  { label: "Instagram", value: "instagram" as const },
]

interface ContactListFiltersProps {
  channel: "whatsapp" | "instagram" | null
  onChannelChange: (channel: "whatsapp" | "instagram" | null) => void
}

export function ContactListFilters({ channel, onChannelChange }: ContactListFiltersProps) {
  return (
    <div className="flex gap-1 px-3 py-2">
      {CHANNELS.map((ch) => (
        <button
          key={ch.label}
          onClick={() => onChannelChange(ch.value)}
          className={cn(
            "px-3 py-1 text-xs rounded-full transition-colors cursor-pointer",
            channel === ch.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {ch.label}
        </button>
      ))}
    </div>
  )
}
