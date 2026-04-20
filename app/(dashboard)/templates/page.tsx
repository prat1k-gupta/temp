"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, RefreshCw, Trash2, Copy, FileText, Send, Loader2 } from "lucide-react"
import { TemplateBuilder } from "@/components/template-builder"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { useTemplates, useSyncTemplates, useDeleteTemplate, usePublishTemplate, useDuplicateTemplate, useSaveTemplate } from "@/hooks/queries"
import { formatRejectionReason } from "@/utils/template-helpers"
import { buildTemplatePayload } from "@/utils/template-payload"

interface Template {
  id: string
  name: string
  display_name: string
  whatsapp_account: string
  category: string
  status: string
  rejection_reason?: string
  language: string
  body_content: string
  header_type?: string
  header_content?: string
  footer_content?: string
  buttons?: any[]
  sample_values?: any[]
}

const CATEGORY_COLORS: Record<string, string> = {
  MARKETING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  UTILITY: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  AUTHENTICATION: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}

export default function TemplatesPage() {
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  const { data: templates = [], isLoading: loading } = useTemplates(filterStatus !== "all" ? filterStatus : undefined)
  const syncMutation = useSyncTemplates()
  const deleteMutation = useDeleteTemplate()
  const publishMutation = usePublishTemplate()
  const duplicateMutation = useDuplicateTemplate()
  const saveMutation = useSaveTemplate()

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => toast.success("Templates synced from Meta"),
      onError: () => toast.error("Failed to sync templates"),
    })
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Template deleted"),
      onError: () => toast.error("Failed to delete template"),
    })
    setTemplateToDelete(null)
  }

  const handleSubmitToMeta = (id: string) => {
    if (publishMutation.isPending) return
    publishMutation.mutate(id, {
      onSuccess: () => toast.success("Template submitted to Meta for review"),
      onError: () => toast.error("Failed to submit template"),
    })
  }

  const handleDuplicate = (template: Template) => {
    duplicateMutation.mutate({
      whatsapp_account: template.whatsapp_account,
      name: `${template.name}_copy`,
      display_name: `${template.display_name} (Copy)`,
      language: template.language,
      category: template.category,
      header_type: template.header_type || "",
      header_content: template.header_content || "",
      body_content: template.body_content,
      footer_content: template.footer_content || "",
      buttons: template.buttons || [],
      sample_values: template.sample_values || [],
    }, {
      onSuccess: () => toast.success("Template duplicated"),
      onError: () => toast.error("Failed to duplicate template"),
    })
  }

  const handleSave = async (data: any) => {
    const payload = buildTemplatePayload(data)
    try {
      await saveMutation.mutateAsync({ id: data.id, data: payload })
      toast.success(data.id ? "Template updated" : "Template created")
      setShowBuilder(false)
      setEditingTemplate(null)
    } catch (err: any) {
      toast.error(err.message || "Save failed")
    }
  }

  const filteredTemplates = templates.filter((t) => {
    if (filterCategory !== "all" && t.category !== filterCategory) return false
    return true
  })

  if (showBuilder) {
    return (
      <TemplateBuilder
        template={editingTemplate ? {
          id: editingTemplate.id,
          name: editingTemplate.name,
          display_name: editingTemplate.display_name,
          whatsapp_account: editingTemplate.whatsapp_account || "",
          language: editingTemplate.language,
          category: editingTemplate.category,
          header_type: (editingTemplate.header_type || "none").toLowerCase() as any,
          header_content: editingTemplate.header_content || "",
          body: editingTemplate.body_content || "",
          footer: editingTemplate.footer_content || "",
          buttons: editingTemplate.buttons || [],
          sample_values: Array.isArray(editingTemplate.sample_values)
            ? editingTemplate.sample_values.reduce((acc: Record<string, string>, item: any) => {
                const key = item.param_name || (item.index != null ? String(item.index) : "")
                if (key) acc[key] = item.value || ""
                return acc
              }, {})
            : {},
          status: editingTemplate.status,
          rejection_reason: editingTemplate.rejection_reason,
        } : undefined}
        onSave={handleSave}
        onCancel={() => {
          setShowBuilder(false)
          setEditingTemplate(null)
        }}
      />
    )
  }

  return (
    <div className="p-6 pt-4">
      <PageHeader title="WhatsApp Templates">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncMutation.isPending}
            className="gap-2 cursor-pointer"
          >
            {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync from Meta
          </Button>
          <Button
            onClick={() => {
              setEditingTemplate(null)
              setShowBuilder(true)
            }}
            className="gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </div>
      </PageHeader>

      <div>
        {/* Filter bar */}
        <div className="flex items-center gap-4 mb-8">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="MARKETING">Marketing</SelectItem>
              <SelectItem value="UTILITY">Utility</SelectItem>
              <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <p className="text-sm text-muted-foreground">
            {filteredTemplates.length} {filteredTemplates.length === 1 ? "template" : "templates"}
          </p>
        </div>

        {/* Templates grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No templates yet</h2>
            <p className="text-muted-foreground mb-6">Create your first WhatsApp message template</p>
            <Button
              onClick={() => {
                setEditingTemplate(null)
                setShowBuilder(true)
              }}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Your First Template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer border hover:border-accent/50 hover:-translate-y-1"
                onClick={() => {
                  setEditingTemplate(template)
                  setShowBuilder(true)
                }}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />

                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold truncate mb-1.5">
                        {template.display_name || template.name}
                      </CardTitle>
                      <code className="text-[10px] text-muted-foreground font-mono">{template.name}</code>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pb-3 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 ${CATEGORY_COLORS[template.category] || ""}`}>
                      {template.category}
                    </Badge>
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 ${STATUS_COLORS[template.status] || ""}`}>
                      {template.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {template.language}
                    </Badge>
                  </div>
                  {template.body_content && (
                    <p className="text-xs text-muted-foreground line-clamp-3">{template.body_content}</p>
                  )}
                  {template.status === "REJECTED" && formatRejectionReason(template.rejection_reason) && (
                    <div className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                      <span className="font-medium">Rejected:</span> {formatRejectionReason(template.rejection_reason)}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-3 border-t">
                  <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                    {(template.status === "DRAFT" || template.status === "REJECTED") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs gap-1.5"
                        disabled={publishMutation.isPending && publishMutation.variables === template.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSubmitToMeta(template.id)
                        }}
                      >
                        {publishMutation.isPending && publishMutation.variables === template.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {publishMutation.isPending && publishMutation.variables === template.id ? "Submitting..." : "Submit"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDuplicate(template)
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTemplateToDelete(template.id)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!templateToDelete} onOpenChange={(open) => { if (!open) setTemplateToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => templateToDelete && handleDelete(templateToDelete)}
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
