"use client"

import { useState } from "react"
import { CornerUpLeft, Smile, RotateCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Message } from "@/types/chat"
import { cn } from "@/lib/utils"

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

interface MessageActionsProps {
  message: Message
  onReply: (message: Message) => void
  onReact: (messageId: string, emoji: string) => void
  onRetry: (message: Message) => void
  isRetrying?: boolean
}

export function MessageActions({
  message,
  onReply,
  onReact,
  onRetry,
  isRetrying = false,
}: MessageActionsProps) {
  const [emojiOpen, setEmojiOpen] = useState(false)
  const isOutgoing = message.direction === "outgoing"

  const showRetry =
    message.status === "failed" &&
    isOutgoing &&
    message.message_type === "text"

  const currentUserReaction = (message.reactions ?? []).find(
    (r) => r.from_user === "self"
  )

  const handleEmojiClick = (emoji: string) => {
    if (currentUserReaction?.emoji === emoji) {
      onReact(message.id, "")
    } else {
      onReact(message.id, emoji)
    }
    setEmojiOpen(false)
  }

  return (
    <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-center ml-1">

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 cursor-pointer"
        onClick={() => onReply(message)}
        title="Reply"
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </Button>

      <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center justify-center h-7 w-7 rounded-md cursor-pointer",
              "hover:bg-muted transition-colors"
            )}
            title="React"
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="w-auto p-1.5">
          <div className="flex gap-1">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                className={cn(
                  "text-lg hover:bg-muted rounded-md w-8 h-8 flex items-center justify-center cursor-pointer transition-colors",
                  currentUserReaction?.emoji === emoji && "bg-muted ring-1 ring-primary"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {showRetry && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive cursor-pointer"
          onClick={() => onRetry(message)}
          disabled={isRetrying}
          title="Retry"
        >
          {isRetrying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  )
}
