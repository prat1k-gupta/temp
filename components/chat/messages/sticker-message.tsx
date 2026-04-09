"use client"

import type { Message } from "@/types/chat"

export function StickerMessage({ message, blobUrl }: { message: Message; blobUrl?: string }) {
  const src = blobUrl || message.media_url

  return src ? (
    <img src={src} alt="Sticker" className="w-32 h-32 object-contain" />
  ) : (
    <div className="w-32 h-32 bg-muted rounded flex items-center justify-center text-xs">🎭</div>
  )
}
