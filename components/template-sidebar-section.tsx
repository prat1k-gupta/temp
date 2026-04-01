"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Textarea } from "@/components/ui/textarea"
import { Layers, Plus, Pin, PinOff, ChevronDown, ChevronUp, Pencil } from "lucide-react"
import type { Platform, TemplateAIMetadata } from "@/types"
import {
  DEFAULT_TEMPLATES,
  getPinnedTemplates,
  setPinnedTemplates,
} from "@/constants/default-templates"
import { getAllTemplates, createTemplate } from "@/utils/flow-storage"
import type { FlowMetadata } from "@/utils/flow-storage"
import { useRouter } from "next/navigation"

interface TemplateSidebarSectionProps {
  onNodeDragStart: (event: React.DragEvent, nodeType: string, meta?: { templateId?: string }) => void
  platform?: Platform
}

export function TemplateSidebarSection({
  onNodeDragStart,
  platform = "whatsapp",
}: TemplateSidebarSectionProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)
  const [userTemplates, setUserTemplates] = useState<FlowMetadata[]>([])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState("")
  const [newTemplatePlatform, setNewTemplatePlatform] = useState<Platform>(platform)
  const [newTemplateDescription, setNewTemplateDescription] = useState("")
  const [newTemplateWhenToUse, setNewTemplateWhenToUse] = useState("")

  // Load user templates and pinned state
  useEffect(() => {
    getAllTemplates().then(setUserTemplates)
    setPinnedIds(getPinnedTemplates())
  }, [])

  const togglePin = useCallback((templateId: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId]
      setPinnedTemplates(next)
      return next
    })
  }, [])

  const handleCreateTemplate = useCallback(async () => {
    if (!newTemplateName.trim()) return
    const aiMetadata: TemplateAIMetadata | undefined =
      (newTemplateDescription.trim() || newTemplateWhenToUse.trim())
        ? {
            description: newTemplateDescription.trim() || newTemplateName.trim(),
            whenToUse: newTemplateWhenToUse.trim(),
          }
        : undefined
    await createTemplate(newTemplateName.trim(), "", newTemplatePlatform, [], [], aiMetadata)
    const updated = await getAllTemplates()
    setUserTemplates(updated)
    setNewTemplateName("")
    setNewTemplatePlatform(platform)
    setNewTemplateDescription("")
    setNewTemplateWhenToUse("")
    setShowCreateDialog(false)
  }, [newTemplateName, newTemplatePlatform, newTemplateDescription, newTemplateWhenToUse, platform])

  // Sort user templates: pinned first
  const sortedUserTemplates = [...userTemplates].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id) ? 0 : 1
    const bPinned = pinnedIds.includes(b.id) ? 0 : 1
    return aPinned - bPinned
  })

  const totalCount = DEFAULT_TEMPLATES.length + userTemplates.length

  return (
    <>
      <div className="space-y-2">
        {/* Section Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Templates</span>
            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
              {totalCount}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  className="h-5 w-5 p-0 flex items-center justify-center rounded hover:bg-muted transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowCreateDialog(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation()
                      setShowCreateDialog(true)
                    }
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Create template</p>
              </TooltipContent>
            </Tooltip>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Template Cards */}
        {isExpanded && (
          <div className="space-y-1.5 pl-2">
            {/* Default templates */}
            {DEFAULT_TEMPLATES.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer transition-all duration-200 hover:shadow-md border-border bg-card hover:border-indigo-300/50"
                draggable
                onDragStart={(e) =>
                  onNodeDragStart(e, "flowTemplate", { templateId: template.id })
                }
              >
                <CardContent className="p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                      <Layers className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-card-foreground text-xs truncate">
                          {template.name}
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-[8px] h-3.5 px-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                        >
                          {template.nodes.length} node{template.nodes.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* User templates */}
            {sortedUserTemplates.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer transition-all duration-200 hover:shadow-md border-border bg-card hover:border-indigo-300/50"
                draggable
                onDragStart={(e) =>
                  onNodeDragStart(e, "flowTemplate", { templateId: template.id })
                }
              >
                <CardContent className="p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center shrink-0">
                      <Layers className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-medium text-card-foreground text-xs truncate">
                          {template.name}
                        </h3>
                        <Badge
                          variant="secondary"
                          className="text-[8px] h-3.5 px-1.5"
                        >
                          {template.nodeCount} node{template.nodeCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              router.push(`/template/${template.id}`)
                            }}
                            className="p-0.5 rounded hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3 h-3 text-muted-foreground hover:text-indigo-500" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Edit template</p>
                        </TooltipContent>
                      </Tooltip>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          togglePin(template.id)
                        }}
                        className="p-0.5 rounded hover:bg-muted transition-colors"
                      >
                        {pinnedIds.includes(template.id) ? (
                          <Pin className="w-3 h-3 text-indigo-500" />
                        ) : (
                          <PinOff className="w-3 h-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Template Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Platform selector */}
            <div className="space-y-2">
              <Label>Platform</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["whatsapp", "web", "instagram"] as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewTemplatePlatform(p)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                      newTemplatePlatform === p
                        ? p === "whatsapp"
                          ? "border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                          : p === "web"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                            : "border-pink-500 bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300"
                        : "border-border text-muted-foreground hover:border-muted-foreground/30"
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="e.g., Name Validate Store"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTemplate()
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="template-desc"
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="What does this template do?"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-when">When to Use <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="template-when"
                value={newTemplateWhenToUse}
                onChange={(e) => setNewTemplateWhenToUse(e.target.value)}
                placeholder="When should AI use this template?"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={!newTemplateName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
