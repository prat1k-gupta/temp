"use client"

import { memo, useState, useEffect } from "react"
import type { Platform } from "@/types"
import { BaseNode } from "../core/base-node"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Edit2, Check, X, Send } from "lucide-react"
import { InstagramIcon } from "@/components/platform-icons"
import { getPlatformConfig } from "@/lib/platform-config"

interface InstagramDMNodeData {
  text: string
  platform: Platform
  id: string
  onNodeUpdate: (id: string, data: any) => void
}

export const InstagramDMNode = memo(({ data }: { data: InstagramDMNodeData }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editingValue, setEditingValue] = useState(data.text)

  const platformConfig = getPlatformConfig(data.platform)
  const maxLength = platformConfig.messageMaxLength

  useEffect(() => {
    setEditingValue(data.text)
  }, [data.text])

  const handleSave = () => {
    data.onNodeUpdate(data.id, { text: editingValue })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditingValue(data.text)
    setIsEditing(false)
  }

  const isOverLimit = editingValue.length > maxLength

  return (
    <BaseNode data={data}>
      <div className="min-w-[280px] max-w-[350px] p-4">
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ backgroundColor: "#e4405f" }}>
          <Send className="w-4 h-4 text-white" />
          <span className="text-xs font-medium text-white">Instagram DM</span>
        </div>

        {/* Message Content */}
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              className={`text-sm resize-none ${isOverLimit ? "border-red-500" : ""}`}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) handleSave()
                if (e.key === "Escape") handleCancel()
              }}
              autoFocus
            />

            <div className="flex items-center justify-between">
              <span className={`text-xs ${isOverLimit ? "text-red-500" : "text-gray-500"}`}>
                {editingValue.length}/{maxLength}
                {isOverLimit && <span className="ml-1 bg-red-100 text-red-600 px-1 rounded text-xs">Over limit</span>}
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={handleSave} disabled={isOverLimit}>
                  <Check className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="cursor-pointer hover:bg-gray-50 p-2 rounded border border-gray-200 min-h-[60px] flex items-center"
            onClick={() => setIsEditing(true)}
          >
            <div className="flex-1">
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{data.text || "Click to add message..."}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">
                  {data.text.length}/{maxLength} characters
                </span>
                <Edit2 className="w-3 h-3 text-muted-foreground" />
              </div>
            </div>
          </div>
        )}
      </div>
    </BaseNode>
  )
})

InstagramDMNode.displayName = "InstagramDMNode"
