"use client"

import { useState, useRef, useCallback } from "react"
import { Send, Paperclip, Smile, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import EmojiPicker, { Theme, EmojiStyle } from "emoji-picker-react"
import { useTheme } from "next-themes"
import { useSendMessage } from "@/hooks/queries/use-messages"
import { CannedResponsePicker } from "./canned-response-picker"
import type { Message, Contact } from "@/types/chat"

interface MessageInputProps {
  contactId: string
  contact: Contact
  onAttachClick: () => void
  replyingTo: Message | null
  onClearReply: () => void
  onAtBottomChange: (atBottom: boolean) => void
}

export function MessageInput({
  contactId,
  contact,
  onAttachClick,
  replyingTo,
  onClearReply,
  onAtBottomChange,
}: MessageInputProps) {
  const [text, setText] = useState("")
  const [emojiOpen, setEmojiOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { resolvedTheme } = useTheme()
  const { mutate: sendMessage, isPending } = useSendMessage(contactId)

  // Derived state — no useEffect needed
  const cannedTriggered = text.startsWith("/")
  const cannedSearch = cannedTriggered ? text.slice(1) : ""

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isPending) return
    sendMessage(
      { body: trimmed, replyToMessageId: replyingTo?.id },
      {
        onSuccess: () => {
          setText("")
          onClearReply()
          onAtBottomChange(true)
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto"
          }
        },
      }
    )
  }, [text, isPending, sendMessage, replyingTo, onClearReply])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && replyingTo) {
        e.preventDefault()
        onClearReply()
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, replyingTo, onClearReply]
  )

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px"
    }
  }, [])

  const insertAtCursor = useCallback((value: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setText((prev) => prev + value)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = text.slice(0, start)
    const after = text.slice(end)
    const newText = before + value + after
    setText(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      const newPos = start + value.length
      textarea.setSelectionRange(newPos, newPos)
    })
  }, [text])

  const handleCannedSelect = useCallback((content: string) => {
    setText(content) // Setting text to non-"/" content auto-closes picker (cannedTriggered becomes false)
    textareaRef.current?.focus()
  }, [])

  const handleEmojiSelect = useCallback(
    (emojiData: { emoji: string }) => {
      insertAtCursor(emojiData.emoji)
      setEmojiOpen(false)
    },
    [insertAtCursor]
  )

  const replyPreview = replyingTo
    ? typeof replyingTo.content === "string"
      ? replyingTo.content
      : replyingTo.content?.body || `[${replyingTo.message_type}]`
    : ""

  return (
    <div className="border-t">
      {/* Reply indicator bar */}
      {replyingTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30">
          <div className="flex-1 border-l-2 border-primary pl-2.5 min-w-0">
            <div className="text-[10px] font-medium text-muted-foreground">
              Replying to {replyingTo.direction === "incoming" ? "Customer" : "You"}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              {replyPreview}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0 cursor-pointer"
            onClick={onClearReply}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Input toolbar */}
      <div className="flex items-end gap-2 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onAttachClick} className="flex-shrink-0 cursor-pointer">
          <Paperclip className="h-4 w-4" />
        </Button>

        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors flex-shrink-0 cursor-pointer"
              title="Emoji"
            >
              <Smile className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-auto p-0 border-0">
            <EmojiPicker
              emojiStyle={EmojiStyle.NATIVE}
              skinTonesDisabled
              theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
              onEmojiClick={handleEmojiSelect}
            />
          </PopoverContent>
        </Popover>

        <CannedResponsePicker
          contact={contact}
          externalOpen={cannedTriggered}
          externalSearch={cannedSearch}
          onSelect={handleCannedSelect}
          onClose={() => setText("")}
        />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || isPending}
          className="flex-shrink-0 cursor-pointer"
        >
          {isPending ? (
            <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
