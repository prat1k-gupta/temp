"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PhoneForwarded, Edit3 } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { VariableHighlightText } from "@/components/variable-highlight-text"

export function TransferNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const teamName = data.teamName || "General Queue"
  const notes = data.notes || ""

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "Transfer to Agent")
    }
  }, [data.label, isEditingLabel])

  const finishEditingLabel = () => {
    if (editingLabelValue.trim() && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue.trim() })
    }
    setIsEditingLabel(false)
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[280px] bg-card border-orange-100 dark:border-orange-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-orange-200 dark:hover:border-orange-800 ${
          selected ? "ring-1 ring-orange-300/50 dark:ring-orange-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#7c2d12] rounded-md flex items-center justify-center flex-shrink-0">
              <PhoneForwarded className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") setIsEditingLabel(false)
                }}
                className="h-6 text-sm font-medium border-orange-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors flex-1"
                onClick={() => {
                  setEditingLabelValue(data.label || "Transfer to Agent")
                  setIsEditingLabel(true)
                }}
              >
                {data.label || "Transfer to Agent"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 font-medium">
              Exits Flow
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2 pb-4 px-4">
          {/* Team name */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Team:</span>
            <span className="text-xs font-medium text-card-foreground">{teamName}</span>
          </div>

          {/* Notes preview */}
          {notes && (
            <div className="text-[10px] text-muted-foreground line-clamp-2 italic">
              Notes: <VariableHighlightText text={notes} />
            </div>
          )}
        </CardContent>

        {/* Target handle only — no source (transfer exits the flow) */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-[#7c2d12] border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />
      </Card>
    </div>
  )
}
