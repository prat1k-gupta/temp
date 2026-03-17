"use client"

import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"
import type { FlowData } from "@/utils/flow-storage"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import { ThemeToggle } from "@/components/theme-toggle"
import { ArrowLeft, Edit3, Network, Settings2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface TemplateHeaderProps {
  currentFlow: FlowData | null
  isEditingFlowName: boolean
  editingFlowNameValue: string
  setEditingFlowNameValue: (value: string) => void
  setIsEditingFlowName: (editing: boolean) => void
  handleFlowNameBlur: () => void
  platform: Platform
  nodes: Node[]
  edges: Edge[]
  handleBackClick: () => void
  isFlowGraphPanelOpen?: boolean
  onToggleFlowGraph?: () => void
  aiMetadata?: TemplateAIMetadata
  onSaveAIMetadata?: (metadata: TemplateAIMetadata) => void
  description?: string
  onSaveDescription?: (description: string) => void
}

export function TemplateHeader({
  currentFlow,
  isEditingFlowName,
  editingFlowNameValue,
  setEditingFlowNameValue,
  setIsEditingFlowName,
  handleFlowNameBlur,
  platform,
  nodes,
  edges,
  handleBackClick,
  isFlowGraphPanelOpen,
  onToggleFlowGraph,
  aiMetadata,
  onSaveAIMetadata,
  description,
  onSaveDescription,
}: TemplateHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editDescription, setEditDescription] = useState("")
  const [editAiDescription, setEditAiDescription] = useState("")
  const [editAiWhenToUse, setEditAiWhenToUse] = useState("")
  const [editAiSelectionRule, setEditAiSelectionRule] = useState("")

  const handleOpenSettings = () => {
    setEditDescription(description || "")
    setEditAiDescription(aiMetadata?.description || "")
    setEditAiWhenToUse(aiMetadata?.whenToUse || "")
    setEditAiSelectionRule(aiMetadata?.selectionRule || "")
    setSettingsOpen(true)
  }

  const handleSaveSettings = () => {
    onSaveDescription?.(editDescription.trim())
    onSaveAIMetadata?.({
      description: editAiDescription.trim(),
      whenToUse: editAiWhenToUse.trim(),
      selectionRule: editAiSelectionRule.trim(),
    })
    setSettingsOpen(false)
    toast.success("Template settings saved")
  }

  const hasSettings = !!(description || aiMetadata?.description || aiMetadata?.whenToUse)

  return (
    <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border overflow-visible">
      <div className="flex items-center justify-between px-6 py-3 gap-2">
        {/* Left Section */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="default"
            size="sm"
            onClick={handleBackClick}
            className="shrink-0 h-8 w-8 p-0"
            title="Back to templates"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          {currentFlow && (
            <>
              {isEditingFlowName ? (
                <Input
                  value={editingFlowNameValue}
                  onChange={(e) => setEditingFlowNameValue(e.target.value)}
                  onBlur={handleFlowNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur()
                    }
                    if (e.key === "Escape") {
                      setEditingFlowNameValue(currentFlow.name)
                      setIsEditingFlowName(false)
                    }
                  }}
                  className="text-lg font-semibold h-8 px-2 min-w-[200px] max-w-[400px]"
                  autoFocus
                />
              ) : (
                <div
                  className="flex items-center gap-2 group cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    setEditingFlowNameValue(currentFlow.name)
                    setIsEditingFlowName(true)
                  }}
                >
                  <h1 className="text-lg font-semibold text-foreground truncate">
                    {currentFlow.name}
                  </h1>
                  <Edit3 className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              )}
              <Badge variant="outline" className="text-xs shrink-0">
                Template
              </Badge>
              {description && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden lg:inline">
                  {description}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Node/Edge count */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{nodes.length} nodes</span>
            <span className="text-border">|</span>
            <span>{edges.length} edges</span>
          </div>

          {/* Platform badge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border-2 ${
              platform === "web"
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                : platform === "whatsapp"
                  ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                  : "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800"
            }`}
            title={getPlatformDisplayName(platform)}
          >
            {platform === "web" && <WebIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            {platform === "whatsapp" && <WhatsAppIcon className="w-4 h-4 text-green-600 dark:text-green-400" />}
            {platform === "instagram" && <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />}
            <span
              className={`text-sm font-semibold ${
                platform === "web"
                  ? "text-blue-700 dark:text-blue-300"
                  : platform === "whatsapp"
                    ? "text-green-700 dark:text-green-300"
                    : "text-pink-700 dark:text-pink-300"
              }`}
            >
              {getPlatformDisplayName(platform)}
            </span>
          </div>

          {/* Template Settings (description + AI config) */}
          <Button
            variant={hasSettings ? "secondary" : "ghost"}
            size="sm"
            onClick={handleOpenSettings}
            className="h-9 gap-2 px-3"
            title="Template Settings"
          >
            <Settings2 className="w-4 h-4" />
            <span className="text-xs hidden sm:inline">Settings</span>
          </Button>

          {/* Flow Graph toggle */}
          <Button
            variant={isFlowGraphPanelOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleFlowGraph}
            className="h-9 w-9 p-0"
            title="Flow Graph"
          >
            <Network className="w-4 h-4" />
          </Button>

          <ThemeToggle />
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Template Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What does this template do?"
                rows={2}
                className="resize-none text-sm"
              />
            </div>

            {/* AI Config */}
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium">AI Configuration</Label>
              <div className="space-y-2">
                <Label htmlFor="ai-desc" className="text-xs">AI Description</Label>
                <Textarea
                  id="ai-desc"
                  value={editAiDescription}
                  onChange={(e) => setEditAiDescription(e.target.value)}
                  placeholder="How should AI understand this template?"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-when" className="text-xs">When to Use</Label>
                <Textarea
                  id="ai-when"
                  value={editAiWhenToUse}
                  onChange={(e) => setEditAiWhenToUse(e.target.value)}
                  placeholder="When should AI select this template?"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-rule" className="text-xs">Selection Rule</Label>
                <Textarea
                  id="ai-rule"
                  value={editAiSelectionRule}
                  onChange={(e) => setEditAiSelectionRule(e.target.value)}
                  placeholder="Optional rule for AI selection logic"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
