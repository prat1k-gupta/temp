"use client"

import type { Message } from "@/types/chat"

export function TemplateMessage({ message }: { message: Message }) {
  const body = message.content?.body || ""
  const templateName = message.template_name

  return (
    <div>
      {templateName && (
        <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Template: {templateName}</div>
      )}
      <div className="whitespace-pre-wrap">{body}</div>
    </div>
  )
}
