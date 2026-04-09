"use client"

import { cn } from "@/lib/utils"
import { WhatsAppIcon, InstagramIcon } from "@/components/platform-icons"
import type { Contact } from "@/types/chat"

interface ContactListItemProps {
  contact: Contact
  isActive: boolean
  onClick: () => void
}

export function ContactListItem({ contact, isActive, onClick }: ContactListItemProps) {
  const initials = (contact.name || contact.profile_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const timeAgo = contact.last_message_at
    ? formatRelativeTime(contact.last_message_at)
    : ""

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-muted transition-colors cursor-pointer",
        isActive && "bg-muted"
      )}
    >
      {/* Avatar */}
      {contact.avatar_url ? (
        <img src={contact.avatar_url} alt="" className="w-10 h-10 rounded-full flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium flex-shrink-0">
          {initials}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm truncate">
            {contact.name || contact.profile_name || contact.phone_number}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {contact.last_message_preview || "No messages yet"}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Channel icon */}
            {contact.channel === "instagram" ? (
              <InstagramIcon className="h-3.5 w-3.5" />
            ) : (
              <WhatsAppIcon className="h-3.5 w-3.5" />
            )}
            {/* Unread badge */}
            {contact.unread_count > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {contact.unread_count > 99 ? "99+" : contact.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
