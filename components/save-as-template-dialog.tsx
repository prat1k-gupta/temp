"use client"

import { useState, useEffect } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Brain, Loader2 } from "lucide-react"
import { useSaveAsTemplate } from "@/hooks/queries/use-flow-mutations"
import { toast } from "sonner"

interface SaveAsTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  flowName: string
}

export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  nodes,
  edges,
  platform,
  flowName,
}: SaveAsTemplateDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [aiDescription, setAiDescription] = useState("")
  const [whenToUse, setWhenToUse] = useState("")
  const [selectionRule, setSelectionRule] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const saveAsTemplate = useSaveAsTemplate()

  // Pre-fill name from flow name and generate AI metadata when dialog opens
  useEffect(() => {
    if (!open) return
    setName(flowName ? `${flowName} Template` : "")
    setDescription("")
    setAiDescription("")
    setWhenToUse("")
    setSelectionRule("")
    generateMetadata()
  }, [open])

  async function generateMetadata() {
    if (nodes.length <= 1) return // Only start node, nothing to analyze
    setIsGenerating(true)
    try {
      const res = await fetch("/api/ai/generate-template-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges, platform, flowName }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.suggestedName) setName(data.suggestedName)
        if (data.description) setDescription(data.description)
        if (data.aiMetadata?.description) setAiDescription(data.aiMetadata.description)
        if (data.aiMetadata?.whenToUse) setWhenToUse(data.aiMetadata.whenToUse)
        if (data.aiMetadata?.selectionRule) setSelectionRule(data.aiMetadata.selectionRule)
      }
    } catch {
      // Silently fail — user can fill in manually
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) return

    const aiMetadata: TemplateAIMetadata = {
      description: aiDescription.trim() || name.trim(),
      whenToUse: whenToUse.trim(),
      ...(selectionRule.trim() ? { selectionRule: selectionRule.trim() } : {}),
    }

    try {
      await saveAsTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        platform,
        nodes,
        edges,
        aiMetadata,
      })
      toast.success("Template created successfully")
      onOpenChange(false)
    } catch {
      toast.error("Failed to create template")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product Sample Collection"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description">Description</Label>
            <Textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this template do?"
              rows={2}
            />
          </div>

          {/* AI Metadata Section */}
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Brain className="size-4" />
              AI Configuration
              {isGenerating && <Loader2 className="size-3 animate-spin" />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-description" className="text-xs">AI Description</Label>
              <Textarea
                id="ai-description"
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder="How should AI understand this template?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="when-to-use" className="text-xs">When to Use</Label>
              <Textarea
                id="when-to-use"
                value={whenToUse}
                onChange={(e) => setWhenToUse(e.target.value)}
                placeholder="When should AI suggest this template?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="selection-rule" className="text-xs">Selection Rule</Label>
              <Textarea
                id="selection-rule"
                value={selectionRule}
                onChange={(e) => setSelectionRule(e.target.value)}
                placeholder="Short rule for AI (e.g. 'Use when collecting product preferences')"
                rows={1}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || saveAsTemplate.isPending || isGenerating}
          >
            {saveAsTemplate.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : isGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Generating AI metadata...
              </>
            ) : (
              "Save as Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
