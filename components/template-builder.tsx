"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VariablePickerTextarea } from "@/components/variable-picker-textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { TemplatePreview } from "@/components/template-preview"
import {
  Plus,
  Trash2,
  X,
  Sparkles,
  Loader2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Upload,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import { useAccounts, useUploadTemplateMedia } from "@/hooks/queries"
import { formatRejectionReason } from "@/utils/template-helpers"

const MEDIA_SIZE_LIMITS_MB: Record<string, number> = {
  image: 5,
  video: 16,
  document: 100,
}

const MEDIA_ACCEPT: Record<string, string> = {
  image: "image/jpeg,image/png",
  video: "video/mp4,video/3gp",
  document: "application/pdf",
}

interface TemplateButton {
  type: "quick_reply" | "url" | "phone_number" | "copy_code"
  text: string
  url?: string
  phone_number?: string
  example_code?: string
  example?: string // URL button dynamic suffix example for Meta
}

interface TemplateData {
  id?: string
  name: string
  display_name: string
  whatsapp_account: string
  language: string
  category: string
  header_type: "none" | "text" | "image" | "video" | "document"
  header_content: string
  body: string
  footer: string
  buttons: TemplateButton[]
  sample_values: Record<string, string>
  status?: string
  rejection_reason?: string
}

interface TemplateBuilderProps {
  template?: TemplateData
  onSave: (template: TemplateData) => Promise<void>
  onCancel: () => void
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "es", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (BR)" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
]

const CATEGORIES = [
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
]

const BUTTON_TYPES = [
  { value: "quick_reply", label: "Quick Reply" },
  { value: "url", label: "URL" },
  { value: "phone_number", label: "Phone Number" },
  { value: "copy_code", label: "Copy Code" },
]

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))]
}

const emptyTemplate: TemplateData = {
  name: "",
  display_name: "",
  whatsapp_account: "",
  language: "en",
  category: "MARKETING",
  header_type: "none",
  header_content: "",
  body: "",
  footer: "",
  buttons: [],
  sample_values: {},
}

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [data, setData] = useState<TemplateData>(template || emptyTemplate)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts()
  const uploadMutation = useUploadTemplateMedia()
  const uploading = uploadMutation.isPending

  // Auto-select if only one account and no account set
  useEffect(() => {
    if (accounts.length === 1 && !template?.whatsapp_account) {
      setData((prev) => ({ ...prev, whatsapp_account: accounts[0].name }))
    }
  }, [accounts, template?.whatsapp_account])

  const update = useCallback((patch: Partial<TemplateData>) => {
    setData((prev) => ({ ...prev, ...patch }))
  }, [])

  const normalizeName = (value: string) => {
    return value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_/, "")
  }

  // Collect all variables from header + body + URL buttons
  const urlButtonVars = data.buttons
    .filter((b) => b.type === "url" && b.url)
    .flatMap((b) => extractVariables(b.url || ""))

  const allVariables = [
    ...extractVariables(data.header_content),
    ...extractVariables(data.body),
    ...urlButtonVars,
  ]

  const handleAddButton = (type: string) => {
    if (data.buttons.length >= 10) {
      toast.error("Maximum 10 buttons allowed")
      return
    }
    const newButton: TemplateButton = {
      type: type as TemplateButton["type"],
      text: "",
      ...(type === "url" ? { url: "" } : {}),
      ...(type === "phone_number" ? { phone_number: "" } : {}),
      ...(type === "copy_code" ? { example_code: "" } : {}),
    }
    update({ buttons: [...data.buttons, newButton] })
  }

  const handleUpdateButton = (index: number, patch: Partial<TemplateButton>) => {
    const updated = [...data.buttons]
    updated[index] = { ...updated[index], ...patch }
    update({ buttons: updated })
  }

  const handleRemoveButton = (index: number) => {
    update({ buttons: data.buttons.filter((_, i) => i !== index) })
  }

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return

    if (!data.whatsapp_account) {
      toast.error("Select a WhatsApp account first")
      return
    }

    const limitMB = MEDIA_SIZE_LIMITS_MB[data.header_type] ?? 5
    if (file.size > limitMB * 1024 * 1024) {
      toast.error(`File too large. Max ${limitMB} MB for ${data.header_type}.`)
      return
    }

    try {
      const result = await uploadMutation.mutateAsync({ file, account: data.whatsapp_account })
      update({ header_content: result.handle })
      setUploadedFilename(file.name)
      toast.success("Media uploaded")
    } catch (err: any) {
      toast.error(err.message || "Upload failed")
    }
  }

  const handleMoveButton = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= data.buttons.length) return
    const updated = [...data.buttons]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    update({ buttons: updated })
  }

  const handleAiGenerate = async () => {
    const isImprove = !!data.body
    setAiLoading(true)
    try {
      const response = await fetch("/api/ai/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: isImprove ? "improve" : "generate",
          description: data.display_name || data.name || "general purpose template",
          currentBody: data.body || undefined,
          category: data.category,
        }),
      })
      if (!response.ok) throw new Error("AI generation failed")
      const result = await response.json()

      // Improve mode rewrites the body only — the AI schema can't represent
      // image/video/document headers, so applying its headerType/content here
      // would destroy any media header the user already set up. Leave the
      // header, footer, buttons, and category alone in improve mode.
      if (result.bodyContent) update({ body: result.bodyContent })

      if (!isImprove) {
        if (result.headerContent && result.headerType !== "none") {
          update({ header_type: result.headerType || "text", header_content: result.headerContent })
        }
        if (result.footerContent) update({ footer: result.footerContent })
        if (result.category) update({ category: result.category })
        if (result.buttons?.length) {
          update({
            buttons: result.buttons.map((b: any) => ({
              type: b.type || "quick_reply",
              text: b.text || "",
              url: b.url,
              phone_number: b.phone_number,
            })),
          })
        }
      }
      toast.success(isImprove ? "AI improved the body" : "AI generated template content")
    } catch {
      toast.error("Failed to generate template with AI")
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    if (!data.whatsapp_account) {
      toast.error("WhatsApp account is required")
      return
    }
    if (!data.name) {
      toast.error("Template name is required")
      return
    }
    if (!data.body) {
      toast.error("Template body is required")
      return
    }
    // Meta requires quick reply buttons to be grouped together (not interleaved with other types)
    if (data.buttons.length > 1) {
      const types = data.buttons.map((b) => b.type === "quick_reply" ? "qr" : "other")
      const seen = new Set<string>()
      let lastType = ""
      let interleaved = false
      for (const t of types) {
        if (t !== lastType && seen.has(t)) { interleaved = true; break }
        seen.add(t)
        lastType = t
      }
      if (interleaved) {
        toast.error("Quick reply buttons must be grouped together — they can't be mixed with URL/phone buttons")
        return
      }
    }
    setSaving(true)
    try {
      await onSave(data)
    } catch {
      toast.error("Failed to save template")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header bar */}
      <div className="border-b border-border bg-background/95 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">{template?.id ? "Edit Template" : "Create Template"}</h2>
          {data.status && (
            <Badge variant={data.status === "APPROVED" ? "default" : "secondary"} className="text-[10px]">
              {data.status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {template?.id ? "Update" : "Save Draft"}
          </Button>
        </div>
      </div>

      {data.status === "REJECTED" && formatRejectionReason(data.rejection_reason) && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-6 py-2 text-xs text-destructive">
          <span className="font-medium">Meta rejected this template:</span> {formatRejectionReason(data.rejection_reason)}. Fix the issue, save, then resubmit.
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left — Form */}
        <div className="flex-1 overflow-y-auto scroll-minimal">
          <div className="max-w-2xl mx-auto px-6 py-4 space-y-3">

            {/* Basic Info */}
            <section className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground tracking-wide">Basic Info</h3>
              <div>
                <Label className="text-xs text-muted-foreground">WhatsApp Account</Label>
                <Select value={data.whatsapp_account} onValueChange={(v) => update({ whatsapp_account: v })}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={accountsLoading ? "Loading..." : "Select account"} /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.name}>
                        {acc.name}{acc.status !== "active" ? " (inactive)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tpl-name" className="text-xs text-muted-foreground">Template Name</Label>
                  <Input
                    id="tpl-name"
                    value={data.name}
                    onChange={(e) => update({ name: normalizeName(e.target.value) })}
                    placeholder="order_confirmation"
                    className="mt-1 h-9 font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Lowercase, underscores only</p>
                </div>
                <div>
                  <Label htmlFor="tpl-display" className="text-xs text-muted-foreground">Display Name</Label>
                  <Input
                    id="tpl-display"
                    value={data.display_name}
                    onChange={(e) => update({ display_name: e.target.value })}
                    placeholder="Order Confirmation"
                    className="mt-1 h-9"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Language</Label>
                  <Select value={data.language} onValueChange={(v) => update({ language: v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select value={data.category} onValueChange={(v) => update({ category: v })}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Header */}
            <section className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground tracking-wide">Header</h3>
                <span className="text-[10px] text-muted-foreground/50">Optional</span>
              </div>
              <Select
                value={data.header_type}
                onValueChange={(v) => {
                  update({ header_type: v as TemplateData["header_type"], header_content: "" })
                  setUploadedFilename(null)
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>
              {data.header_type === "text" && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Header Text</Label>
                    <p className="text-[9px] text-muted-foreground/50 mb-1">Bold text above the body. Supports one {"{{variable}}"}.</p>
                    <VariablePickerTextarea
                      value={data.header_content}
                      onValueChange={(val) => { if (val.length <= 60) update({ header_content: val }) }}
                      placeholder="e.g. Order update for {{customer_name}}"
                      className="min-h-[36px] text-sm"
                      showUnknownWarnings={false}
                      showVariableButton={false}
                    />
                    <div className="flex justify-end mt-0.5">
                      <span className="text-[10px] text-muted-foreground/50">{data.header_content.length}/60</span>
                    </div>
                  </div>
                  {extractVariables(data.header_content).map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded px-1.5 py-0.5 min-w-[50px] text-center">{v}</span>
                      <Input
                        value={data.sample_values[v] || ""}
                        onChange={(e) => update({ sample_values: { ...data.sample_values, [v]: e.target.value } })}
                        placeholder={`Sample value for ${v}`}
                        className="h-7 text-xs flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
              {(data.header_type === "image" || data.header_type === "video" || data.header_type === "document") && (
                <div className="space-y-1.5">
                  <p className="text-[9px] text-muted-foreground/50">
                    Meta requires a sample {data.header_type}. Uploaded here, used only for template review — not shown to recipients.
                  </p>
                  {data.header_content ? (
                    <div className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        <span className="text-xs truncate">
                          {uploadedFilename || `Uploaded ${data.header_type}`}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        className="cursor-pointer h-7 px-2 text-xs gap-1"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Replace
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full justify-start cursor-pointer h-9"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || !data.whatsapp_account}
                    >
                      {uploading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-2" />}
                      {uploading ? "Uploading…" : `Upload ${data.header_type}`}
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={MEDIA_ACCEPT[data.header_type] ?? ""}
                    className="hidden"
                    onChange={handleMediaUpload}
                  />
                  {!data.whatsapp_account && (
                    <p className="text-[10px] text-warning">Select a WhatsApp account above to enable upload.</p>
                  )}
                </div>
              )}
            </section>

            {/* Body — the hero section */}
            <section className="rounded-lg border-2 border-primary/20 bg-primary/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-medium text-foreground tracking-wide">Message Body</h3>
                  <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium">Required</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiLoading}
                  className="text-xs h-7 gap-1.5"
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {data.body ? "Improve" : "Generate"} with AI
                </Button>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground/60 mb-1.5">Type <code className="bg-muted px-1 rounded text-[9px]">{"{{" }</code> to insert a dynamic variable</p>
                <VariablePickerTextarea
                  value={data.body}
                  onValueChange={(val) => { if (val.length <= 1024) update({ body: val }) }}
                  placeholder="Hello {{user_name}}, your order {{order_id}} is confirmed!"
                  className="min-h-[120px] text-sm"
                  showUnknownWarnings={false}
                />
                <div className="flex justify-end mt-0.5">
                  <span className="text-[10px] text-muted-foreground/50">{data.body.length}/1024</span>
                </div>
              </div>
              {extractVariables(data.body).length > 0 && (
                <div className="border-t border-border/40 pt-2 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground/60">Sample values for Meta review</p>
                  {extractVariables(data.body).map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="shrink-0 font-mono text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded px-1.5 py-0.5 min-w-[50px] text-center">{v}</span>
                      <Input
                        value={data.sample_values[v] || ""}
                        onChange={(e) => update({ sample_values: { ...data.sample_values, [v]: e.target.value } })}
                        placeholder={`Sample value for ${v}`}
                        className="h-7 text-xs flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Footer */}
            <section className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground tracking-wide">Footer</h3>
                <span className="text-[10px] text-muted-foreground/50">Optional · No variables</span>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Footer Text</Label>
                <p className="text-[9px] text-muted-foreground/50 mb-1">Small text below the body. No variables allowed.</p>
                <Input
                  value={data.footer}
                  onChange={(e) => { if (e.target.value.length <= 60) update({ footer: e.target.value }) }}
                  placeholder="e.g. Reply STOP to unsubscribe"
                  className="h-9"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] text-muted-foreground/50">{data.footer.length}/60</span>
                </div>
              </div>
            </section>

            {/* Buttons */}
            <section className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground tracking-wide">Buttons</h3>
                  <span className="text-[10px] text-muted-foreground/50">{data.buttons.length}/10</span>
                </div>
                <Select onValueChange={handleAddButton}>
                  <SelectTrigger className="w-[140px] h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    <SelectValue placeholder="Add Button" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUTTON_TYPES.map((bt) => <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {data.buttons.length === 0 && (
                <p className="text-xs text-muted-foreground/40 text-center py-3">No buttons added</p>
              )}
              {data.buttons.map((btn, idx) => (
                <div key={idx} className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono w-4">{idx + 1}.</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">{btn.type.replace("_", " ")}</Badge>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleMoveButton(idx, "up")} disabled={idx === 0}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleMoveButton(idx, "down")} disabled={idx === data.buttons.length - 1}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => handleRemoveButton(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Button Label</Label>
                    <Input
                      value={btn.text}
                      onChange={(e) => { if (e.target.value.length <= 25) handleUpdateButton(idx, { text: e.target.value }) }}
                      placeholder="e.g. Learn More"
                      className="mt-0.5 h-8 text-xs"
                    />
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">Text shown on the button · {btn.text.length}/25</p>
                  </div>
                  {btn.type === "url" && (
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Button URL</Label>
                        <p className="text-[9px] text-muted-foreground/50 mb-1">Use {"{{variable}}"} for a dynamic suffix</p>
                        <VariablePickerTextarea
                          value={btn.url || ""}
                          onValueChange={(val) => handleUpdateButton(idx, { url: val })}
                          placeholder="https://example.com/track/"
                          className="min-h-[36px] font-mono text-xs"
                          showUnknownWarnings={false}
                          showVariableButton={false}
                        />
                      </div>
                      {extractVariables(btn.url || "").map((v) => (
                        <div key={v} className="flex items-center gap-2">
                          <span className="shrink-0 font-mono text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded px-1.5 py-0.5 min-w-[50px] text-center">{v}</span>
                          <Input
                            value={data.sample_values[v] || ""}
                            onChange={(e) => update({ sample_values: { ...data.sample_values, [v]: e.target.value } })}
                            placeholder={`Sample value for ${v}`}
                            className="h-7 text-xs flex-1"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {btn.type === "phone_number" && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Phone Number</Label>
                      <p className="text-[9px] text-muted-foreground/50 mb-0.5">Include country code</p>
                      <Input
                        value={btn.phone_number || ""}
                        onChange={(e) => handleUpdateButton(idx, { phone_number: e.target.value })}
                        placeholder="+1234567890"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  {btn.type === "copy_code" && (
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Coupon Code</Label>
                      <p className="text-[9px] text-muted-foreground/50 mb-0.5">Example code that users can copy</p>
                      <Input
                        value={btn.example_code || ""}
                        onChange={(e) => { if (e.target.value.length <= 15) handleUpdateButton(idx, { example_code: e.target.value }) }}
                        placeholder="e.g. SAVE20"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </section>

            <div className="h-4" />
          </div>
        </div>

        {/* Right — Preview */}
        <div className="w-[380px] border-l border-border bg-gradient-to-b from-muted/40 to-muted/20 p-5 overflow-y-auto scroll-minimal flex flex-col items-center">
          <div className="flex items-center gap-2 mb-5 self-start">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00a884]" />
            <h3 className="text-[11px] font-medium text-muted-foreground tracking-wide">Live Preview</h3>
          </div>
          <TemplatePreview
            headerType={data.header_type}
            headerContent={data.header_content}
            body={data.body}
            footer={data.footer}
            buttons={data.buttons}
          />
        </div>
      </div>
    </div>
  )
}
