"use client"

import type { Message } from "@/types/chat"

const URL_REGEX = /https?:\/\/[^\s<]+/g

function linkify(text: string) {
  const parts: (string | { url: string })[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push({ url: match[0] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export function TextMessage({ message }: { message: Message }) {
  const body = message.content?.body || ""

  if (!body) return null

  const parts = linkify(body)

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <a
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-all"
          >
            {part.url}
          </a>
        )
      )}
    </div>
  )
}
