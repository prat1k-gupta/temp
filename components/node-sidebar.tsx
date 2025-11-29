"use client"

import type React from "react"
import { useState } from "react"
import type { Platform } from "@/types"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Sparkles } from "lucide-react"
import { NODE_TEMPLATES, NODE_CATEGORIES, getNodesByCategory, getAllCategories } from "@/constants/node-categories"
import { getPlatformColor } from "@/utils/platform-labels"

interface NodeSidebarProps {
  onNodeDragStart: (event: React.DragEvent, nodeType: string) => void
  platform?: Platform
}

export function NodeSidebar({ onNodeDragStart, platform = "web" }: NodeSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    interaction: true,
    information: true,
    fulfillment: false,
    integration: false,
  })
  
  const categories = getAllCategories()
  
  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }))
  }
  
  const getPlatformColorClass = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-500"
      case "whatsapp":
        return "bg-green-500"
      case "instagram":
        return "bg-pink-500"
      default:
        return "bg-gray-500"
    }
  }

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
                className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-12 w-6 rounded-r-md rounded-l-none bg-accent/10 hover:bg-accent/60 border-accent/30 shadow-lg p-0 translate-x-full cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Expand sidebar</p>
            </TooltipContent>
          </Tooltip>

          <div className="p-2 overflow-y-auto h-full">
            <div className="space-y-3 pt-12">
              {categories.map((category) => {
                const nodes = getNodesByCategory(category.key, platform)
                
                if (nodes.length === 0) return null
                
                return nodes.slice(0, 2).map((node) => {
                  const NodeIcon = node.icon
                  
                  return (
                    <Tooltip key={node.type}>
                      <TooltipTrigger asChild>
                        <div
                          className={`w-12 h-12 rounded-md ${getPlatformColorClass(platform)} flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105`}
                          draggable
                          onDragStart={(e) => onNodeDragStart(e, node.type)}
                        >
                          <NodeIcon className="w-5 h-5 text-white" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{node.label}</p>
                            {node.isSuperNode && (
                              <Badge variant="secondary" className="text-xs">
                                {node.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{node.description}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )
                })
              })}
            </div>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative w-72 bg-background border-r border-border flex flex-col">
        {/* Collapse button positioned on the right edge - fixed position */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-12 w-6 rounded-r-md rounded-l-none bg-accent/10 hover:bg-accent/60 border-accent/30 shadow-lg p-0 translate-x-full cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Collapse sidebar</p>
          </TooltipContent>
        </Tooltip>
        
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
        <div>
              <h2 className="text-sm font-semibold text-foreground">Nodes</h2>
              <p className="text-[10px] text-muted-foreground capitalize">
                {platform === "web" ? "Web" : platform === "whatsapp" ? "WhatsApp" : "Instagram"} Platform
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Categories */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {categories.map((category) => {
              const CategoryIcon = category.icon
              const isExpanded = expandedCategories[category.key]
              const nodes = getNodesByCategory(category.key, platform)
              
              if (nodes.length === 0) return null
            
            return (
                <div key={category.key} className="space-y-2">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category.key)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{category.label}</span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                        {nodes.length}
                      </Badge>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>

                  {/* Category Nodes */}
                  {isExpanded && (
                    <div className="space-y-1.5 pl-2">
                      {nodes.map((node) => {
                        const NodeIcon = node.icon
                        
                        return (
                          <Card
                            key={node.type}
                            className="cursor-pointer transition-all duration-200 hover:shadow-md border-border bg-card hover:border-accent/50"
                            draggable
                            onDragStart={(e) => onNodeDragStart(e, node.type)}
              >
                            <CardContent className="p-2.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-md ${getPlatformColorClass(platform)} flex items-center justify-center shrink-0`}>
                                  <NodeIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <h3 className="font-medium text-card-foreground text-xs truncate">
                                      {node.label}
                                    </h3>
                                    {node.isSuperNode && (
                                      <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                                        {node.badge}
                          </Badge>
                        )}
                      </div>
                                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                    {node.description}
                                  </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer Tips */}
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="space-y-1 text-[10px] text-muted-foreground">
            <p>💡 Drag nodes to canvas</p>
            <p className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 inline" />
              <span className="font-medium text-accent">Super nodes</span> are double-clickable
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
