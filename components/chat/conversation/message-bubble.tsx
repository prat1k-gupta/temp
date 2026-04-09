"use client"

import { cn } from "@/lib/utils"
import { Check, CheckCheck, Clock, AlertCircle } from "lucide-react"
import type { Message } from "@/types/chat"
import { TextMessage } from "@/components/chat/messages/text-message"
import { ImageMessage } from "@/components/chat/messages/image-message"
import { VideoMessage } from "@/components/chat/messages/video-message"
import { AudioMessage } from "@/components/chat/messages/audio-message"
import { DocumentMessage } from "@/components/chat/messages/document-message"
import { TemplateMessage } from "@/components/chat/messages/template-message"
import { InteractiveMessage } from "@/components/chat/messages/interactive-message"
import { ButtonReplyMessage } from "@/components/chat/messages/button-reply-message"
import { LocationMessage } from "@/components/chat/messages/location-message"
import { ContactsMessage } from "@/components/chat/messages/contacts-message"
import { StickerMessage } from "@/components/chat/messages/sticker-message"
import { UnsupportedMessage } from "@/components/chat/messages/unsupported-message"

interface MessageBubbleProps {
  message: Message
  blobUrl?: string
  isGrouped?: boolean
  showAvatar?: boolean
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  sending: <Clock className="h-3 w-3 text-muted-foreground" />,
  sent: <Check className="h-3 w-3 text-muted-foreground" />,
  delivered: <CheckCheck className="h-3 w-3 text-muted-foreground" />,
  read: <CheckCheck className="h-3 w-3 text-blue-500" />,
  failed: <AlertCircle className="h-3 w-3 text-destructive" />,
}

export function MessageBubble({ message, blobUrl, isGrouped = false, showAvatar = true }: MessageBubbleProps) {
  const isOutgoing = message.direction === "outgoing"
  const time = new Date(message.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div
      className={cn(
        "flex",
        isGrouped ? "mb-0.5" : "mb-2",
        isOutgoing ? "justify-end" : "justify-start",
        !showAvatar && !isOutgoing && "pl-10"
      )}
    >
      <div
        className={cn(
          "max-w-[75%] px-3 py-2 text-sm",
          isOutgoing
            ? "bg-primary/20 text-foreground rounded-2xl rounded-br-sm"
            : "bg-muted/50 rounded-2xl rounded-bl-sm"
        )}
      >
        {message.reply_to_message && (
          <div className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border-l-2 border-primary/50 text-xs">
            <div className="font-medium text-[10px] text-muted-foreground mb-0.5">
              {message.reply_to_message.direction === "incoming" ? "Customer" : "You"}
            </div>
            <div className="line-clamp-2 opacity-80">
              {typeof message.reply_to_message.content === "string"
                ? message.reply_to_message.content
                : message.reply_to_message.content?.body || ""}
            </div>
          </div>
        )}

        <MessageContent message={message} blobUrl={blobUrl} />

        {!isGrouped && (
          <div className={cn("flex items-center gap-1 mt-1", isOutgoing ? "justify-end" : "justify-start")}>
            <span className="text-[10px] text-muted-foreground">
              {time}
            </span>
            {isOutgoing && STATUS_ICONS[message.status]}
          </div>
        )}

        {message.status === "failed" && message.error_message && (
          <div className="text-xs text-destructive mt-1">{message.error_message}</div>
        )}
      </div>
    </div>
  )
}

function MessageContent({ message, blobUrl }: { message: Message; blobUrl?: string }) {
  switch (message.message_type) {
    case "text": return <TextMessage message={message} />
    case "image": return <ImageMessage message={message} blobUrl={blobUrl} />
    case "video": return <VideoMessage message={message} blobUrl={blobUrl} />
    case "audio": return <AudioMessage message={message} blobUrl={blobUrl} />
    case "document": return <DocumentMessage message={message} blobUrl={blobUrl} />
    case "template": return <TemplateMessage message={message} />
    case "interactive": return <InteractiveMessage message={message} />
    case "button_reply": return <ButtonReplyMessage message={message} />
    case "location": return <LocationMessage message={message} />
    case "contacts": return <ContactsMessage message={message} />
    case "sticker": return <StickerMessage message={message} blobUrl={blobUrl} />
    default: return <UnsupportedMessage message={message} />
  }
}
