"use client"

import { FileText, Download } from "lucide-react"
import type { Message } from "@/types/chat"

export function DocumentMessage({ message, blobUrl }: { message: Message; blobUrl?: string }) {
  const src = blobUrl || message.media_url
  const caption = message.content?.body

  return (
    <div className="flex items-center gap-2">
      <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{caption || "Document"}</div>
      </div>
      {src && (
        <a href={src} download className="cursor-pointer">
          <Download className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </a>
      )}
    </div>
  )
}
