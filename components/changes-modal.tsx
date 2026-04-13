"use client"

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Plus,
  Minus,
  Edit,
  Link,
  Unlink,
  Globe,
  FileText,
  Clock,
  Trash2,
  Copy,
  Layers,
  List,
  Sparkles,
} from "lucide-react"
import type { FlowChange } from "@/types"

interface ChangesModalProps {
  changes: FlowChange[]
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ChangesModal({ changes, children, open: controlledOpen, onOpenChange }: ChangesModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = onOpenChange || setInternalOpen
  const [isGrouped, setIsGrouped] = useState(false)

  const getChangeIcon = (type: FlowChange['type']) => {
    switch (type) {
      case 'node_add':
        return <Plus className="w-4 h-4 text-green-600" />
      case 'node_delete':
        return <Minus className="w-4 h-4 text-red-600" />
      case 'node_update':
        return <Edit className="w-4 h-4 text-blue-600" />
      case 'edge_add':
        return <Link className="w-4 h-4 text-green-600" />
      case 'edge_delete':
        return <Unlink className="w-4 h-4 text-red-600" />
      case 'edge_update':
        return <Edit className="w-4 h-4 text-blue-600" />
      case 'platform_change':
        return <Globe className="w-4 h-4 text-purple-600" />
      case 'flow_import':
        return <FileText className="w-4 h-4 text-orange-600" />
      default:
        return <Edit className="w-4 h-4 text-gray-600" />
    }
  }

  const getChangeTypeLabel = (type: FlowChange['type']) => {
    switch (type) {
      case 'node_add':
        return 'Node Added'
      case 'node_delete':
        return 'Node Deleted'
      case 'node_update':
        return 'Node Updated'
      case 'edge_add':
        return 'Connection Added'
      case 'edge_delete':
        return 'Connection Deleted'
      case 'edge_update':
        return 'Connection Updated'
      case 'platform_change':
        return 'Platform Changed'
      case 'flow_import':
        return 'Flow Imported'
      default:
        return 'Change'
    }
  }

  const getChangeTypeColor = (type: FlowChange['type']) => {
    switch (type) {
      case 'node_add':
      case 'edge_add':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'node_delete':
      case 'edge_delete':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'node_update':
      case 'edge_update':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'platform_change':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'flow_import':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatValue = (value: any) => {
    if (value === null || value === undefined) {
      return 'empty'
    }
    
    if (typeof value === 'string') {
      return value
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return 'no items'
      }
      // Show first few items for small arrays
      if (value.length <= 3) {
        return value.map(item => {
          if (typeof item === 'object' && item.text) {
            return `"${item.text}"`
          }
          return String(item)
        }).join(', ')
      }
      return `${value.length} items`
    }
    
    if (typeof value === 'object') {
      // Handle button objects
      if (value.text) {
        return `"${value.text}"`
      }
      // Handle media objects — show type + truncated URL
      if (value.type && value.url) {
        try {
          const filename = new URL(value.url).pathname.split("/").pop() || value.url
          return `${value.type}: ${filename}`
        } catch {
          return `${value.type}: ${value.url.slice(0, 40)}...`
        }
      }
      // Handle other objects
      return `{${Object.keys(value).length} properties}`
    }
    
    return String(value)
  }

  // Sort changes by timestamp (newest first)
  const sortedChanges = React.useMemo(() => {
    return [...changes].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime()
      const dateB = new Date(b.timestamp).getTime()
      return dateB - dateA // Newest first
    })
  }, [changes])

  // Group changes by type
  const groupedChanges = React.useMemo(() => {
    const grouped: Record<string, FlowChange[]> = {}
    changes.forEach(change => {
      if (!grouped[change.type]) {
        grouped[change.type] = []
      }
      grouped[change.type].push(change)
    })
    return grouped
  }, [changes])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl w-full h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Changes Made ({changes.length})
            </DialogTitle>
            {changes.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsGrouped(!isGrouped)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                {isGrouped ? (
                  <>
                    <List className="w-4 h-4" />
                    List View
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4" />
                    Group View
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 min-h-0 overflow-hidden">
          <div className="space-y-2 pr-4 pb-4">
            {sortedChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No changes recorded yet</p>
                <p className="text-sm">Start editing to see your changes here</p>
              </div>
            ) : isGrouped ? (
              // Grouped view
              Object.entries(groupedChanges).map(([type, typeChanges]) => (
                <div key={type} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getChangeIcon(type as FlowChange['type'])}
                    <h3 className="font-medium text-sm">
                      {getChangeTypeLabel(type as FlowChange['type'])} ({typeChanges.length})
                    </h3>
                  </div>
                  
                  <div className="space-y-2 ml-6">
                    {typeChanges.map((change, index) => (
                      <div
                        key={change.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {getChangeIcon(change.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={`text-xs ${getChangeTypeColor(change.type)}`}
                              >
                                {getChangeTypeLabel(change.type)}
                              </Badge>
                              {change.source === "ai" && (
                                <Badge
                                  variant="outline"
                                  className="text-xs border-primary/40 bg-primary/10 text-primary gap-1"
                                >
                                  <Sparkles className="h-3 w-3" />
                                  AI
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                                {formatTimestamp(change.timestamp)}
                              </span>
                            </div>
                            {change.userName && (
                              <span className="text-xs font-medium text-primary whitespace-nowrap">
                                {change.userName}
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-foreground break-words">
                            {change.description}
                          </p>
                          
                          {change.data && (
                            <div className="mt-2 text-xs text-muted-foreground break-words">
                              {change.type === 'node_add' && change.data.label && (
                                <span>Label: <strong className="break-all">{change.data.label}</strong></span>
                              )}
                              {change.type === 'node_delete' && change.data.label && (
                                <span>Deleted: <strong className="break-all">{change.data.label}</strong></span>
                              )}
                              {change.type === 'node_update' && change.data.changes && (
                                <div className="space-y-1">
                                  {change.data.changes.map((propChange: any, idx: number) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <span className="font-medium text-blue-600">{propChange.property}:</span>
                                      <span className="flex-1">
                                        <span className="text-red-600 line-through">{formatValue(propChange.oldValue)}</span>
                                        <span className="mx-1">→</span>
                                        <span className="text-green-600 font-medium">{formatValue(propChange.newValue)}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {change.type === 'platform_change' && change.data.from && change.data.to && (
                                <span>From <strong>{change.data.from}</strong> to <strong>{change.data.to}</strong></span>
                              )}
                              {change.type === 'flow_import' && change.data.nodeCount && (
                                <span>Imported <strong>{change.data.nodeCount} nodes</strong> and <strong>{change.data.edgeCount} connections</strong></span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {Object.keys(groupedChanges).indexOf(type) < Object.keys(groupedChanges).length - 1 && (
                    <Separator className="my-4" />
                  )}
                </div>
              ))
            ) : (
              // Chronological timeline view
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[17px] top-6 bottom-6 w-px bg-border" />

                <div className="space-y-0">
                  {sortedChanges.map((change) => {
                    const initials = change.userName
                      ? change.userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
                      : null

                    return (
                      <div key={change.id} className="relative flex items-start gap-3 py-3 group">
                        {/* Avatar / icon on timeline */}
                        <div className="flex-shrink-0 z-10">
                          {initials ? (
                            <div className="w-[34px] h-[34px] rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-sm">
                              <span className="text-[10px] font-semibold">{initials}</span>
                            </div>
                          ) : (
                            <div className="w-[34px] h-[34px] rounded-full bg-muted border-2 border-background flex items-center justify-center shadow-sm">
                              {getChangeIcon(change.type)}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            {change.userName && (
                              <span className="text-sm font-semibold text-foreground">{change.userName}</span>
                            )}
                            <span className="text-sm text-muted-foreground">{change.description}</span>
                          </div>

                          <div className="flex items-center gap-2 mt-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-[18px] ${getChangeTypeColor(change.type)}`}
                            >
                              {getChangeTypeLabel(change.type)}
                            </Badge>
                            {change.source === "ai" && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-[18px] border-primary/40 bg-primary/10 text-primary gap-1"
                              >
                                <Sparkles className="h-2.5 w-2.5" />
                                AI
                              </Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground/50">
                              {formatTimestamp(change.timestamp)}
                            </span>
                          </div>

                          {change.data && (
                            <div className="mt-1.5 text-xs text-muted-foreground break-words">
                              {change.type === 'node_add' && change.data.label && (
                                <span>Label: <strong className="break-all">{change.data.label}</strong></span>
                              )}
                              {change.type === 'node_delete' && change.data.label && (
                                <span>Deleted: <strong className="break-all">{change.data.label}</strong></span>
                              )}
                              {change.type === 'node_update' && change.data.changes && (
                                <div className="space-y-1">
                                  {change.data.changes.map((propChange: any, idx: number) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <span className="font-medium text-blue-600">{propChange.property}:</span>
                                      <span className="flex-1">
                                        <span className="text-red-600 line-through">{formatValue(propChange.oldValue)}</span>
                                        <span className="mx-1">→</span>
                                        <span className="text-green-600 font-medium">{formatValue(propChange.newValue)}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {change.type === 'platform_change' && change.data.from && change.data.to && (
                                <span>From <strong>{change.data.from}</strong> to <strong>{change.data.to}</strong></span>
                              )}
                              {change.type === 'flow_import' && change.data.nodeCount && (
                                <span>Imported <strong>{change.data.nodeCount} nodes</strong> and <strong>{change.data.edgeCount} connections</strong></span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="flex-shrink-0 flex justify-end pt-4 border-t bg-background">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
