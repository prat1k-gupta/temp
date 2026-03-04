"use client"

import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
} from "lucide-react"
import { toast } from "sonner"

interface TemplateButton {
  type: "quick_reply" | "url" | "phone_number" | "copy_code"
  text: string
  url?: string
  phone_number?: string
  example_code?: string
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

interface WhatsAppAccount {
  id: string
  name: string
  status: string
}

export function TemplateBuilder({ template, onSave, onCancel }: TemplateBuilderProps) {
  const [data, setData] = useState<TemplateData>(template || emptyTemplate)
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)

  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.accounts || []
        setAccounts(list)
        // Auto-select if only one account and no account set
        if (list.length === 1 && !template?.whatsapp_account) {
          setData((prev) => ({ ...prev, whatsapp_account: list[0].name }))
        }
      })
      .catch(() => {})
      .finally(() => setAccountsLoading(false))
  }, [template?.whatsapp_account])

  const update = useCallback((patch: Partial<TemplateData>) => {
    setData((prev) => ({ ...prev, ...patch }))
  }, [])

  const normalizeName = (value: string) => {
    return value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
  }

  // Collect all variables from header + body
  const allVariables = [
    ...extractVariables(data.header_content),
    ...extractVariables(data.body),
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

  const handleMoveButton = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= data.buttons.length) return
    const updated = [...data.buttons]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    update({ buttons: updated })
  }

  const handleInsertVariable = () => {
    const existingNums = extractVariables(data.body)
      .filter((v) => /^\d+$/.test(v))
      .map(Number)
    const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1
    update({ body: data.body + `{{${next}}}` })
  }

  const handleAiGenerate = async () => {
    setAiLoading(true)
    try {
      const response = await fetch("/api/ai/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: data.body ? "improve" : "generate",
          description: data.display_name || data.name || "general purpose template",
          currentBody: data.body || undefined,
          category: data.category,
        }),
      })
      if (!response.ok) throw new Error("AI generation failed")
      const result = await response.json()
      if (result.bodyContent) update({ body: result.bodyContent })
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
      toast.success("AI generated template content")
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
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{template?.id ? "Edit Template" : "Create Template"}</h2>
          {data.status && (
            <Badge variant={data.status === "APPROVED" ? "default" : "secondary"}>
              {data.status}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[#052762] hover:bg-[#0A49B7] text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {template?.id ? "Update" : "Save Draft"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex h-[calc(100vh-57px)] overflow-hidden">
        {/* Left — Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Info</h3>
            <div>
              <Label>WhatsApp Account</Label>
              <Select
                value={data.whatsapp_account}
                onValueChange={(v) => update({ whatsapp_account: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Select account"} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.name}>
                      {acc.name}
                      {acc.status !== "active" ? ` (${acc.status})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tpl-name">Template Name</Label>
                <Input
                  id="tpl-name"
                  value={data.name}
                  onChange={(e) => update({ name: normalizeName(e.target.value) })}
                  placeholder="order_confirmation"
                  className="mt-1 font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Lowercase, underscores only</p>
              </div>
              <div>
                <Label htmlFor="tpl-display">Display Name</Label>
                <Input
                  id="tpl-display"
                  value={data.display_name}
                  onChange={(e) => update({ display_name: e.target.value })}
                  placeholder="Order Confirmation"
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Language</Label>
                <Select value={data.language} onValueChange={(v) => update({ language: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={data.category} onValueChange={(v) => update({ category: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Header */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Header (optional)</h3>
            <Select
              value={data.header_type}
              onValueChange={(v) => update({ header_type: v as TemplateData["header_type"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectContent>
            </Select>
            {data.header_type === "text" && (
              <div>
                <Input
                  value={data.header_content}
                  onChange={(e) => {
                    if (e.target.value.length <= 60) update({ header_content: e.target.value })
                  }}
                  placeholder="Header text (supports 1 {{variable}})"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{data.header_content.length}/60 characters</p>
              </div>
            )}
            {(data.header_type === "image" || data.header_type === "video" || data.header_type === "document") && (
              <Input
                value={data.header_content}
                onChange={(e) => update({ header_content: e.target.value })}
                placeholder={`${data.header_type} URL or upload`}
              />
            )}
          </section>

          <Separator />

          {/* Body */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Body (required)</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleInsertVariable} className="text-xs h-7">
                  <Plus className="w-3 h-3 mr-1" />
                  Variable
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiLoading}
                  className="text-xs h-7"
                >
                  {aiLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  {data.body ? "Improve with AI" : "Generate with AI"}
                </Button>
              </div>
            </div>
            <Textarea
              value={data.body}
              onChange={(e) => {
                if (e.target.value.length <= 1024) update({ body: e.target.value })
              }}
              placeholder="Hello {{1}}, your order {{2}} has been confirmed!"
              className="min-h-[120px] font-mono text-sm"
              rows={5}
            />
            <p className="text-[10px] text-muted-foreground">{data.body.length}/1024 characters</p>
          </section>

          <Separator />

          {/* Footer */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Footer (optional)</h3>
            <Input
              value={data.footer}
              onChange={(e) => {
                if (e.target.value.length <= 60) update({ footer: e.target.value })
              }}
              placeholder="Footer text (no variables)"
            />
            <p className="text-[10px] text-muted-foreground">{data.footer.length}/60 characters</p>
          </section>

          <Separator />

          {/* Buttons */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Buttons (optional, up to 10)</h3>
              <Select onValueChange={handleAddButton}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <Plus className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Add Button" />
                </SelectTrigger>
                <SelectContent>
                  {BUTTON_TYPES.map((bt) => (
                    <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data.buttons.map((btn, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <Badge variant="outline" className="text-[10px]">{btn.type.replace("_", " ")}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleMoveButton(idx, "up")} disabled={idx === 0}>
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleMoveButton(idx, "down")} disabled={idx === data.buttons.length - 1}>
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleRemoveButton(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <Input
                  value={btn.text}
                  onChange={(e) => {
                    if (e.target.value.length <= 25) handleUpdateButton(idx, { text: e.target.value })
                  }}
                  placeholder="Button text (25 chars max)"
                />
                {btn.type === "url" && (
                  <Input
                    value={btn.url || ""}
                    onChange={(e) => handleUpdateButton(idx, { url: e.target.value })}
                    placeholder="https://example.com/{{1}}"
                  />
                )}
                {btn.type === "phone_number" && (
                  <Input
                    value={btn.phone_number || ""}
                    onChange={(e) => handleUpdateButton(idx, { phone_number: e.target.value })}
                    placeholder="+1234567890"
                  />
                )}
                {btn.type === "copy_code" && (
                  <Input
                    value={btn.example_code || ""}
                    onChange={(e) => {
                      if (e.target.value.length <= 15) handleUpdateButton(idx, { example_code: e.target.value })
                    }}
                    placeholder="Example code (4-15 chars)"
                  />
                )}
              </div>
            ))}
          </section>

          {/* Sample Values */}
          {allVariables.length > 0 && (
            <>
              <Separator />
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sample Values (for Meta submission)</h3>
                {allVariables.map((v) => (
                  <div key={v}>
                    <Label className="text-xs">{`Sample value for {{${v}}}`}</Label>
                    <Input
                      value={data.sample_values[v] || ""}
                      onChange={(e) =>
                        update({ sample_values: { ...data.sample_values, [v]: e.target.value } })
                      }
                      placeholder={`e.g. John, #12345`}
                      className="mt-1"
                    />
                  </div>
                ))}
              </section>
            </>
          )}

          <div className="h-8" />
        </div>

        {/* Right — Preview */}
        <div className="w-[400px] border-l border-border bg-muted/30 p-6 overflow-y-auto flex flex-col items-center">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-6 self-start">Preview</h3>
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
