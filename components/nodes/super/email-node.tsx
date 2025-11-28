"use client"

import { useState, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Mail, Edit3, Check, X, Sparkles } from "lucide-react"
import type { Platform } from "@/types"

export function EmailNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingField, setIsEditingField] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingFieldValue, setEditingFieldValue] = useState("")

  const platform = (data.platform || "web") as Platform
  const fieldLabel = data.fieldLabel || "Email Address"
  const validationRules = data.validationRules || {
    format: "RFC 5322",
    checkDomain: true,
    blockDisposable: true,
    required: true
  }

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "Email")
    }
  }, [data.label, isEditingLabel])

  useEffect(() => {
    if (!isEditingField) {
      setEditingFieldValue(fieldLabel)
    }
  }, [fieldLabel, isEditingField])

  const finishEditingLabel = () => {
    if (editingLabelValue.trim() && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue.trim() })
    }
    setIsEditingLabel(false)
  }

  const finishEditingField = () => {
    if (editingFieldValue.trim() && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, fieldLabel: editingFieldValue.trim() })
    }
    setIsEditingField(false)
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

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card ${getPlatformColor(platform)} transition-all ${
          selected ? `ring-1 ${getPlatformRing(platform)}` : ""
        }`}
        onDoubleClick={(e) => {
          console.log("Card double-clicked (Email Node)")
        }}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* Super Node Icon with sparkle indicator */}
            <div className="relative w-5 h-5 bg-purple-500 rounded-md flex items-center justify-center flex-shrink-0">
              <Mail className="w-3 h-3 text-white" />
              <Sparkles className="w-2 h-2 text-yellow-400 absolute -top-0.5 -right-0.5" />
            </div>

            {/* Editable Label */}
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") setIsEditingLabel(false)
                }}
                className="h-6 text-xs font-medium px-2 flex-1"
                autoFocus
              />
            ) : (
              <h3
                className="text-xs font-medium text-card-foreground flex-1 cursor-pointer hover:text-accent transition-colors"
                onClick={() => setIsEditingLabel(true)}
              >
                {data.label || "Email"}
              </h3>
            )}

            {/* Super Node Badge */}
            <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              Super
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3 pb-3 px-4">
          {/* Field Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-muted-foreground">Field Name</label>
              {isEditingField ? (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={finishEditingField}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => setIsEditingField(false)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setIsEditingField(true)}
                >
                  <Edit3 className="w-3 h-3" />
                </Button>
              )}
            </div>
            {isEditingField ? (
              <Input
                value={editingFieldValue}
                onChange={(e) => setEditingFieldValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingField()
                  if (e.key === "Escape") setIsEditingField(false)
                }}
                className="h-7 text-xs"
                placeholder="e.g., Email Address"
                autoFocus
              />
            ) : (
              <div className="text-xs text-card-foreground font-medium px-2 py-1 bg-muted/50 rounded">
                {fieldLabel}
              </div>
            )}
          </div>

          {/* Validation Info */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Validation</label>
            <div className="grid grid-cols-2 gap-1.5 text-[9px]">
              <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                <div className="w-1 h-1 rounded-full bg-green-500" />
                <span className="text-muted-foreground">{validationRules.format}</span>
              </div>
              {validationRules.checkDomain && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                  <div className="w-1 h-1 rounded-full bg-blue-500" />
                  <span className="text-muted-foreground">Domain check</span>
                </div>
              )}
              {validationRules.blockDisposable && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                  <div className="w-1 h-1 rounded-full bg-orange-500" />
                  <span className="text-muted-foreground">No disposable</span>
                </div>
              )}
              {validationRules.required && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                  <div className="w-1 h-1 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Required</span>
                </div>
              )}
            </div>
          </div>

          {/* Double-click hint */}
          <div className="text-center pt-1">
            <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
              <Sparkles className="w-2.5 h-2.5" />
              Double-click to configure
            </p>
          </div>
        </CardContent>

        {/* Connection Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-purple-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-purple-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}

