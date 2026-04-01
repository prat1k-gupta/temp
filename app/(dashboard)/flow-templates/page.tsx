"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, Copy, Layers, Brain } from "lucide-react"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { getAllTemplates, deleteTemplate, duplicateTemplate, createTemplate, type FlowMetadata } from "@/utils/flow-storage"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import type { Platform, TemplateAIMetadata } from "@/types"
import { toast } from "sonner"

export default function FlowTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<FlowMetadata[]>([])
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  // Create template modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPlatform, setNewPlatform] = useState<Platform>("whatsapp")
  const [newDescription, setNewDescription] = useState("")
  const [newAiDescription, setNewAiDescription] = useState("")
  const [newAiWhenToUse, setNewAiWhenToUse] = useState("")
  const [newAiSelectionRule, setNewAiSelectionRule] = useState("")

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const allTemplates = await getAllTemplates()
    const sorted = allTemplates.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    setTemplates(sorted)
  }

  const resetCreateModal = () => {
    setNewName("")
    setNewPlatform("whatsapp")
    setNewDescription("")
    setNewAiDescription("")
    setNewAiWhenToUse("")
    setNewAiSelectionRule("")
    setShowCreateModal(false)
  }

  const handleCreateTemplate = async () => {
    if (!newName.trim()) return

    const aiMetadata: TemplateAIMetadata | undefined =
      (newAiDescription.trim() || newAiWhenToUse.trim() || newAiSelectionRule.trim())
        ? {
            description: newAiDescription.trim(),
            whenToUse: newAiWhenToUse.trim(),
            selectionRule: newAiSelectionRule.trim(),
          }
        : undefined

    const newTemplate = await createTemplate(
      newName.trim(),
      newDescription.trim(),
      newPlatform,
      [],
      [],
      aiMetadata,
    )
    resetCreateModal()
    router.push(`/template/${newTemplate.id}`)
  }

  const handleDeleteTemplate = async (templateId: string) => {
    const success = await deleteTemplate(templateId)
    if (success) {
      toast.success("Template deleted")
      loadTemplates()
    } else {
      toast.error("Failed to delete template")
    }
    setTemplateToDelete(null)
  }

  const handleDuplicateTemplate = async (templateId: string, templateName: string) => {
    const duplicated = await duplicateTemplate(templateId, `${templateName} (Copy)`)
    if (duplicated) {
      toast.success(`Template "${templateName}" duplicated!`)
      loadTemplates()
    } else {
      toast.error("Failed to duplicate template")
    }
  }

  const getPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case "web":
        return <WebIcon className="w-4 h-4" />
      case "whatsapp":
        return <WhatsAppIcon className="w-4 h-4" />
      case "instagram":
        return <InstagramIcon className="w-4 h-4" />
      default:
        return <WebIcon className="w-4 h-4" />
    }
  }

  const getPlatformColor = (platform: Platform) => {
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const TemplateCard = ({
    template,
    onDuplicate,
    onDelete,
    onEdit,
    isDefault = false,
  }: {
    template: { id: string; name: string; description?: string; platform: Platform; nodeCount: number; edgeCount: number; updatedAt?: string; aiMetadata?: any }
    onDuplicate?: () => void
    onDelete?: () => void
    onEdit: () => void
    isDefault?: boolean
  }) => (
    <Card
      className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer border hover:border-indigo-300/50 hover:-translate-y-1"
      onClick={onEdit}
    >
      {/* Indigo accent bar for templates */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${isDefault ? "bg-primary" : "bg-indigo-500"}`} />

      {isDefault && (
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/80 backdrop-blur-sm">
            Built-in
          </Badge>
        </div>
      )}

      {!isDefault && template.aiMetadata?.description && (
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 gap-1">
            <Brain className="w-2.5 h-2.5" />
            AI
          </Badge>
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`${isDefault ? "bg-primary" : "bg-indigo-500"} p-2.5 rounded-lg text-white shrink-0 shadow-sm`}>
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold truncate mb-1">
                {template.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  {getPlatformDisplayName(template.platform)}
                </Badge>
                {template.updatedAt && (
                  <span className="text-xs text-muted-foreground">
                    {formatDate(template.updatedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {template.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{template.description}</p>
        )}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-sm font-medium">{template.nodeCount}</span>
            <span className="text-xs text-muted-foreground">nodes</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-sm font-medium">{template.edgeCount}</span>
            <span className="text-xs text-muted-foreground">edges</span>
          </div>
        </div>
      </CardContent>

      {!isDefault && (
        <CardFooter className="pt-3 border-t">
          <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
            {onDuplicate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate()
                }}
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicate
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  )

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Flow Templates</h1>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      <div>
        <div className="space-y-12">
          {/* Default Templates Section */}
          <div>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-1">Built-in Templates</h2>
              <p className="text-sm text-muted-foreground">
                {DEFAULT_TEMPLATES.length} pre-built templates — drag into your flows from the sidebar
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {DEFAULT_TEMPLATES.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={{
                    id: template.id,
                    name: template.name,
                    description: template.description,
                    platform: "whatsapp" as Platform,
                    nodeCount: template.nodes.length,
                    edgeCount: template.edges?.length || 0,
                  }}
                  onEdit={() => {
                    // Default templates are read-only; just show a toast
                    toast.info("Built-in templates cannot be edited. Duplicate to customize.")
                  }}
                  isDefault
                />
              ))}
            </div>
          </div>

          {/* User Templates Section */}
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-1">Your Templates</h2>
                <p className="text-sm text-muted-foreground">
                  {templates.length} {templates.length === 1 ? "template" : "templates"} — click to edit
                </p>
              </div>
            </div>

            {templates.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg bg-muted/20">
                <Layers className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                <p className="text-muted-foreground mb-4">No custom templates yet</p>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Template
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={{
                      ...template,
                      nodeCount: template.nodeCount,
                      edgeCount: template.edgeCount,
                    }}
                    onDuplicate={() => handleDuplicateTemplate(template.id, template.name)}
                    onDelete={() => setTemplateToDelete(template.id)}
                    onEdit={() => router.push(`/template/${template.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Template Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => { if (!open) resetCreateModal() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Platform selector */}
            <div className="space-y-2">
              <Label>Platform</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["whatsapp", "web", "instagram"] as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setNewPlatform(p)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all cursor-pointer ${
                      newPlatform === p
                        ? p === "whatsapp"
                          ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                          : p === "web"
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                            : "border-pink-500 bg-pink-50 dark:bg-pink-950/30"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    {p === "whatsapp" && <WhatsAppIcon className="w-4 h-4 text-green-600" />}
                    {p === "web" && <WebIcon className="w-4 h-4 text-blue-600" />}
                    {p === "instagram" && <InstagramIcon className="w-4 h-4 text-pink-600" />}
                    <span className="text-sm font-medium">{getPlatformDisplayName(p)}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Only {getPlatformDisplayName(newPlatform)}-compatible nodes will be available in the editor.
              </p>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input
                id="tpl-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Collect Shipping Address"
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) handleCreateTemplate() }}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="tpl-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What does this template do?"
                rows={2}
                className="resize-none text-sm"
              />
            </div>

            {/* AI Config section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">AI Configuration <span className="text-muted-foreground text-xs">(optional)</span></Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-ai-desc" className="text-xs">AI Description</Label>
                <Textarea
                  id="tpl-ai-desc"
                  value={newAiDescription}
                  onChange={(e) => setNewAiDescription(e.target.value)}
                  placeholder="How should AI understand this template?"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-ai-when" className="text-xs">When to Use</Label>
                <Textarea
                  id="tpl-ai-when"
                  value={newAiWhenToUse}
                  onChange={(e) => setNewAiWhenToUse(e.target.value)}
                  placeholder="When should AI select this template?"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-ai-rule" className="text-xs">Selection Rule</Label>
                <Textarea
                  id="tpl-ai-rule"
                  value={newAiSelectionRule}
                  onChange={(e) => setNewAiSelectionRule(e.target.value)}
                  placeholder="Optional rule for AI selection logic"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetCreateModal}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={!newName.trim()}>
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!templateToDelete}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this template.
              Flows that already use this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (templateToDelete) handleDeleteTemplate(templateToDelete)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
