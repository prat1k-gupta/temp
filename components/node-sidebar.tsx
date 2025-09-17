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
  platform?: "web" | "whatsapp" | "instagram"
}

export function NodeSidebar({ onNodeDragStart, platform = "web" }: NodeSidebarProps) {
  // Filter nodes based on platform
  const getAvailableNodes = () => {
    let availableNodes = [...nodeTemplates]
    
    if (platform === "whatsapp") {
      // Show WhatsApp-specific nodes
      availableNodes = nodeTemplates.filter(node => 
        node.type === "start" || 
        node.type === "question" || 
        node.type === "quickReply" || 
        node.type === "whatsappList" || 
        node.type === "comment"
      )
    } else if (platform === "instagram") {
      // Show Instagram-specific nodes (Instagram doesn't have list traditionally, but we created one)
      availableNodes = nodeTemplates.filter(node => 
        node.type === "start" || 
        node.type === "question" || 
        node.type === "quickReply" || 
        node.type === "whatsappList" || // We'll rename this dynamically
        node.type === "comment"
      )
    }
    
    return availableNodes
  }

  const availableNodes = getAvailableNodes()

  return (
    <div className="w-64 bg-background border-r border-border p-4 overflow-y-auto">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Node Types</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop to add nodes to your flow
            {platform !== "web" && (
              <span className="block text-xs mt-1 capitalize text-accent">
                {platform} optimized
              </span>
            )}
          </p>
        </div>

        <div className="space-y-2">
          {availableNodes.map((template) => {
            const Icon = template.icon
            
            // Dynamically adjust labels and descriptions based on platform
            let displayLabel = template.label
            let displayDescription = template.description
            
            if (template.type === "whatsappList") {
              if (platform === "instagram") {
                displayLabel = "Instagram List"
                displayDescription = "List of options (IG only)"
              }
            } else if (template.type === "question") {
              if (platform === "whatsapp") {
                displayDescription = "Send WhatsApp message"
              } else if (platform === "instagram") {
                displayDescription = "Send Instagram message"
              }
            } else if (template.type === "quickReply") {
              if (platform === "whatsapp") {
                displayDescription = "WhatsApp quick replies"
              } else if (platform === "instagram") {
                displayDescription = "Instagram quick replies"
              }
            }
            
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
                        <h3 className="font-medium text-card-foreground text-sm">{displayLabel}</h3>
                        {template.disabled && (
                          <Badge variant="secondary" className="text-xs">
                            Auto
                          </Badge>
                        )}
                        {platform !== "web" && template.type !== "start" && template.type !== "comment" && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {platform}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{displayDescription}</p>
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
