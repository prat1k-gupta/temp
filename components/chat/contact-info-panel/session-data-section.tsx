"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { PanelSection } from "@/types/chat"

const COLOR_CLASSES: Record<string, string> = {
  success: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  error: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  default: "bg-muted text-muted-foreground",
}

interface SessionDataSectionProps {
  section: PanelSection
  sessionData: Record<string, any>
}

export function SessionDataSection({ section, sessionData }: SessionDataSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(section.default_collapsed ?? false)
  const columns = section.columns || 1
  const fields = [...(section.fields || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const collapsible = section.collapsible ?? false

  function getFieldValue(key: string): string {
    if (!sessionData) return "-"
    const value = sessionData[key]
    if (value === undefined || value === null || value === "") return "-"
    return String(value)
  }

  function renderField(field: { key: string; label: string; display_type?: string; color?: string }) {
    if (!field.key) return null
    const displayType = field.display_type || "text"
    const colorClass = COLOR_CLASSES[field.color || "default"] || COLOR_CLASSES.default
    const value = getFieldValue(field.key)

    return (
      <div key={field.key} className="bg-muted/50 rounded-md px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {field.label}
        </p>
        {displayType === "badge" ? (
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold mt-1", colorClass)}>
            {value}
          </span>
        ) : displayType === "tag" ? (
          <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium mt-1", colorClass)}>
            {value}
          </span>
        ) : (
          <p className="text-sm font-semibold break-words mt-0.5">{value}</p>
        )}
      </div>
    )
  }

  const fieldGrid = (
    <div className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {fields.map(renderField)}
    </div>
  )

  if (collapsible) {
    return (
      <div className="space-y-2 border-t pt-4">
        <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-medium hover:text-primary transition-colors cursor-pointer">
            <span>{section.label}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", isCollapsed && "-rotate-90")} />
          </CollapsibleTrigger>
          <CollapsibleContent>{fieldGrid}</CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <h5 className="py-2 text-sm font-medium">{section.label}</h5>
      {fieldGrid}
    </div>
  )
}
