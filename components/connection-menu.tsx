"use client"
import { X, ChevronRight, Sparkles, Search, GripVertical } from "lucide-react"
import { useState, useMemo, useRef, useEffect } from "react"
import type { Platform } from "@/types"
import { NODE_TEMPLATES, NODE_CATEGORIES, getNodesByCategory, getAllCategories } from "@/constants/node-categories"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"

interface ConnectionMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  onSelectNodeType: (nodeType: string) => void
  platform: Platform
}

export function ConnectionMenu({ isOpen, position, onClose, onSelectNodeType, platform }: ConnectionMenuProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [currentPosition, setCurrentPosition] = useState(position)
  const menuRef = useRef<HTMLDivElement>(null)

  const categories = getAllCategories()

  // Update position when prop changes
  useEffect(() => {
    if (isOpen) {
      setCurrentPosition(position)
      setDragOffset({ x: 0, y: 0 })
      setSearchQuery("")
    }
  }, [position, isOpen])

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      setIsDragging(true)
    }
  }

  useEffect(() => {
    if (!isOpen) return

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault()
        const newX = e.clientX - dragOffset.x
        const newY = e.clientY - dragOffset.y
        
        // Keep menu within viewport bounds
        const maxX = window.innerWidth - (menuRef.current?.offsetWidth || 320)
        const maxY = window.innerHeight - (menuRef.current?.offsetHeight || 480)
        
        setCurrentPosition({
          x: Math.max(8, Math.min(newX, maxX)),
          y: Math.max(8, Math.min(newY, maxY))
        })
      }
    }

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false)
      }
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, dragOffset, isOpen])

  const getPlatformColorClass = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "text-blue-600"
      case "whatsapp":
        return "text-green-600"
      case "instagram":
        return "text-pink-600"
      default:
        return "text-gray-600"
    }
  }

  // Filter nodes based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return categories.map(cat => ({
        ...cat,
        nodes: getNodesByCategory(cat.key, platform)
      }))
    }

    const query = searchQuery.toLowerCase()
    return categories.map(cat => ({
      ...cat,
      nodes: getNodesByCategory(cat.key, platform).filter(node =>
        node.label.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query) ||
        cat.label.toLowerCase().includes(query)
      )
    })).filter(cat => cat.nodes.length > 0)
  }, [searchQuery, categories, platform])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="connection-menu fixed bg-card border border-border rounded-lg shadow-xl z-50 w-full sm:w-[280px] md:w-[320px] flex flex-col mx-2 sm:mx-0"
      style={{
        left: currentPosition.x,
        top: currentPosition.y,
        maxWidth: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100vw - 16px)' : undefined,
        maxHeight: typeof window !== 'undefined' ? (window.innerHeight < 600 ? 'calc(100vh - 16px)' : '480px') : '480px',
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      {/* Header - Draggable */}
      <div 
        className="px-3 py-2 sm:px-4 sm:py-3 border-b border-border bg-muted/30 flex-shrink-0"
        onMouseDown={handleMouseDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <div className="flex items-center gap-1.5">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
            <h3 className="text-xs sm:text-sm font-semibold text-foreground select-none">Add Node</h3>
          </div>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
          <Search className="absolute left-2 sm:left-2.5 top-2 sm:top-2.5 h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 sm:h-8 pl-7 sm:pl-8 text-xs"
            autoFocus
          />
        </div>
      </div>

      {/* Categories - Scrollable */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="p-1.5 sm:p-2">
          {filteredCategories.length === 0 ? (
            <div className="px-3 py-6 sm:px-4 sm:py-8 text-center text-xs sm:text-sm text-muted-foreground">
              No nodes found
            </div>
          ) : (
            filteredCategories.map((category) => {
              const CategoryIcon = category.icon
              
              if (category.nodes.length === 0) return null
              
              return (
                <div key={category.key} className="mb-2 sm:mb-3">
                  {/* Category Header */}
                  <div className="px-1.5 sm:px-2 py-1 sm:py-1.5 flex items-center gap-1.5 sm:gap-2">
                    <CategoryIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {category.label}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  {/* Category Nodes */}
                  <div className="space-y-0.5 mt-0.5 sm:mt-1">
                    {category.nodes.map((node) => {
                      const NodeIcon = node.icon
                      
                      return (
                        <button
                          key={node.type}
                          className="w-full px-2 py-1.5 sm:px-3 sm:py-2 text-left hover:bg-accent/50 transition-colors flex items-center gap-2 sm:gap-2.5 group rounded-md cursor-pointer"
                          onClick={() => {
                            console.log("Connection menu: selecting node type:", node.type)
                            onSelectNodeType(node.type)
                          }}
          >
                          <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md ${
                            node.category === 'information' ? 'bg-[#052762]' :
                            node.category === 'fulfillment' ? 'bg-[#052762]' :
                            node.category === 'integration' ? 'bg-blue-600' :
                            getPlatformColorClass(platform) === 'text-blue-600' ? 'bg-blue-500' :
                            getPlatformColorClass(platform) === 'text-green-600' ? 'bg-green-500' :
                            'bg-pink-500'
                          } flex items-center justify-center flex-shrink-0`}>
                            <NodeIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <span className="text-card-foreground font-medium text-[11px] sm:text-xs truncate">
                                {node.label}
                              </span>
                              {node.isSuperNode && (
                                <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-yellow-500 flex-shrink-0" />
                              )}
                              {node.badge && (
                                <Badge variant="secondary" className="text-[7px] sm:text-[8px] h-3 sm:h-3.5 px-0.5 sm:px-1 hidden sm:inline-flex">
                                  {node.badge}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate hidden sm:block">
                              {node.description}
                            </p>
                          </div>
                          <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden sm:block" />
          </button>
        )
      })}
                  </div>
                </div>
              )
            })
          )}
      </div>
      </ScrollArea>
    </div>
  )
}
