"use client"

import type { Message } from "@/types/chat"

export function InteractiveMessage({ message, blobUrl }: { message: Message; blobUrl?: string }) {
  const body = message.content?.body || ""
  const interactive = message.interactive_data
  const mediaHeader = interactive?.media_header
  const mediaSrc = blobUrl || message.media_url

  return (
    <div>
      {mediaSrc && mediaHeader?.type === "video" && (
        <video src={mediaSrc} controls className="rounded max-w-full max-h-48 mb-2" />
      )}
      {mediaSrc && mediaHeader?.type === "image" && (
        <img src={mediaSrc} alt="" className="rounded max-w-full max-h-48 mb-2 cursor-pointer" onClick={() => window.open(mediaSrc, "_blank")} />
      )}
      {!mediaHeader && mediaSrc && (
        <img src={mediaSrc} alt="" className="rounded max-w-full max-h-48 mb-2 cursor-pointer" onClick={() => window.open(mediaSrc, "_blank")} />
      )}
      <div className="whitespace-pre-wrap">{body}</div>
      {interactive?.buttons && (
        <div className="mt-2 space-y-1">
          {interactive.buttons.map((btn: any, i: number) => (
            <div key={i} className="text-center text-xs py-1.5 bg-background/80 border border-border rounded font-medium text-primary">
              {btn.title || btn.text || `Button ${i + 1}`}
            </div>
          ))}
        </div>
      )}
      {interactive?.sections && (
        <div className="mt-2 text-xs text-center py-1.5 bg-background/80 border border-border rounded font-medium text-primary">
          ☰ {interactive.button_text || "View options"}
        </div>
      )}
    </div>
  )
}
