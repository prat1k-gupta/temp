"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Globe } from "lucide-react"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Edit3 } from "lucide-react"
import { VariableHighlightText } from "@/components/variable-highlight-text"

export function ApiFetchNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const url = data.url || ""
  const method = (data.method || "GET").toUpperCase()
  const responseMapping = data.responseMapping || {}
  const mappingCount = Object.keys(responseMapping).length
  const fallbackMessage = data.fallbackMessage || ""

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "API Call")
    }
  }, [data.label, isEditingLabel])

  const finishEditingLabel = () => {
    if (editingLabelValue.trim() && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue.trim() })
    }
    setIsEditingLabel(false)
  }

  const methodColor: Record<string, string> = {
    GET: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    POST: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    PUT: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    DELETE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card border-blue-100 dark:border-blue-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 ${
          selected ? "ring-1 ring-blue-300/50 dark:ring-blue-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#1a365d] rounded-md flex items-center justify-center flex-shrink-0">
              <Globe className="w-3 h-3 text-white" />
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
                className="h-6 text-sm font-medium border-blue-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                onClick={() => {
                  setEditingLabelValue(data.label || "API Call")
                  setIsEditingLabel(true)
                }}
              >
                {data.label || "API Call"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2.5 pb-8 px-4">
          {/* Method + URL */}
          <div className="flex items-center gap-2">
            <Badge className={`text-[10px] px-1.5 py-0 h-4 font-mono font-semibold ${methodColor[method] || methodColor.GET}`}>
              {method}
            </Badge>
            <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
              {url ? <VariableHighlightText text={url} className="truncate" /> : "No URL configured"}
            </span>
          </div>

          {/* Response mapping count */}
          {mappingCount > 0 && (
            <div className="text-[10px] text-muted-foreground">
              Maps {mappingCount} variable{mappingCount !== 1 ? "s" : ""}
            </div>
          )}

          {/* Fallback message preview */}
          {fallbackMessage && (
            <div className="text-[10px] text-muted-foreground line-clamp-1 italic">
              Fallback: <VariableHighlightText text={fallbackMessage} />
            </div>
          )}

          {/* Configure hint */}
          {!url && (
            <p className="text-[10px] text-muted-foreground italic">
              Double-click to configure
            </p>
          )}
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-[#1a365d] border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        {/* Success handle */}
        <div className="px-4 pb-1 flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">Success</span>
          <Handle
            type="source"
            position={Position.Right}
            id="success"
            className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
            style={{ position: "relative", right: "auto", top: "auto", transform: "none" }}
          />
        </div>

        {/* Error handle */}
        <div className="px-4 pb-3 flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">Error</span>
          <Handle
            type="source"
            position={Position.Right}
            id="error"
            className="w-3 h-3 bg-red-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
            style={{ position: "relative", right: "auto", top: "auto", transform: "none" }}
          />
        </div>
      </Card>
    </div>
  )
}
