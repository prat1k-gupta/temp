"use client"

import type React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Play, MessageCircle, MessageSquare, List, MessageSquareText } from "lucide-react"

const nodeTemplates = [
  {
    type: "start",
    label: "Start Node",
    description: "Entry point of the flow",
    icon: Play,
    color: "bg-chart-2",
    disabled: true,
  },
  {
    type: "question",
    label: "Question",
    description: "Ask users a question",
    icon: MessageCircle,
    color: "bg-accent",
  },
  {
    type: "quickReply",
    label: "Quick Reply",
    description: "Question with buttons",
    icon: MessageSquare,
    color: "bg-chart-1",
  },
  {
    type: "whatsappList",
    label: "WhatsApp List",
    description: "List of options (WA only)",
    icon: List,
    color: "bg-chart-4",
  },
  {
    type: "comment",
    label: "Comment",
    description: "Add documentation",
    icon: MessageSquareText,
    color: "bg-yellow-400",
  },
]

interface NodeSidebarProps {
  onNodeDragStart: (event: React.DragEvent, nodeType: string) => void
}

export function NodeSidebar({ onNodeDragStart }: NodeSidebarProps) {
  return (
    <div className="w-64 bg-background border-r border-border p-4 overflow-y-auto">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Node Types</h2>
          <p className="text-sm text-muted-foreground mb-4">Drag and drop to add nodes to your flow</p>
        </div>

        <div className="space-y-2">
          {nodeTemplates.map((template) => {
            const Icon = template.icon
            return (
              <Card
                key={template.type}
                className={`cursor-pointer transition-all duration-200 hover:shadow-md border-border bg-card ${
                  template.disabled ? "opacity-50 cursor-not-allowed" : "hover:border-accent/50 hover:shadow-lg"
                }`}
                draggable={!template.disabled}
                onDragStart={(e) => !template.disabled && onNodeDragStart(e, template.type)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-md ${template.color} flex items-center justify-center`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-card-foreground text-sm">{template.label}</h3>
                        {template.disabled && (
                          <Badge variant="secondary" className="text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-foreground mb-2">Tips</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>• Drag nodes from here to the canvas</p>
            <p>• Right-click canvas for quick actions</p>
            <p>• Select nodes to see connection handles</p>
            <p>• Comments don't affect the flow logic</p>
          </div>
        </div>
      </div>
    </div>
  )
}
