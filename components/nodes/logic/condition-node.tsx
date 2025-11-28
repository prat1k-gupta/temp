"use client"

import { useState, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { GitBranch, Edit3, Plus, Trash2, User, Mail, Calendar, MapPin, Link2 } from "lucide-react"
import type { Platform } from "@/types"

interface Condition {
  id: string
  field: string
  operator: string
  value: string
  label: string
}

export function ConditionNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const platform = (data.platform || "web") as Platform
  const conditionLogic = data.conditionLogic || "AND" // AND or OR
  const connectedNode = data.connectedNode || null // Info about the connected source node
  const conditionGroups = data.conditionGroups || [
    { id: "group-1", label: "Group 1", rules: [] }
  ]
  const conditionRules = data.conditionRules || []

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

  const getNodeIcon = (nodeType: string) => {
    switch (nodeType) {
      case "name":
        return User
      case "email":
        return Mail
      case "dob":
        return Calendar
      case "address":
        return MapPin
      default:
        return Link2
    }
  }

  const NodeIcon = connectedNode ? getNodeIcon(connectedNode.type) : Link2

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
                  onBlur={finishEditingLabel}
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
          {/* Connected Node Info */}
          {connectedNode ? (
            <div className="mb-3 p-2 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-purple-500 rounded flex items-center justify-center flex-shrink-0">
                  <NodeIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Based on</p>
                  <p className="text-sm font-medium text-card-foreground truncate">
                    {connectedNode.label}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-3 p-2 bg-muted/20 border border-dashed border-border rounded-md">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Connect a node to enable conditions
                </p>
              </div>
            </div>
          )}

          {/* Condition Groups */}
          <div className="space-y-0">
            {conditionGroups.map((group: any, groupIndex: number) => {
              const groupRules = conditionRules.filter((r: any) => r.groupId === group.id)
              
              return (
                <div 
                  key={group.id} 
                  className="relative py-3"
                  data-group-id={group.id}
                  data-group-index={groupIndex}
                >
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

