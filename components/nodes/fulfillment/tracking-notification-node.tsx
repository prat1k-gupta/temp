"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Edit3, PackageSearch, MapPin, Clock } from "lucide-react"
import { useState, useEffect } from "react"
import type { Platform } from "@/types"
import { getNodeLimits } from "@/constants"
import { VariableHighlightText } from "@/components/variable-highlight-text"

export function TrackingNotificationNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingMessageValue, setEditingMessageValue] = useState("")

  const platform = (data.platform || "web") as Platform
  const nodeType = "trackingNotification"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxLength = nodeLimits.text?.max ?? 500

  // Generate formatted message from template
  const generateFormattedMessage = () => {
    let message = data.message || ""
    
    // Replace {{variable}} with variable names (for preview)
    // Actual resolution happens at runtime
    const variableRegex = /\{\{(\w+)\}\}/g
    message = message.replace(variableRegex, (_match: string, varName: string) => {
      // Show variable name in preview, will be resolved at runtime
      return `[${varName}]`
    })
    
    // Remove free sample note if disabled
    if (data.showFreeSampleNote === false) {
      message = message.replace(/\n\nPlease note this is a FREE sample and no payment is required at the time of delivery/g, "")
      message = message.replace(/Please note this is a FREE sample and no payment is required at the time of delivery\n\n/g, "")
      message = message.replace(/Please note this is a FREE sample and no payment is required at the time of delivery/g, "")
    }
    
    return message
  }

  const formattedMessage = generateFormattedMessage()

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "")
    }
  }, [data.label, isEditingLabel])

  useEffect(() => {
    if (!isEditingMessage) {
      setEditingMessageValue(data.message || "")
    }
  }, [data.message, isEditingMessage])

  const isOverLimit = (text: string) => text.length > maxLength

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
    setEditingMessageValue(data.message || "")
    setIsEditingMessage(true)
  }

  const finishEditingMessage = () => {
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, message: editingMessageValue })
    }
    setIsEditingMessage(false)
  }

  const cancelEditingMessage = () => {
    setEditingMessageValue(data.message || "")
    setIsEditingMessage(false)
  }

  const getPlatformColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "border-blue-100 dark:border-blue-900"
      case "whatsapp":
        return "border-green-100 dark:border-green-900"
      case "instagram":
        return "border-pink-100 dark:border-pink-900"
    }
  }

  const getPlatformRing = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "ring-blue-300/50 dark:ring-blue-600/50"
      case "whatsapp":
        return "ring-green-300/50 dark:ring-green-600/50"
      case "instagram":
        return "ring-pink-300/50 dark:ring-pink-600/50"
    }
  }

  const getPlatformHandleColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-500"
      case "whatsapp":
        return "bg-green-500"
      case "instagram":
        return "bg-pink-500"
    }
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card ${getPlatformColor(platform)} transition-all ${
          selected ? `ring-1 ${getPlatformRing(platform)}` : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#052762] rounded-md flex items-center justify-center flex-shrink-0">
              <PackageSearch className="w-3 h-3 text-white" />
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
                className="h-6 text-sm font-medium border-[#052762]/20"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-accent/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                onClick={startEditingLabel}
              >
                {data.label || "Tracking Notification"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          {isEditingMessage ? (
            <div className="space-y-2">
              <Textarea
                value={editingMessageValue}
                onChange={(e) => setEditingMessageValue(e.target.value)}
                onBlur={finishEditingMessage}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingMessage()
                  }
                  if (e.key === "Escape") cancelEditingMessage()
                }}
                className={`text-sm min-h-[60px] resize-none border-[#052762]/20 focus:border-[#052762]/40 ${
                  isOverLimit(editingMessageValue) ? "border-red-300" : ""
                }`}
                placeholder="Enter tracking notification message..."
                autoFocus
              />
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
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-4 cursor-pointer hover:bg-accent/30 px-2 py-1.5 rounded border border-transparent hover:border-accent transition-colors whitespace-pre-line"
              onClick={startEditingMessage}
            >
              <VariableHighlightText text={formattedMessage || "Your order is on the way! Track your delivery in real-time."} />
            </div>
          )}

          {/* Variable Mappings Summary */}
          {data.variableMappings && Object.keys(data.variableMappings).length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-border">
              <div className="text-[10px] font-medium text-muted-foreground mb-1">Variable Mappings:</div>
              {Object.entries(data.variableMappings).map(([variable, mapping]: [string, any]) => {
                if (!mapping?.nodeId) return null
                return (
                  <div key={variable} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <code className="bg-muted px-1 rounded">{"{{" + variable + "}}"}</code>
                    <span>→</span>
                    <span className="truncate">{mapping.field || "field"}</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className={`w-3 h-3 ${getPlatformHandleColor(platform)} border-2 border-background opacity-100 hover:scale-110 transition-transform`}
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className={`w-3 h-3 ${getPlatformHandleColor(platform)} border-2 border-background opacity-100 hover:scale-110 transition-transform`}
          />
        </div>
      </Card>
    </div>
  )
}

