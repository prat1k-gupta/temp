"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { VariablePickerTextarea } from "@/components/variable-picker-textarea"
import { VariableHighlightText } from "@/components/variable-highlight-text"
import { Badge } from "@/components/ui/badge"
import { Edit3 } from "lucide-react"
import { WhatsAppIcon } from "@/components/platform-icons"
import { MediaAttachment } from "@/components/nodes/shared/media-attachment"
import { AIToolbar } from "@/components/ai"
import { useState, useEffect, useRef } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"

export function WhatsAppMessageNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingMessageValue, setEditingMessageValue] = useState("")
  const editingContainerRef = useRef<HTMLDivElement>(null)

  const platform = (data.platform || "whatsapp") as Platform
  const nodeLimits = getNodeLimits("whatsappMessage", platform)
  const maxLength = nodeLimits.text?.max ?? 4096

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "")
    }
  }, [data.label, isEditingLabel])

  useEffect(() => {
    if (!isEditingMessage) {
      setEditingMessageValue(data.text || "")
    }
  }, [data.text, isEditingMessage])

  const isOverLimit = (text: string) => {
    return text.length > maxLength
  }

  const startEditingLabel = () => {
    setEditingLabelValue(data.label || "")
    setIsEditingLabel(true)
  }

  const finishEditingLabel = () => {
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue })
    }
    setIsEditingLabel(false)
  }

  const cancelEditingLabel = () => {
    setEditingLabelValue(data.label || "")
    setIsEditingLabel(false)
  }

  const startEditingMessage = () => {
    setEditingMessageValue(data.text || "")
    setIsEditingMessage(true)
  }

  const finishEditingMessage = (e?: React.FocusEvent<HTMLTextAreaElement>) => {
    // Don't finish editing if focus is moving to an element within the editing container (like AI toolbar)
    if (e?.relatedTarget && editingContainerRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, text: editingMessageValue })
    }
    setIsEditingMessage(false)
  }

  const cancelEditingMessage = () => {
    setEditingMessageValue(data.text || "")
    setIsEditingMessage(false)
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card border-green-100 dark:border-green-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 ${
          selected ? "ring-1 ring-green-300/50 dark:ring-green-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* WhatsApp Icon - Inside header, left side */}
            <div className="w-5 h-5 bg-green-500 rounded-md flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") cancelEditingLabel()
                }}
                className="h-6 text-sm font-medium border-green-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                onClick={startEditingLabel}
              >
                {data.label || "WhatsApp Message"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          <MediaAttachment
            media={data.media}
            selected={!!selected}
            onUpdate={(media) => {
              if (data.onNodeUpdate) {
                data.onNodeUpdate(data.id, { ...data, media })
              }
            }}
          />
          {isEditingMessage ? (
            <div ref={editingContainerRef} className="space-y-2 group/message">
              <VariablePickerTextarea
                value={editingMessageValue}
                onValueChange={setEditingMessageValue}
                onBlur={(e) => finishEditingMessage(e as any)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingMessage()
                  }
                  if (e.key === "Escape") cancelEditingMessage()
                }}
                className={`text-sm min-h-[60px] resize-none border-green-200 dark:border-green-800 focus:border-green-300 dark:focus:border-green-700 ${
                  isOverLimit(editingMessageValue) ? "border-red-300 dark:border-red-700" : ""
                }`}
                placeholder="Type your WhatsApp message..."
                autoFocus
                flowVariables={data.flowVariablesRich || []}
              />

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs ${
                      isOverLimit(editingMessageValue) ? "text-red-500" : "text-muted-foreground"
                    }`}
                  >
                    {editingMessageValue.length}/{maxLength}
                  </span>
                  {isOverLimit(editingMessageValue) && (
                    <Badge variant="destructive" className="text-xs h-5">
                      Too long
                    </Badge>
                  )}
                </div>
                <div className="opacity-0 group-hover/message:opacity-100 transition-opacity">
                  <AIToolbar
                    value={editingMessageValue}
                    onChange={setEditingMessageValue}
                    nodeType="whatsappMessage"
                    platform={platform}
                    field="text"
                    maxLength={maxLength}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-3 cursor-pointer hover:bg-green-50/30 dark:hover:bg-green-950/30 px-2 py-1.5 rounded border border-transparent hover:border-green-100 dark:hover:border-green-800 transition-colors"
              onClick={startEditingMessage}
            >
              <VariableHighlightText
                text={data.text || "Type your WhatsApp message..."}
                flowVariables={data.flowVariables || []}
              />
            </div>
          )}
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}
