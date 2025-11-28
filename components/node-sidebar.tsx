"use client"

import type React from "react"
import { useState } from "react"
import type { Platform } from "@/types"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Play, MessageCircle, MessageSquare, List, MessageSquareText, ChevronLeft, ChevronRight } from "lucide-react"
import { 
  getNodeLabel, 
  getPlatformColor, 
  getPlatformDisplayName,
  platformSupportsNodeType 
} from "@/utils/platform-labels"
import { BUTTON_LIMITS } from "@/constants/platform-limits"

interface NodeTemplate {
  type: string
  icon: any
  disabled?: boolean
  getLabel: (platform: Platform) => string
  getDescription: (platform: Platform) => string
  getColor: (platform: Platform) => string
  isAvailable: (platform: Platform) => boolean
}

const BASE_NODE_TEMPLATES: NodeTemplate[] = [
  {
    type: "start",
    icon: Play,
    disabled: true,
    getLabel: () => "Start Node",
    getDescription: () => "Entry point of the flow",
    getColor: () => "bg-chart-2",
    isAvailable: () => true,
  },
  {
    type: "question",
    icon: MessageCircle,
    disabled: false,
    getLabel: (platform) => getNodeLabel("question", platform),
    getDescription: (platform) => `Send ${getPlatformDisplayName(platform)} message`,
    getColor: (platform) => getPlatformColor(platform, "primary"),
    isAvailable: () => true,
  },
  {
    type: "quickReply",
    icon: MessageSquare,
    disabled: false,
    getLabel: (platform) => getNodeLabel("quickReply", platform),
    getDescription: (platform) => `Question with buttons (max ${BUTTON_LIMITS[platform]})`,
    getColor: (platform) => getPlatformColor(platform, "secondary"),
    isAvailable: () => true,
  },
  {
    type: "whatsappList",
    icon: List,
    disabled: false,
    getLabel: (platform) => getNodeLabel("list", platform),
    getDescription: () => "Interactive list with options",
    getColor: (platform) => getPlatformColor(platform, "tertiary"),
    isAvailable: (platform) => platformSupportsNodeType(platform, "whatsappList"),
  },
  {
    type: "comment",
    icon: MessageSquareText,
    disabled: false,
    getLabel: () => "Comment",
    getDescription: () => "Add documentation",
    getColor: () => "bg-yellow-400",
    isAvailable: () => true,
  },
]

interface NodeSidebarProps {
  onNodeDragStart: (event: React.DragEvent, nodeType: string) => void
  platform?: Platform
}

export function NodeSidebar({ onNodeDragStart, platform = "web" }: NodeSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  const availableNodes = BASE_NODE_TEMPLATES.filter(template => 
    template.isAvailable(platform)
  )

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="relative w-16 bg-background border-r border-border">
          {/* Expand button positioned on the right edge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsCollapsed(false)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-12 w-6 rounded-r-md hover:cursor-pointer rounded-l-none bg-accent/50 text-white hover:bg-accent border-border border-r-1 shadow-lg p-0 translate-x-full"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Expand sidebar</p>
            </TooltipContent>
          </Tooltip>

          <div className="p-2 overflow-y-auto h-full flex flex-col items-center">
            <div className="space-y-2 w-full">
              {availableNodes.map((template) => {
                const Icon = template.icon
                const label = template.getLabel(platform)
                const description = template.getDescription(platform)
                const color = template.getColor(platform)
                
                return (
                  <Tooltip key={template.type}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-12 h-12 rounded-md ${color} flex items-center justify-center cursor-pointer transition-all duration-200 ${
                          template.disabled 
                            ? "opacity-50 cursor-not-allowed" 
                            : "hover:ring-2 hover:ring-accent/50 hover:scale-105"
                        }`}
                        draggable={!template.disabled}
                        onDragStart={(e) => !template.disabled && onNodeDragStart(e, template.type)}
                      >
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{label}</p>
                          {template.disabled && (
                            <Badge variant="secondary" className="text-xs">
                              Auto
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative w-64 bg-background border-r border-border">
        {/* Collapse button positioned on the right edge - fixed position */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-12 w-6 rounded-r-md hover:cursor-pointer rounded-l-none bg-accent/50 text-white hover:bg-accent border-border border-r-1 shadow-lg p-0 translate-x-full"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Collapse sidebar</p>
          </TooltipContent>
        </Tooltip>
        
        <div className="p-4 overflow-y-auto h-full">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Node Types</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Drag and drop to add nodes to your flow
                <span className="block text-xs mt-1 capitalize text-accent">
                  {getPlatformDisplayName(platform)} Platform
                </span>
              </p>
            </div>

          <div className="space-y-2">
            {availableNodes.map((template) => {
              const Icon = template.icon
              const label = template.getLabel(platform)
              const description = template.getDescription(platform)
              const color = template.getColor(platform)
              
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
                      <div className={`w-8 h-8 rounded-md ${color} flex items-center justify-center`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-card-foreground text-sm">{label}</h3>
                          {template.disabled && (
                            <Badge variant="secondary" className="text-xs">
                              Auto
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{description}</p>
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
      </div>
    </TooltipProvider>
  )
}
