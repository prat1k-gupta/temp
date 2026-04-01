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
import { TemplateSidebarSection } from "@/components/template-sidebar-section"

interface NodeSidebarProps {
  onNodeDragStart: (event: React.DragEvent, nodeType: string, meta?: { templateId?: string }) => void
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

  // Freestand LogoClosed component (icon only)
  const LogoClosed = ({ className }: { className?: string }) => (
    <svg viewBox='0 0 127 128' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
      <g>
        <path
          d='M94.8052 62.1819V102.384C94.7538 104.184 94.7565 105.342 94.7565 105.342H68.3398V62.1819M94.8052 62.1819H68.3398M94.8052 62.1819H98.7703V51.4453L68.3398 51.4453V62.1819'
          stroke='#052762'
          strokeWidth='7'
          strokeMiterlimit='16'
          strokeLinecap='round'
        />
        <path
          d='M32.6543 62.1819V102.384C32.7057 104.184 32.703 105.342 32.703 105.342H57.2754V62.1819M32.6543 62.1819H57.2754M32.6543 62.1819H28.6892V51.4453L57.2754 51.4453V62.1819'
          stroke='#052762'
          strokeWidth='7'
          strokeMiterlimit='16'
          strokeLinecap='round'
        />
        <path
          d='M28.6895 41.6827C33.2272 41.6827 51.7948 41.6827 56.2307 41.6827L54.6309 39.8631C49.9526 34.0405 40.9363 28.2184 41.3726 18.3922C41.5859 13.5891 48.4992 8.05709 55.553 15.0442C61.1961 20.6339 62.1221 30.9108 61.8797 35.3505C64.1825 28.8971 70.737 17.0821 78.5326 21.449C88.2771 26.9077 76.3772 37.1701 73.9775 38.1891C72.0577 39.2371 70.1728 40.7122 69.0093 41.3187H98.7717'
          stroke='#052762'
          strokeWidth='7'
          strokeLinecap='square'
          strokeLinejoin='round'
        />
      </g>
    </svg>
  )

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="relative w-16 bg-background border-r border-border flex flex-col">
          {/* Expand button positioned on the right edge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsCollapsed(false)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-12 w-6 rounded-r-md rounded-l-none bg-muted hover:bg-muted-foreground/20 border-border shadow-lg p-0 translate-x-full cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Expand sidebar</p>
            </TooltipContent>
          </Tooltip>

          {/* Freestand Logo when collapsed */}
          <div className="p-3 border-b border-border flex items-center justify-center">
            <LogoClosed className="w-10 h-10" />
          </div>

          <div className="p-2 overflow-y-auto h-full flex-1">
            <div className="space-y-3">
              {categories.map((category) => {
                const nodes = getNodesByCategory(category.key, platform)
                
                if (nodes.length === 0) return null
                
                return nodes.slice(0, 2).map((node) => {
                  const NodeIcon = node.icon
                  
                  return (
                    <Tooltip key={node.type}>
                      <TooltipTrigger asChild>
                        <div
                          className={`w-12 h-12 rounded-md ${getPlatformColorClass(platform)} flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 relative`}
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
              className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-12 w-6 rounded-r-md rounded-l-none bg-muted hover:bg-muted-foreground/20 border-border shadow-lg p-0 translate-x-full cursor-pointer"
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
          <div className="flex items-center gap-3">
            {/* Freestand LogoClosed (icon only) */}
            <LogoClosed className="w-10 h-10" />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">Magic Flow</h2>
              <p className="text-xs text-primary font-medium mt-0.5">
                A Freestand Product
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Categories */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {/* Templates section at top */}
            <TemplateSidebarSection onNodeDragStart={onNodeDragStart} platform={platform} />

            {categories.filter(c => c.key !== "template").map((category) => {
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
            <p>💡 Drag nodes or templates to canvas</p>
            <p className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 inline" />
              <span className="font-medium text-primary">Templates</span> are double-clickable to edit
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
