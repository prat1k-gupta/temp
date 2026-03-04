"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, RefreshCw, Trash2, Copy, FileText, Send, Loader2, ArrowLeft } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { TemplateBuilder } from "@/components/template-builder"
import { toast } from "sonner"
import Link from "next/link"

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

interface Template {
  id: string
  name: string
  display_name: string
  whatsapp_account: string
  category: string
  status: string
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
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== "all") params.set("status", filterStatus)
      const qs = params.toString() ? `?${params.toString()}` : ""
      const response = await fetch(`/api/templates${qs}`)
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()
      setTemplates(Array.isArray(data) ? data : data.templates || [])
    } catch {
      toast.error("Failed to load templates")
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch("/api/templates/sync", { method: "POST" })
      if (!response.ok) throw new Error("Sync failed")
      toast.success("Templates synced from Meta")
      loadTemplates()
    } catch {
      toast.error("Failed to sync templates")
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Delete failed")
      toast.success("Template deleted")
      loadTemplates()
    } catch {
      toast.error("Failed to delete template")
    }
    setTemplateToDelete(null)
  }

  const handleSubmitToMeta = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}/publish`, { method: "POST" })
      if (!response.ok) throw new Error("Submit failed")
      toast.success("Template submitted to Meta for review")
      loadTemplates()
    } catch {
      toast.error("Failed to submit template")
    }
  }

  const handleDuplicate = async (template: Template) => {
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      })
      if (!response.ok) throw new Error("Duplicate failed")
      toast.success("Template duplicated")
      loadTemplates()
    } catch {
      toast.error("Failed to duplicate template")
    }
  }

  const handleSave = async (data: any) => {
    const isUpdate = !!data.id
    const url = isUpdate ? `/api/templates/${data.id}` : "/api/templates"
    const method = isUpdate ? "PUT" : "POST"

    // Map builder field names to fs-whatsapp API field names
    const payload: Record<string, any> = {
      whatsapp_account: data.whatsapp_account || "",
      name: data.name,
      display_name: data.display_name,
      language: data.language,
      category: data.category,
      header_type: data.header_type === "none" ? "" : (data.header_type || ""),
      header_content: data.header_content || "",
      body_content: data.body || data.body_content || "",
      footer_content: data.footer || data.footer_content || "",
      buttons: data.buttons || [],
      sample_values: (() => {
        const bodyText = data.body || data.body_content || ""
        const headerText = data.header_content || ""
        const bodyVars = (bodyText.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{|\}\}/g, ""))
        const headerVars = (headerText.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{|\}\}/g, ""))
        const result: any[] = []
        bodyVars.forEach((v: string, i: number) => {
          const val = (data.sample_values || {})[v]
          if (val) result.push({ component: "body", index: i + 1, value: val })
        })
        headerVars.forEach((v: string, i: number) => {
          const val = (data.sample_values || {})[v]
          if (val) result.push({ component: "header", index: i + 1, value: val })
        })
        return result
      })(),
    }

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Save failed")
    }

    toast.success(isUpdate ? "Template updated" : "Template created")
    setShowBuilder(false)
    setEditingTemplate(null)
    loadTemplates()
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
          header_type: (editingTemplate.header_type as any) || "none",
          header_content: editingTemplate.header_content || "",
          body: editingTemplate.body_content || "",
          footer: editingTemplate.footer_content || "",
          buttons: editingTemplate.buttons || [],
          sample_values: Array.isArray(editingTemplate.sample_values)
            ? editingTemplate.sample_values.reduce((acc: Record<string, string>, item: any) => {
                const key = item.key || (item.index != null ? String(item.index) : "")
                if (key) acc[key] = item.value || ""
                return acc
              }, {})
            : {},
          status: editingTemplate.status,
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <Link href="/flows" className="cursor-pointer hover:opacity-80 transition-opacity">
                  <LogoClosed className="w-12 h-12" />
                </Link>
                <div>
                  <h1 className="text-2xl font-bold text-[#052762]">Templates</h1>
                  <p className="text-xs text-muted-foreground">WhatsApp message templates</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/flows">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Flows
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={syncing}
                className="gap-2"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync from Meta
              </Button>
              <Button
                onClick={() => {
                  setEditingTemplate(null)
                  setShowBuilder(true)
                }}
                className="gap-2 bg-[#052762] hover:bg-[#0A49B7] text-white"
              >
                <Plus className="w-4 h-4" />
                Create Template
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-10">
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
              className="gap-2 bg-[#052762] hover:bg-[#0A49B7] text-white"
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
                <div className="absolute top-0 left-0 right-0 h-1 bg-[#052762]" />

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
                </CardContent>

                <CardFooter className="pt-3 border-t">
                  <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
                    {(template.status === "DRAFT" || template.status === "REJECTED") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSubmitToMeta(template.id)
                        }}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Submit
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
