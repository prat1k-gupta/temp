"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CircleCheck, Edit3 } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

export function FlowCompleteNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "Complete Flow")
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
        className={`min-w-[220px] max-w-[260px] bg-card border-emerald-100 dark:border-emerald-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 ${
          selected ? "ring-1 ring-emerald-300/50 dark:ring-emerald-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-3 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-emerald-600 rounded-md flex items-center justify-center flex-shrink-0">
              <CircleCheck className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onFocus={() => data.onSnapshot?.()}
                onBlur={() => { finishEditingLabel(); data.onResumeTracking?.() }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") setIsEditingLabel(false)
                }}
                className="h-6 text-sm font-medium border-emerald-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors flex-1"
                onClick={() => {
                  setEditingLabelValue(data.label || "Complete Flow")
                  setIsEditingLabel(true)
                }}
              >
                {data.label || "Complete Flow"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-medium">
              Complete
            </Badge>
          </div>
        </CardHeader>

        {/* Target handle only — no source (flow ends here) */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-emerald-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />
      </Card>
    </div>
  )
}
