"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Zap, Edit3, Tag, Braces } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

const MAX_VARIABLES = 10
const MAX_TAGS = 10

export function ActionNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const variables: Array<{ name: string; value: string }> = data.variables || []
  const tags: string[] = data.tags || []
  const tagAction: string = data.tagAction || "add"

  const configuredVars = variables.filter((v) => v.name && v.value)
  const nonEmptyTags = tags.filter((t) => t.trim())
  const hasVars = configuredVars.length > 0
  const hasTags = nonEmptyTags.length > 0

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "Action")
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
        className={`min-w-[240px] max-w-[280px] bg-card border-purple-100 dark:border-purple-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800 ${
          selected ? "ring-1 ring-purple-300/50 dark:ring-purple-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-purple-600 rounded-md flex items-center justify-center flex-shrink-0">
              <Zap className="w-3.5 h-3.5 text-white" />
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
                className="h-6 text-sm font-medium border-purple-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors flex-1"
                onClick={() => {
                  setEditingLabelValue(data.label || "Action")
                  setIsEditingLabel(true)
                }}
              >
                {data.label || "Action"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2.5 pb-8 px-4">
          {/* Variables section */}
          {hasVars && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <Braces className="w-3 h-3 text-indigo-500" />
                <span>Set {configuredVars.length} variable{configuredVars.length > 1 ? "s" : ""}</span>
              </div>
              {configuredVars.slice(0, 2).map((v, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  <code className="px-1 py-px rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-mono font-medium truncate max-w-[80px]">{v.name}</code>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-card-foreground truncate max-w-[90px] font-mono">{v.value || '""'}</span>
                </div>
              ))}
              {configuredVars.length > 2 && (
                <p className="text-[10px] text-muted-foreground">+{configuredVars.length - 2} more</p>
              )}
            </div>
          )}

          {/* Tags section */}
          {hasTags && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <Tag className={`w-3 h-3 ${tagAction === "remove" ? "text-red-500" : "text-teal-500"}`} />
                <span>{tagAction === "remove" ? "Remove" : "Add"} {nonEmptyTags.length} tag{nonEmptyTags.length > 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {nonEmptyTags.slice(0, 3).map((tag, i) => (
                  <span
                    key={i}
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      tagAction === "remove"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                    }`}
                  >
                    {tag}
                  </span>
                ))}
                {nonEmptyTags.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{nonEmptyTags.length - 3}</span>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasVars && !hasTags && (
            <p className="text-[10px] text-muted-foreground italic">
              Double-click to configure
            </p>
          )}
        </CardContent>

        {/* Target handle */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-purple-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        {/* Next handle — follows standard pattern */}
        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-purple-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}
