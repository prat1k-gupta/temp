"use client"

import { useState, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Calendar, Edit3, Sparkles } from "lucide-react"
import type { Platform } from "@/types"

export function DobNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const platform = (data.platform || "web") as Platform
  const fieldLabel = data.fieldLabel || "Date of Birth"
  const validationRules = data.validationRules || {
    minAge: 13,
    maxAge: 120,
    format: "DD/MM/YYYY",
    required: true
  }

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "DOB")
    }
  }, [data.label, isEditingLabel])

  const finishEditingLabel = () => {
    if (editingLabelValue.trim() && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue.trim() })
    }
    setIsEditingLabel(false)
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
          console.log("Card double-clicked (DOB Node)")
        }}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* Super Node Icon with sparkle indicator */}
            <div className="relative w-5 h-5 bg-purple-500 rounded-md flex items-center justify-center flex-shrink-0">
              <Calendar className="w-3 h-3 text-white" />
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
                {data.label || "DOB"}
              </h3>
            )}

            {/* Super Node Badge */}
            <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              Super
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3 pb-3 px-4">
          {/* Field Label */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground">Field Name</label>
            <div className="text-xs text-card-foreground font-medium px-2 py-1 bg-muted/50 rounded">
              {fieldLabel}
            </div>
          </div>

          {/* Validation Info */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Validation</label>
            <div className="grid grid-cols-2 gap-1.5 text-[9px]">
              <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                <div className="w-1 h-1 rounded-full bg-orange-500" />
                <span className="text-muted-foreground">Min age: {validationRules.minAge}</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                <div className="w-1 h-1 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">{validationRules.format}</span>
              </div>
              {validationRules.required && (
                <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                  <div className="w-1 h-1 rounded-full bg-red-500" />
                  <span className="text-muted-foreground">Required</span>
                </div>
              )}
              <div className="flex items-center gap-1 px-2 py-1 bg-muted/30 rounded">
                <div className="w-1 h-1 rounded-full bg-green-500" />
                <span className="text-muted-foreground">No future dates</span>
              </div>
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

