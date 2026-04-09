"use client"

import { useState, useRef, useCallback } from "react"
import { Send, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSendMessage } from "@/hooks/queries/use-messages"

interface MessageInputProps {
  contactId: string
  onAttachClick: () => void
}

export function MessageInput({ contactId, onAttachClick }: MessageInputProps) {
  const [text, setText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { mutate: sendMessage, isPending } = useSendMessage(contactId)

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || isPending) return
    sendMessage(trimmed, {
      onSuccess: () => {
        setText("")
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto"
        }
      },
    })
  }, [text, isPending, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px"
    }
  }, [])

  return (
    <div className="flex items-end gap-2 px-4 py-3 border-t">
      <Button variant="ghost" size="icon" onClick={onAttachClick} className="flex-shrink-0 cursor-pointer">
        <Paperclip className="h-4 w-4" />
      </Button>

      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => { setText(e.target.value); handleInput() }}
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
  )
}
