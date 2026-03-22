"use client"

import { ExternalLink, Copy, Phone } from "lucide-react"
import { VariableHighlightText } from "@/components/variable-highlight-text"

interface TemplateButton {
  type: "quick_reply" | "url" | "phone_number" | "copy_code"
  text: string
  url?: string
  phone_number?: string
  example_code?: string
}

interface TemplatePreviewProps {
  headerType?: "none" | "text" | "image" | "video" | "document"
  headerContent?: string
  body: string
  footer?: string
  buttons?: TemplateButton[]
}

export function TemplatePreview({ headerType, headerContent, body, footer, buttons }: TemplatePreviewProps) {

  return (
    <div className="w-[320px] mx-auto">
      {/* Phone frame */}
      <div className="rounded-2xl overflow-hidden border border-border shadow-lg bg-white dark:bg-zinc-900">
        {/* WhatsApp header */}
        <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <div>
            <p className="text-white text-sm font-medium">Business</p>
            <p className="text-white/60 text-[10px]">online</p>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-[#efeae2] dark:bg-zinc-800 p-3 min-h-[300px]">
          {/* Bot message bubble */}
          <div className="max-w-[85%]">
            <div className="bg-white dark:bg-zinc-700 rounded-lg rounded-tl-none shadow-sm overflow-hidden">
              {/* Header */}
              {headerType && headerType !== "none" && (
                <div className="px-3 pt-2">
                  {headerType === "text" && headerContent && (
                    <VariableHighlightText
                      text={headerContent}
                      className="text-sm font-bold text-gray-900 dark:text-gray-100"
                    />
                  )}
                  {headerType === "image" && (
                    <div className="w-full h-32 bg-gray-200 dark:bg-zinc-600 rounded flex items-center justify-center">
                      <span className="text-gray-400 dark:text-zinc-400 text-xs">Image</span>
                    </div>
                  )}
                  {headerType === "video" && (
                    <div className="w-full h-32 bg-gray-200 dark:bg-zinc-600 rounded flex items-center justify-center">
                      <span className="text-gray-400 dark:text-zinc-400 text-xs">Video</span>
                    </div>
                  )}
                  {headerType === "document" && (
                    <div className="w-full h-16 bg-gray-200 dark:bg-zinc-600 rounded flex items-center justify-center">
                      <span className="text-gray-400 dark:text-zinc-400 text-xs">Document</span>
                    </div>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="px-3 py-2">
                {body ? (
                  <VariableHighlightText
                    text={body}
                    className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed"
                  />
                ) : (
                  <span className="text-sm text-gray-400">Template body text...</span>
                )}
              </div>

              {/* Footer */}
              {footer && (
                <div className="px-3 pb-2">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">{footer}</p>
                </div>
              )}

              {/* Timestamp */}
              <div className="px-3 pb-1.5 flex justify-end">
                <span className="text-[10px] text-gray-400">12:00 PM</span>
              </div>
            </div>

            {/* Buttons below bubble */}
            {buttons && buttons.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {buttons.map((btn, idx) => (
                  <div key={idx}>
                    <div className="bg-white dark:bg-zinc-700 rounded-lg shadow-sm px-3 py-2 flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-600">
                      {btn.type === "url" && <ExternalLink className="w-3.5 h-3.5 text-[#00a884]" />}
                      {btn.type === "phone_number" && <Phone className="w-3.5 h-3.5 text-[#00a884]" />}
                      {btn.type === "copy_code" && <Copy className="w-3.5 h-3.5 text-[#00a884]" />}
                      <span className="text-sm text-[#00a884] font-medium">{btn.text || `Button ${idx + 1}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div className="bg-[#f0f2f5] dark:bg-zinc-900 px-3 py-2 flex items-center gap-2">
          <div className="flex-1 bg-white dark:bg-zinc-800 rounded-full px-4 py-1.5">
            <span className="text-sm text-gray-400">Type a message</span>
          </div>
        </div>
      </div>
    </div>
  )
}
