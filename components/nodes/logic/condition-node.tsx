"use client"

import { useState, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { GitBranch, Edit3 } from "lucide-react"
import type { Platform } from "@/types"

export function ConditionNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const platform = (data.platform || "web") as Platform
  const conditionLogic = data.conditionLogic || "AND" // AND or OR
  const conditionGroups = (data.conditionGroups || [
    { id: "group-1", label: "Group 1", logic: "AND", rules: [] }
  ]).map((group: any) => ({
    ...group,
    logic: group.logic || "AND",
    rules: group.rules || []
  }))

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "Condition")
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
        className={`min-w-[280px] max-w-[320px] bg-card ${getPlatformColor(platform)} transition-all ${
          selected ? `ring-1 ${getPlatformRing(platform)}` : ""
        }`}
      >
        <CardHeader className="pb-3 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Condition Icon */}
              <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <GitBranch className="w-4 h-4 text-white" />
              </div>

              {/* Editable Label */}
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
                  className="h-7 text-sm font-semibold px-2"
                  autoFocus
                />
              ) : (
                <h3
                  className="text-sm font-semibold text-card-foreground cursor-pointer hover:text-accent transition-colors"
                  onClick={() => setIsEditingLabel(true)}
                >
                  {data.label || "Condition"}
                </h3>
              )}
            </div>

            {/* Logic Badge */}
            <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">
              {conditionLogic}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-0 pb-3 px-4">
          {/* Condition Groups */}
          <div className="space-y-0">
            {conditionGroups.map((group: any, groupIndex: number) => {
              const groupRules = group.rules || []
              
              return (
                <div 
                  key={group.id} 
                  className="relative py-3"
                  data-group-id={group.id}
                  data-group-index={groupIndex}
                >
                  {/* Group Header with Logic Badge */}
                  {groupRules.length > 0 && (
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-medium"
                      >
                        {group.logic || "AND"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {group.logic === "OR" ? "Any of these" : "All of these"}
                      </span>
                    </div>
                  )}
                  
                  {/* Group Rules */}
                  <div className="space-y-1 pr-8">
                    {groupRules.length > 0 ? (
                      groupRules.map((rule: any, idx: number) => (
                        <div 
                          key={rule.id || idx}
                          className="text-sm leading-relaxed relative"
                        >
                          <span className="font-semibold text-card-foreground">{rule.fieldLabel || rule.field}</span>
                          {" "}
                          <span className="text-muted-foreground font-normal">{rule.operatorLabel || rule.operator}</span>
                          {" "}
                          {rule.value && <span className="font-semibold text-card-foreground">{rule.value}</span>}
                          
                          {/* Handle on first line only - positioned relative to this div */}
                          {idx === 0 && (
                            <Handle
                              type="source"
                              position={Position.Right}
                              id={group.id}
                              className="w-3 h-3 bg-teal-500 dark:bg-teal-400 border-2 border-background opacity-100 hover:scale-110 transition-transform"
                              style={{ right: "-32px", top: "50%", transform: "translateY(-50%)" }}
                            />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic">
                        No conditions set
                      </div>
                    )}
                  </div>
                  
                  {/* Separator between groups */}
                  {groupIndex < conditionGroups.length - 1 && (
                    <div className="absolute bottom-0 left-0 right-8 border-t border-border" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Else case at bottom */}
          <div className="pt-3 pb-8 bg-muted/20 -mx-4 px-4 mt-3 relative">
            <p className="text-xs text-muted-foreground leading-relaxed pr-12">
              The contact doesn't match any of these conditions
            </p>
          </div>
        </CardContent>

        {/* Connection Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-indigo-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        {/* Handles are now positioned relative to each group's first line div - see above */}

        {/* "Next" Handle at Bottom Right with label */}
        <div className="absolute bottom-4 right-3 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            id="else"
            className="w-3 h-3 bg-muted-foreground border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}

