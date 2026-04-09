"use client"

import type { Message } from "@/types/chat"

export function VideoMessage({ message, blobUrl }: { message: Message; blobUrl?: string }) {
  const src = blobUrl || message.media_url
  const caption = message.content?.body

  return (
    <div>
      {src ? (
        <video src={src} controls className="rounded max-w-full max-h-64" />
      ) : (
        <div className="w-48 h-32 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">Loading video...</div>
      )}
      {caption && <div className="mt-1 text-sm">{caption}</div>}
    </div>
  )
}
