"use client"

import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useForm, useFieldArray, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form"
import { StoreAsPill } from "@/components/nodes/core/store-as-pill"
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Type,
  TextCursorInput,
  CircleDot,
  CheckSquare,
  Calendar,
  CalendarDays,
  ChevronRight,
  Image as ImageIcon,
  ArrowRight,
  Tags,
  ToggleLeft,
  FileText,
  Link,
  GitBranch,
  Smartphone,
  Save,
  Upload,
  GripVertical,
  X,
  Lock,
  Pencil,
  Check,
  Copy,
  Loader2,
} from "lucide-react"
import { useAccounts } from "@/hooks/queries"

// ─── Types ───────────────────────────────────────────────────────────────

interface FlowComponent {
  id: string
  type: string
  name?: string
  label?: string
  text?: string
  required?: boolean
  "input-type"?: string
  "data-source"?: Array<{ id: string; title: string }>
  "on-click-action"?: { name: string; next?: any; payload?: any }
  "min-selected-items"?: number
  "max-selected-items"?: number
  "helper-text"?: string
  src?: string
  height?: number
  "scale-type"?: string
  "alt-text"?: string
  [key: string]: any
}

interface FlowScreen {
  id: string
  title: string
  terminal?: boolean
  data?: Record<string, any>
  layout: {
    type: "SingleColumnLayout"
    children: FlowComponent[]
  }
}

interface WhatsAppFlowBuilderModalProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    screens: FlowScreen[]
    responseFields: string[]
    version: string
    publish: boolean
    existingFlowId?: string
    whatsappAccount: string
  }) => Promise<string | void>
  existingFlow?: {
    id: string
    name: string
    status?: string
    whatsappAccount?: string
    flowJson: { screens: FlowScreen[]; version?: string }
  }
  /** Pre-selected WhatsApp account inherited from the parent flow's publish target */
  defaultWhatsAppAccount?: string
}

// ─── Component Catalog ───────────────────────────────────────────────────

interface CatalogItem {
  type: string
  friendly: string
  category: "text" | "input" | "choice" | "special" | "structure"
  icon: any
  description: string
  comingSoon?: boolean
}

const COMPONENT_CATALOG: CatalogItem[] = [
  // Text
  { type: "TextHeading", friendly: "Heading", category: "text", icon: Type, description: "Large bold title" },
  { type: "TextSubheading", friendly: "Subheading", category: "text", icon: Type, description: "Section header" },
  { type: "TextBody", friendly: "Paragraph", category: "text", icon: Type, description: "Body text" },
  { type: "TextCaption", friendly: "Caption", category: "text", icon: Type, description: "Small helper text" },
  // Input
  { type: "TextInput", friendly: "Short Answer", category: "input", icon: TextCursorInput, description: "Name, email, phone..." },
  { type: "TextArea", friendly: "Long Answer", category: "input", icon: TextCursorInput, description: "Feedback, comments..." },
  // Choice
  { type: "Dropdown", friendly: "Dropdown", category: "choice", icon: ChevronRight, description: "Pick one from a list" },
  { type: "RadioButtonsGroup", friendly: "Single Choice", category: "choice", icon: CircleDot, description: "Pick exactly one" },
  { type: "CheckboxGroup", friendly: "Multiple Choice", category: "choice", icon: CheckSquare, description: "Pick several" },
  { type: "ChipsSelector", friendly: "Chips", category: "choice", icon: Tags, description: "Tag-style multi-select" },
  // Special
  { type: "DatePicker", friendly: "Date", category: "special", icon: Calendar, description: "Simple date field" },
  { type: "CalendarPicker", friendly: "Calendar", category: "special", icon: CalendarDays, description: "Full calendar view" },
  { type: "OptIn", friendly: "Consent", category: "special", icon: ToggleLeft, description: "Agreement checkbox" },
  { type: "Image", friendly: "Image", category: "special", icon: ImageIcon, description: "Display an image" },
  // Structure
  { type: "Footer", friendly: "Button", category: "structure", icon: ArrowRight, description: "Next page or submit" },
  // Coming soon
  { type: "RichText", friendly: "Rich Text", category: "text", icon: FileText, description: "Markdown content", comingSoon: true },
  { type: "EmbeddedLink", friendly: "Link", category: "special", icon: Link, description: "Clickable link", comingSoon: true },
  { type: "If", friendly: "Condition", category: "structure", icon: GitBranch, description: "Show/hide fields", comingSoon: true },
]

// ─── Meta Constraints ────────────────────────────────────────────────────

// Official Meta WhatsApp Flows constraints (from developers.facebook.com/docs/whatsapp/flows/reference/components)
const CONSTRAINTS = {
  flow: { maxScreens: 8 },
  screen: { maxComponents: 50, maxFooter: 1, maxEmbeddedLink: 2, maxOptIn: 5, maxImage: 3 },
  chars: {
    // Text display components
    TextHeading: { text: 80 },
    TextSubheading: { text: 80 },
    TextBody: { text: 4096 },
    TextCaption: { text: 409 },
    // Text input components
    TextInput: { label: 20, helperText: 80, errorText: 30, maxChars: 80 },
    TextArea: { label: 20, helperText: 80, errorText: 30, maxLength: 600 },
    // Selection components — title = option title, description = option description, metadata = option metadata
    Dropdown: { label: 20, optionTitle: 30, optionDescription: 300, optionMetadata: 20, maxOptions: 200, minOptions: 1 },
    RadioButtonsGroup: { label: 80, optionTitle: 30, optionDescription: 300, optionMetadata: 20, maxOptions: 20 },
    CheckboxGroup: { label: 80, optionTitle: 30, optionDescription: 300, optionMetadata: 20, maxOptions: 20, maxSelected: 20 },
    ChipsSelector: { label: 80, optionDescription: 300, maxOptions: 20, minOptions: 2, maxSelected: 20 },
    // Date/calendar components
    DatePicker: { label: 40, helperText: 80, errorMessage: 80 },
    CalendarPicker: { label: 20, helperText: 80, errorMessage: 80, title: 80, description: 300 },
    // Other components
    OptIn: { label: 120 },
    Footer: { label: 35, caption: 15 },
    EmbeddedLink: { text: 30 },
    Image: { altText: 100, maxSizeKB: 300 },
  } as Record<string, Record<string, number>>,
  version: "6.3",
}

const CATEGORY_LABELS: Record<string, string> = {
  text: "Text & Display",
  input: "Questions",
  choice: "Choices",
  special: "Special",
  structure: "Structure",
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function generateId() {
  const chars = "abcdefghijklmnopqrstuvwxyz"
  let r = "id_"
  for (let i = 0; i < 10; i++) r += chars[Math.floor(Math.random() * 26)]
  return r
}

function generateFieldName(type: string, screens: FlowScreen[]) {
  const prefixMap: Record<string, string> = {
    TextInput: "text_input", TextArea: "text_area", Dropdown: "dropdown",
    RadioButtonsGroup: "radio", CheckboxGroup: "checkbox", ChipsSelector: "chips",
    DatePicker: "date", CalendarPicker: "calendar", OptIn: "opt_in",
  }
  const prefix = prefixMap[type] || "field"
  let count = 1
  for (const s of screens) {
    for (const c of s.layout.children) {
      if (c.name?.startsWith(prefix)) count++
    }
  }
  return `${prefix}_${count}`
}

function numberToLetter(n: number) {
  let r = ""
  while (n > 0) { n--; r = String.fromCharCode(65 + (n % 26)) + r; n = Math.floor(n / 26) }
  return r
}

function extractResponseFields(screens: FlowScreen[]): string[] {
  const fields: string[] = []
  for (const s of screens) {
    for (const c of s.layout.children) {
      if (INPUT_TYPES.has(c.type) && c.name) fields.push(c.name)
    }
  }
  return fields
}

const INPUT_TYPES = new Set(["TextInput", "TextArea", "DatePicker", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "ChipsSelector", "CalendarPicker", "OptIn"])

function createDefaultComponent(type: string, screens: FlowScreen[], activeScreenIdx?: number): FlowComponent {
  const comp: FlowComponent = { id: generateId(), type }
  switch (type) {
    case "TextHeading": case "TextSubheading": case "TextBody": case "TextCaption":
      comp.text = type === "TextHeading" ? "Your heading here" : type === "TextSubheading" ? "Section title" : type === "TextCaption" ? "Helper text" : "Add your text here"
      break
    case "TextInput":
      comp.name = generateFieldName(type, screens); comp.label = "Your answer"; comp.required = true; comp["input-type"] = "text"
      break
    case "TextArea":
      comp.name = generateFieldName(type, screens); comp.label = "Your response"; comp.required = true
      break
    case "Dropdown":
      comp.name = generateFieldName(type, screens); comp.label = "Select one"; comp.required = true
      comp["data-source"] = [{ id: "opt_1", title: "Option 1" }, { id: "opt_2", title: "Option 2" }]
      break
    case "RadioButtonsGroup":
      comp.name = generateFieldName(type, screens); comp.label = "Choose one"; comp.required = true
      comp["data-source"] = [{ id: "opt_1", title: "Option 1" }, { id: "opt_2", title: "Option 2" }]
      break
    case "CheckboxGroup":
      comp.name = generateFieldName(type, screens); comp.label = "Select all that apply"; comp.required = true
      comp["data-source"] = [{ id: "opt_1", title: "Option 1" }, { id: "opt_2", title: "Option 2" }]
      break
    case "ChipsSelector":
      comp.name = generateFieldName(type, screens); comp.label = "Pick tags"; comp.required = true
      comp["min-selected-items"] = 1; comp["max-selected-items"] = 3
      comp["data-source"] = [{ id: "tag_1", title: "Tag 1" }, { id: "tag_2", title: "Tag 2" }, { id: "tag_3", title: "Tag 3" }]
      break
    case "DatePicker":
      comp.name = generateFieldName(type, screens); comp.label = "Select date"; comp.required = true
      break
    case "CalendarPicker":
      comp.name = generateFieldName(type, screens); comp.label = "Pick a date"; comp.required = true
      break
    case "OptIn":
      comp.name = generateFieldName(type, screens); comp.label = "I agree to the terms"; comp.required = true
      break
    case "Image":
      comp.src = ""; comp.height = 200; comp["scale-type"] = "contain"; comp["alt-text"] = "Image"
      break
    case "Footer": {
      comp.label = "Continue"
      // Default to navigate to next screen; complete only if this is the last screen
      const currentIdx = activeScreenIdx ?? screens.length - 1
      const nextScreen = screens[currentIdx + 1]
      if (nextScreen) {
        comp["on-click-action"] = { name: "navigate", next: { type: "screen", name: nextScreen.id }, payload: {} }
      } else {
        comp["on-click-action"] = { name: "complete", payload: {} }
      }
      break
    }
  }
  return comp
}

// ─── Zod Schema ──────────────────────────────────────────────────────────

const optionSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Option title required"),
})

const flowComponentSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  required: z.boolean().optional(),
  "input-type": z.string().optional(),
  "data-source": z.array(optionSchema).optional(),
  "on-click-action": z.object({
    name: z.string(),
    next: z.any().optional(),
    payload: z.any().optional(),
  }).optional(),
  "min-selected-items": z.number().optional(),
  "max-selected-items": z.number().optional(),
  "helper-text": z.string().optional(),
  src: z.string().optional(),
  height: z.number().optional(),
  "scale-type": z.string().optional(),
  "alt-text": z.string().optional(),
}).passthrough()

const flowScreenSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Screen title required"),
  terminal: z.boolean().optional(),
  data: z.record(z.any()).optional(),
  layout: z.object({
    type: z.literal("SingleColumnLayout"),
    children: z.array(flowComponentSchema),
  }),
})

const formSchema = z.object({
  flowName: z.string().min(1, "Flow name is required"),
  selectedAccount: z.string(),
  isExistingFlow: z.boolean().optional(),
  screens: z.array(flowScreenSchema).min(1, "At least one screen required").max(8, "Max 8 screens"),
}).superRefine((data, ctx) => {
  if (!data.isExistingFlow && !data.selectedAccount) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a WhatsApp account.", path: ["selectedAccount"] })
  }
  // input fields must have non-empty unique names
  const names: string[] = []
  for (let si = 0; si < data.screens.length; si++) {
    for (let ci = 0; ci < data.screens[si].layout.children.length; ci++) {
      const comp = data.screens[si].layout.children[ci]
      if (INPUT_TYPES.has(comp.type)) {
        if (!comp.name?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${comp.label || comp.type}" on "${data.screens[si].title}" is missing a variable name.`,
            path: ["screens", si, "layout", "children", ci, "name"],
          })
        } else if (names.includes(comp.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate variable name "${comp.name}"`,
            path: ["screens", si, "layout", "children", ci, "name"],
          })
        } else {
          names.push(comp.name)
        }
      }
    }
  }
})

type FormValues = z.infer<typeof formSchema>

// ─── Phone Preview Components ────────────────────────────────────────────

function PhoneComponentPreview({ comp, selected, onSelect }: { comp: FlowComponent; selected: boolean; onSelect: () => void }) {
  const base = "px-4 py-2 transition-all cursor-pointer rounded-lg"
  const ring = selected ? "ring-2 ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"

  switch (comp.type) {
    case "TextHeading":
      return <div className={cn(base, ring)} onClick={onSelect}><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{comp.text || "Heading"}</h2></div>
    case "TextSubheading":
      return <div className={cn(base, ring)} onClick={onSelect}><h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{comp.text || "Subheading"}</h3></div>
    case "TextBody":
      return <div className={cn(base, ring)} onClick={onSelect}><p className="text-sm text-gray-600 dark:text-gray-400">{comp.text || "Body text"}</p></div>
    case "TextCaption":
      return <div className={cn(base, ring)} onClick={onSelect}><p className="text-xs text-gray-400 dark:text-gray-500">{comp.text || "Caption"}</p></div>
    case "TextInput":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            {comp.label || "Label"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          <div className="mt-1 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 flex items-center">
            <span className="text-xs text-gray-400">{comp["input-type"] === "email" ? "email@example.com" : comp["input-type"] === "phone" ? "+1 234 567 8900" : "Type here..."}</span>
          </div>
        </div>
      )
    case "TextArea":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            {comp.label || "Label"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          <div className="mt-1 h-16 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 pt-2">
            <span className="text-xs text-gray-400">Type your answer...</span>
          </div>
        </div>
      )
    case "Dropdown":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            {comp.label || "Select"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          <div className="mt-1 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">Choose...</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      )
    case "RadioButtonsGroup":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
            {comp.label || "Choose"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          {(comp["data-source"] || []).map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 py-1">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              <span className="text-xs text-gray-700 dark:text-gray-300">{opt.title}</span>
            </div>
          ))}
        </div>
      )
    case "CheckboxGroup":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
            {comp.label || "Select"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          {(comp["data-source"] || []).map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 py-1">
              <div className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600" />
              <span className="text-xs text-gray-700 dark:text-gray-300">{opt.title}</span>
            </div>
          ))}
        </div>
      )
    case "ChipsSelector":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
            {comp.label || "Pick"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(comp["data-source"] || []).map((opt) => (
              <span key={opt.id} className="text-[10px] px-2 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">{opt.title}</span>
            ))}
          </div>
        </div>
      )
    case "DatePicker":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            {comp.label || "Date"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          <div className="mt-1 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">DD/MM/YYYY</span>
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      )
    case "CalendarPicker":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            {comp.label || "Date"}{comp.required && <span className="text-red-500">*</span>}
          </label>
          <div className="mt-1 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">Tap to pick date</span>
            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      )
    case "OptIn":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 rounded border border-gray-300 dark:border-gray-600 mt-0.5 shrink-0" />
            <span className="text-xs text-gray-600 dark:text-gray-400">{comp.label || "I agree"}</span>
          </div>
        </div>
      )
    case "Image":
      return (
        <div className={cn(base, ring)} onClick={onSelect}>
          {comp.src ? (
            <img src={comp.src} alt={comp["alt-text"] || "Image"} className="w-full rounded-md object-cover" style={{ maxHeight: comp.height || 200 }} />
          ) : (
            <div className="w-full h-24 bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
            </div>
          )}
        </div>
      )
    case "Footer":
      return (
        <div className={cn("px-4 py-3", ring)} onClick={onSelect}>
          <button className="w-full h-10 rounded-lg bg-emerald-500 text-white text-sm font-medium">{comp.label || "Continue"}</button>
        </div>
      )
    default:
      return (
        <div className={cn(base, ring, "opacity-50")} onClick={onSelect}>
          <span className="text-xs text-gray-400">{comp.type}</span>
        </div>
      )
  }
}

// ─── Inline Editor ───────────────────────────────────────────────────────

function InlineEditor({ comp, onChange, onDelete, onMoveUp, onMoveDown, onDone, canMoveUp, canMoveDown, screens, currentScreenId, compPath, control }: {
  comp: FlowComponent
  onChange: (key: string, value: any) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDone: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  screens: FlowScreen[]
  currentScreenId: string
  compPath?: string
  control?: any
}) {
  const isTextType = ["TextHeading", "TextSubheading", "TextBody", "TextCaption"].includes(comp.type)
  const isInputType = ["TextInput", "TextArea", "DatePicker", "CalendarPicker", "OptIn"].includes(comp.type)
  const isChoiceType = ["Dropdown", "RadioButtonsGroup", "CheckboxGroup", "ChipsSelector"].includes(comp.type)
  const isFooter = comp.type === "Footer"
  const isImage = comp.type === "Image"

  return (
    <div className="border-t border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10 px-4 py-3 space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
          {COMPONENT_CATALOG.find(c => c.type === comp.type)?.friendly || comp.type}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onMoveUp} disabled={!canMoveUp}><ChevronUp className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onMoveDown} disabled={!canMoveDown}><ChevronDown className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete"><Trash2 className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-emerald-600 hover:text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-950 text-[10px] font-medium" onClick={onDone} title="Done editing"><Check className="w-3 h-3 mr-0.5" />Done</Button>
        </div>
      </div>

      {/* Text content */}
      {isTextType && (() => {
        const maxChars = CONSTRAINTS.chars[comp.type]?.text || 4096
        const currentLen = (comp.text || "").length
        return (
          <div className="space-y-1">
            <Input value={comp.text || ""} onChange={(e) => { if (e.target.value.length <= maxChars) onChange("text", e.target.value) }} placeholder="Enter text..." className="text-xs h-8" maxLength={maxChars} />
            <span className={`text-[9px] ${currentLen > maxChars * 0.9 ? "text-amber-500" : "text-muted-foreground/50"}`}>{currentLen}/{maxChars}</span>
          </div>
        )
      })()}

      {/* Label + Required */}
      {(isInputType || isChoiceType) && (() => {
        const maxLabel = CONSTRAINTS.chars[comp.type]?.label || 40
        return (
        <div className="space-y-2">
          <div className="relative">
            <Input value={comp.label || ""} onChange={(e) => { if (e.target.value.length <= maxLabel) onChange("label", e.target.value) }} placeholder="What should we ask?" className="text-xs h-8" maxLength={maxLabel} />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted-foreground/40">{(comp.label || "").length}/{maxLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground shrink-0">Saves as</span>
                {compPath && control ? (
                  <Controller
                    control={control}
                    name={`${compPath}.name` as any}
                    render={({ field, fieldState }) => (
                      <div className="flex flex-col gap-0.5">
                        <StoreAsPill
                          storeAs={field.value || ""}
                          onUpdate={field.onChange}
                          suggestedName={comp.label}
                          placeholder="Set variable name..."
                        />
                        {fieldState.error && <span className="text-[9px] text-destructive">{fieldState.error.message}</span>}
                      </div>
                    )}
                  />
                ) : (
                  <StoreAsPill
                    storeAs={comp.name || ""}
                    onUpdate={(value) => onChange("name", value)}
                    suggestedName={comp.label}
                    placeholder="Set variable name..."
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-muted-foreground">Required</span>
              <Switch checked={comp.required || false} onCheckedChange={(v) => onChange("required", v)} />
            </div>
          </div>
        </div>
        )
      })()}

      {/* Input type for TextInput */}
      {comp.type === "TextInput" && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground shrink-0">Input type</span>
          <Select value={comp["input-type"] || "text"} onValueChange={(v) => onChange("input-type", v)}>
            <SelectTrigger className="text-xs h-7 flex-1 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text" className="text-xs cursor-pointer">Text</SelectItem>
              <SelectItem value="email" className="text-xs cursor-pointer">Email</SelectItem>
              <SelectItem value="phone" className="text-xs cursor-pointer">Phone</SelectItem>
              <SelectItem value="number" className="text-xs cursor-pointer">Number</SelectItem>
              <SelectItem value="password" className="text-xs cursor-pointer">Password</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Options for choice types */}
      {isChoiceType && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-muted-foreground">Options</span>
          {(comp["data-source"] || []).map((opt, i) => {
            const maxTitle = CONSTRAINTS.chars[comp.type]?.optionTitle || 30
            return (
            <div key={`opt-${i}`} className="flex items-center gap-1.5">
              <div className="flex-1 relative">
                <Input value={opt.title} onChange={(e) => {
                  if (e.target.value.length > maxTitle) return
                  const ds = [...(comp["data-source"] || [])]
                  ds[i] = { ...ds[i], title: e.target.value }
                  onChange("data-source", ds)
                }} className="text-xs h-7 flex-1" maxLength={maxTitle} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted-foreground/40">{(opt.title || "").length}/{maxTitle}</span>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive shrink-0 cursor-pointer" onClick={() => {
                const ds = [...(comp["data-source"] || [])]; ds.splice(i, 1); onChange("data-source", ds)
              }}><X className="w-3 h-3" /></Button>
            </div>
            )
          })}
          {(() => {
            const maxOpts = CONSTRAINTS.chars[comp.type]?.maxOptions || 20
            const currentCount = (comp["data-source"] || []).length
            return (
              <Button variant="outline" size="sm" className="w-full h-7 text-[10px] cursor-pointer" disabled={currentCount >= maxOpts} onClick={() => {
                const ds = [...(comp["data-source"] || []), { id: generateId(), title: "New option" }]
                onChange("data-source", ds)
              }}><Plus className="w-3 h-3 mr-1" />Add option ({currentCount}/{maxOpts})</Button>
            )
          })()}
        </div>
      )}

      {/* Image properties */}
      {isImage && (
        <div className="space-y-2">
          <Input value={comp.src || ""} onChange={(e) => onChange("src", e.target.value)} placeholder="https://example.com/image.png" className="text-xs h-8" />
          <Input value={comp["alt-text"] || ""} onChange={(e) => onChange("alt-text", e.target.value)} placeholder="Image description" className="text-xs h-8" />
        </div>
      )}

      {/* Footer properties */}
      {isFooter && (
        <div className="space-y-2">
          <div className="relative">
            <Input value={comp.label || ""} onChange={(e) => { if (e.target.value.length <= 35) onChange("label", e.target.value) }} placeholder="Button text" className="text-xs h-8" maxLength={35} />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted-foreground/40">{(comp.label || "").length}/35</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground shrink-0">Action</span>
            <Select value={comp["on-click-action"]?.name || "complete"} onValueChange={(v) => {
              if (v === "complete") {
                onChange("on-click-action", { name: "complete", payload: {} })
              } else {
                onChange("on-click-action", { name: "navigate", next: { type: "screen", name: "" }, payload: {} })
              }
            }}>
              <SelectTrigger className="text-xs h-7 flex-1 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complete" className="text-xs cursor-pointer">Submit form</SelectItem>
                <SelectItem value="navigate" className="text-xs cursor-pointer">Go to next page</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {comp["on-click-action"]?.name === "navigate" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground shrink-0">Next page</span>
              <Select value={comp["on-click-action"]?.next?.name || ""} onValueChange={(v) => {
                onChange("on-click-action", { name: "navigate", next: { type: "screen", name: v }, payload: {} })
              }}>
                <SelectTrigger className="text-xs h-7 flex-1 cursor-pointer">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {screens.filter((s) => s.id !== currentScreenId).map((s) => <SelectItem key={s.id} value={s.id} className="text-xs cursor-pointer">{s.title} ({s.id})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────

export function WhatsAppFlowBuilderModal({ open, onClose, onSave, existingFlow, defaultWhatsAppAccount }: WhatsAppFlowBuilderModalProps) {
  const defaultScreen: FlowScreen = {
    id: "WELCOME_SCREEN",
    title: "Page 1",
    layout: { type: "SingleColumnLayout" as const, children: [] }
  }

  // ─── React Hook Form ──────────
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      flowName: "",
      selectedAccount: "",
      isExistingFlow: false,
      screens: [defaultScreen],
    },
  })

  const { fields: screenFields, append: appendScreen, remove: removeScreenField, insert: insertScreen, move: moveScreen } = useFieldArray({
    control: form.control,
    name: "screens",
  })

  // ─── UI-only state ──────────
  const [activeScreenIdx, setActiveScreenIdx] = useState(0)
  const [selectedCompIdx, setSelectedCompIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const { data: whatsappAccounts = [] } = useAccounts()
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [showDeletePageDialog, setShowDeletePageDialog] = useState<number | null>(null)

  // Watch form values for rendering
  const screens = form.watch("screens")
  const flowName = form.watch("flowName")
  const { isDirty } = form.formState

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      form.reset({
        flowName: existingFlow?.name || "",
        selectedAccount: existingFlow?.whatsappAccount || defaultWhatsAppAccount || "",
        isExistingFlow: !!existingFlow,
        screens: existingFlow?.flowJson?.screens?.length
          ? existingFlow.flowJson.screens
          : [{ ...defaultScreen }],
      })
      setActiveScreenIdx(0)
      setSelectedCompIdx(null)
      setSaving(false)
      setPublishing(false)
      setSaveError(null)
      setCreatedFlowId(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const activeScreen = screens[activeScreenIdx] || screens[0]
  const phoneContentRef = useRef<HTMLDivElement>(null)

  // ─── Screen management ──────────

  const addScreen = useCallback(() => {
    const currentScreens = form.getValues("screens")
    if (currentScreens.length >= 8) return
    const n = currentScreens.length + 1
    appendScreen({
      id: `SCREEN_${numberToLetter(n)}`,
      title: `Page ${n}`,
      layout: { type: "SingleColumnLayout" as const, children: [] }
    })
    setActiveScreenIdx(currentScreens.length)
    setSelectedCompIdx(null)
  }, [appendScreen, form])

  const tryClose = useCallback(() => {
    if (form.formState.isDirty) { setShowDiscardDialog(true); return }
    onClose()
  }, [form.formState.isDirty, onClose])

  const removeScreen = useCallback((idx: number) => {
    if (form.getValues("screens").length <= 1) return
    setShowDeletePageDialog(idx)
  }, [form])

  const confirmRemoveScreen = useCallback(() => {
    if (showDeletePageDialog === null) return
    removeScreenField(showDeletePageDialog)
    const remaining = form.getValues("screens").length
    setActiveScreenIdx(Math.min(activeScreenIdx, remaining - 1))
    setSelectedCompIdx(null)
    setShowDeletePageDialog(null)
  }, [showDeletePageDialog, activeScreenIdx, removeScreenField, form])

  const duplicateScreen = useCallback((idx: number) => {
    const currentScreens = form.getValues("screens")
    if (currentScreens.length >= CONSTRAINTS.flow.maxScreens) return
    const source = currentScreens[idx]
    const newScreen: FlowScreen = JSON.parse(JSON.stringify(source))
    newScreen.id = `SCREEN_${numberToLetter(currentScreens.length + 1)}`
    newScreen.title = source.title
    for (const child of newScreen.layout.children) {
      child.id = generateId()
      if (child.name) child.name = generateFieldName(child.type, [...currentScreens, newScreen])
    }
    insertScreen(idx + 1, newScreen)
    setActiveScreenIdx(idx + 1)
    setSelectedCompIdx(null)
  }, [form, insertScreen])

  // ─── Component management ──────

  const addComponent = useCallback((type: string) => {
    const catalog = COMPONENT_CATALOG.find(c => c.type === type)
    if (catalog?.comingSoon) return

    const currentScreens = form.getValues("screens")
    const children = currentScreens[activeScreenIdx]?.layout.children || []

    // Enforce per-screen limits
    if (children.length >= CONSTRAINTS.screen.maxComponents) return
    if (type === "Footer" && children.filter(c => c.type === "Footer").length >= CONSTRAINTS.screen.maxFooter) return
    if (type === "OptIn" && children.filter(c => c.type === "OptIn").length >= CONSTRAINTS.screen.maxOptIn) return
    if (type === "Image" && children.filter(c => c.type === "Image").length >= CONSTRAINTS.screen.maxImage) return

    const comp = createDefaultComponent(type, currentScreens, activeScreenIdx)
    form.setValue(`screens.${activeScreenIdx}.layout.children`, [...children, comp], { shouldDirty: true })
    setSelectedCompIdx(children.length)
    setTimeout(() => {
      phoneContentRef.current?.scrollTo({ top: phoneContentRef.current.scrollHeight, behavior: "smooth" })
    }, 50)
  }, [form, activeScreenIdx])

  const updateComponent = useCallback((compIdx: number, key: string, value: any) => {
    form.setValue(`screens.${activeScreenIdx}.layout.children.${compIdx}.${key}` as any, value, { shouldDirty: true })
  }, [form, activeScreenIdx])

  const removeComponent = useCallback((compIdx: number) => {
    const children = [...form.getValues(`screens.${activeScreenIdx}.layout.children`)]
    children.splice(compIdx, 1)
    form.setValue(`screens.${activeScreenIdx}.layout.children`, children, { shouldDirty: true })
    setSelectedCompIdx(null)
  }, [form, activeScreenIdx])

  const moveComponent = useCallback((compIdx: number, direction: "up" | "down") => {
    const children = [...form.getValues(`screens.${activeScreenIdx}.layout.children`)]
    const newIdx = direction === "up" ? compIdx - 1 : compIdx + 1
    if (newIdx < 0 || newIdx >= children.length) return
    const temp = children[compIdx]
    children[compIdx] = children[newIdx]
    children[newIdx] = temp
    form.setValue(`screens.${activeScreenIdx}.layout.children`, children, { shouldDirty: true })
    setSelectedCompIdx(newIdx)
  }, [form, activeScreenIdx])

  // ─── Save ──────────────────────

  const isPublished = existingFlow?.status === "PUBLISHED"

  const [saveError, setSaveError] = useState<string | null>(null)
  const [createdFlowId, setCreatedFlowId] = useState<string | undefined>(undefined)

  const onSubmit = useCallback(async (data: FormValues, publish: boolean) => {
    if (publish) setPublishing(true); else setSaving(true)
    setSaveError(null)
    try {
      const responseFields = extractResponseFields(data.screens as FlowScreen[])
      const account = existingFlow?.whatsappAccount || data.selectedAccount
      const flowId = existingFlow?.id || createdFlowId
      const returnedId = await onSave({ name: data.flowName, screens: data.screens as FlowScreen[], responseFields, version: "6.3", publish, existingFlowId: flowId, whatsappAccount: account })
      if (returnedId) setCreatedFlowId(returnedId)
      form.reset(data)
    } catch (err: any) {
      setSaveError(err?.message || "Failed to save flow")
      if (err?.flowId) setCreatedFlowId(err.flowId)
    } finally {
      setSaving(false)
      setPublishing(false)
    }
  }, [onSave, existingFlow, form, createdFlowId])

  // ─── Error display ─────────────

  const firstError = useMemo(() => {
    const errs = form.formState.errors
    if (errs.flowName) return errs.flowName.message
    if (errs.selectedAccount) return errs.selectedAccount.message
    if (errs.screens?.root) return errs.screens.root.message
    if (errs.screens) {
      // Walk nested errors for component-level issues
      for (const screenErr of Object.values(errs.screens)) {
        if (typeof screenErr === 'object' && screenErr && 'layout' in screenErr) {
          const layoutErr = (screenErr as any).layout?.children
          if (layoutErr) {
            for (const compErr of Object.values(layoutErr)) {
              if (typeof compErr === 'object' && compErr && 'name' in compErr) {
                return (compErr as any).name?.message
              }
            }
          }
        }
      }
    }
    return null
  }, [form.formState.errors])

  // ─── Grouped catalog ──────────

  const groupedCatalog = useMemo(() => {
    const groups: Record<string, CatalogItem[]> = {}
    for (const item of COMPONENT_CATALOG) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    return groups
  }, [])

  return (
    <><Dialog open={open} onOpenChange={(v) => { if (!v) tryClose() }}>
      <DialogContent showCloseButton={false} className="!max-w-[1000px] w-[95vw] h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <Form {...form}>
        {/* ─── Header ─── */}
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div className="flex items-center gap-3 flex-1">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            <FormField control={form.control} name="flowName" render={({ field, fieldState }) => (
              <FormItem className="relative max-w-[300px]">
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Flow name..."
                    className={cn("h-8 text-sm font-medium border-0 shadow-none focus-visible:ring-0 bg-transparent pr-6 hover:bg-muted/50 rounded cursor-text", fieldState.error && "ring-1 ring-destructive")}
                  />
                </FormControl>
                <Pencil className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40 pointer-events-none" />
              </FormItem>
            )} />
            <Separator orientation="vertical" className="h-5" />
            <FormField control={form.control} name="selectedAccount" render={({ field, fieldState }) => (
              <FormItem>
                <FormControl>
                  <Select
                    value={existingFlow ? (existingFlow.whatsappAccount || field.value) : field.value}
                    onValueChange={field.onChange}
                    disabled={!!existingFlow}
                  >
                    <SelectTrigger className={cn(
                      "h-7 text-[11px] cursor-pointer",
                      existingFlow && "opacity-70 cursor-not-allowed",
                      fieldState.error && "border-destructive"
                    )}>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {whatsappAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.name} className="text-xs cursor-pointer">{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
              </FormItem>
            )} />
          </div>
          <div className="flex items-center gap-2">
            {/* Status */}
            {isPublished && <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><Lock className="w-2.5 h-2.5 mr-1" />Published</Badge>}
            {existingFlow && !isPublished && <Badge className="text-[10px] h-5 bg-muted text-muted-foreground">Editing</Badge>}
            {!existingFlow && <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">New</Badge>}
            {isDirty && <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-600">Unsaved</Badge>}
            <Button variant="outline" size="sm" onClick={tryClose} disabled={saving || publishing} className="h-8 cursor-pointer">Cancel</Button>
            <Button type="button" variant="outline" size="sm" onClick={async () => {
              const valid = await form.trigger()
              if (!valid) return
              await onSubmit(form.getValues(), false)
            }} disabled={!flowName.trim() || !isDirty || saving || publishing} className="h-8 cursor-pointer">
              {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving...</> : <><Save className="w-3.5 h-3.5 mr-1.5" />Save Draft</>}
            </Button>
            <Button type="button" size="sm" onClick={async () => {
              const valid = await form.trigger()
              if (!valid) return
              await onSubmit(form.getValues(), true)
            }} disabled={!flowName.trim() || saving || publishing} className="h-8 bg-emerald-600 hover:bg-emerald-700 cursor-pointer">
              {publishing ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Publishing...</> : <><Upload className="w-3.5 h-3.5 mr-1.5" />Save & Publish</>}
            </Button>
          </div>
        </div>

        {/* Published flow banner */}
        {isPublished && (
          <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/30 border-b text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2 shrink-0">
            <Lock className="w-3 h-3 shrink-0" />
            This flow is published. Saving a draft will create a draft version — the published version stays active until you publish again.
          </div>
        )}

        {/* Validation / save error */}
        {(firstError || saveError) && (
          <div className="px-5 py-2 bg-destructive/5 border-b text-[11px] text-destructive flex items-center gap-2 shrink-0">
            <X className="w-3 h-3 shrink-0" />
            {saveError || firstError}
          </div>
        )}

        {/* ─── Body ─── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ─── Left: Pages + Components ─── */}
          <div className="w-[260px] border-r flex flex-col overflow-hidden shrink-0">
            {/* Pages */}
            <div className="p-3 border-b">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pages</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs cursor-pointer" onClick={addScreen} disabled={screens.length >= 8}>
                  <Plus className="w-3 h-3 mr-1" />{screens.length}/8
                </Button>
              </div>
              <div className="space-y-1">
                {screens.map((s, i) => (
                  <div
                    key={screenFields[i]?.id ?? s.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                      i === activeScreenIdx ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "hover:bg-muted"
                    )}
                    onClick={() => { setActiveScreenIdx(i); setSelectedCompIdx(null) }}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded text-[9px] font-medium flex items-center justify-center shrink-0",
                      i === activeScreenIdx ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                    )}>{i + 1}</span>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-[9px] text-muted-foreground">{s.layout.children.length}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                      {i > 0 && (
                        <span className="cursor-pointer hover:opacity-70" onClick={(e) => { e.stopPropagation(); moveScreen(i, i - 1); setActiveScreenIdx(i - 1) }} title="Move up">
                          <ChevronUp className="w-3 h-3" />
                        </span>
                      )}
                      {i < screens.length - 1 && (
                        <span className="cursor-pointer hover:opacity-70" onClick={(e) => { e.stopPropagation(); moveScreen(i, i + 1); setActiveScreenIdx(i + 1) }} title="Move down">
                          <ChevronDown className="w-3 h-3" />
                        </span>
                      )}
                      {screens.length < CONSTRAINTS.flow.maxScreens && (
                        <span className="cursor-pointer hover:opacity-70" onClick={(e) => { e.stopPropagation(); duplicateScreen(i) }} title="Duplicate page">
                          <Copy className="w-3 h-3" />
                        </span>
                      )}
                      {screens.length > 1 && (
                        <span className="cursor-pointer text-destructive hover:opacity-70" onClick={(e) => { e.stopPropagation(); removeScreen(i) }} title="Delete page">
                          <Trash2 className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Component palette */}
            <div className="flex-1 overflow-y-auto p-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Add Fields</span>
              {Object.entries(groupedCatalog).map(([cat, items]) => (
                <div key={cat} className="mb-3">
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{CATEGORY_LABELS[cat] || cat}</span>
                  <div className="mt-1 space-y-0.5">
                    {items.map((item) => (
                      <div
                        key={item.type}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs",
                          item.comingSoon ? "opacity-40" : ""
                        )}
                      >
                        <item.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1">{item.friendly}</span>
                        {item.comingSoon ? (
                          <Badge className="text-[7px] px-1 py-0 h-3 bg-amber-500/20 text-amber-600 border-0">Soon</Badge>
                        ) : (
                          <button
                            className="h-5 w-5 rounded flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-600 cursor-pointer shrink-0"
                            onClick={() => addComponent(item.type)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Center: Phone Preview ─── */}
          <div className="flex-1 bg-muted/30 flex items-start justify-center overflow-y-auto py-6" onClick={(e) => { if (e.target === e.currentTarget) setSelectedCompIdx(null) }}>
            <div className="w-[300px] shrink-0">
              {/* Phone frame */}
              <div className="bg-gray-900 rounded-[2rem] p-2 shadow-2xl">
                {/* Status bar */}
                <div className="bg-gray-900 rounded-t-[1.5rem] px-6 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">9:41</span>
                  <div className="w-20 h-5 bg-gray-800 rounded-full" />
                  <span className="text-[10px] text-gray-400">100%</span>
                </div>

                {/* WhatsApp header */}
                <div className="bg-emerald-700 px-4 py-2.5 flex items-center gap-2">
                  <div className="text-white text-xs font-medium flex-1 truncate">{activeScreen?.title || "Form"}</div>
                  <X className="w-4 h-4 text-white/70" />
                </div>

                {/* Form content */}
                <div ref={phoneContentRef} className="bg-white dark:bg-gray-950 h-[480px] overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setSelectedCompIdx(null) }}>
                  {!activeScreen || activeScreen.layout.children.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <Plus className="w-5 h-5 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Add fields from the left panel</p>
                      <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">Click any field type to add it here</p>
                    </div>
                  ) : (
                    <div className="py-2" onClick={(e) => { if (e.target === e.currentTarget) setSelectedCompIdx(null) }}>
                      {activeScreen.layout.children.map((comp, i) => (
                        <div key={comp.id}>
                          <PhoneComponentPreview
                            comp={comp}
                            selected={selectedCompIdx === i}
                            onSelect={() => setSelectedCompIdx(selectedCompIdx === i ? null : i)}
                          />
                          {selectedCompIdx === i && (
                            <InlineEditor
                              comp={comp}
                              onChange={(key, value) => updateComponent(i, key, value)}
                              onDelete={() => removeComponent(i)}
                              onMoveUp={() => moveComponent(i, "up")}
                              onMoveDown={() => moveComponent(i, "down")}
                              onDone={() => setSelectedCompIdx(null)}
                              canMoveUp={i > 0}
                              canMoveDown={i < activeScreen.layout.children.length - 1}
                              screens={screens as FlowScreen[]}
                              currentScreenId={activeScreen.id}
                              compPath={`screens.${activeScreenIdx}.layout.children.${i}`}
                              control={form.control}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom bar */}
                <div className="bg-gray-800 rounded-b-[1.5rem] px-6 py-3 flex justify-center">
                  <div className="w-28 h-1 bg-gray-600 rounded-full" />
                </div>
              </div>

              {/* Screen dots */}
              {screens.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-4">
                  {screens.map((_, i) => (
                    <button
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full transition-colors cursor-pointer",
                        i === activeScreenIdx ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                      )}
                      onClick={() => { setActiveScreenIdx(i); setSelectedCompIdx(null) }}
                    />
                  ))}
                </div>
              )}

              {/* Screen title edit */}
              <div className="mt-3 flex flex-col items-center gap-1">
                <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Page {activeScreenIdx + 1} of {screens.length}</span>
                <div className="relative">
                  <Input
                    value={activeScreen?.title || ""}
                    onChange={(e) => {
                      form.setValue(`screens.${activeScreenIdx}.title`, e.target.value, { shouldDirty: true })
                    }}
                    className="h-7 text-xs text-center border-0 shadow-none focus-visible:ring-1 max-w-[200px] bg-transparent hover:bg-muted/50 rounded pr-6 cursor-text"
                    placeholder="Enter screen title"
                  />
                  <Pencil className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground/30 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* ─── Right: Response Fields Summary ─── */}
          <div className="w-[180px] border-l p-3 overflow-y-auto shrink-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">Response Fields</span>
            <p className="text-[10px] text-muted-foreground mb-3">
              These will be stored as session variables when the user submits.
            </p>
            {(() => {
              const fields = extractResponseFields(screens as FlowScreen[])
              if (fields.length === 0) return <p className="text-[10px] text-muted-foreground/50 italic">No input fields yet</p>
              return (
                <div className="space-y-1">
                  {fields.map((f) => (
                    <div key={f} className="flex items-center gap-1.5">
                      <code className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-mono">{`{{${f}}}`}</code>
                    </div>
                  ))}
                </div>
              )
            })()}

            <Separator className="my-4" />

            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Flow Info</span>
            <div className="space-y-1.5 text-[10px] text-muted-foreground">
              <div className="flex justify-between"><span>Pages</span><span className="font-medium">{screens.length}</span></div>
              <div className="flex justify-between"><span>Fields</span><span className="font-medium">{extractResponseFields(screens as FlowScreen[]).length}</span></div>
              <div className="flex justify-between"><span>Version</span><span className="font-mono">6.3</span></div>
            </div>
          </div>
        </div>
      </Form>
      </DialogContent>
    </Dialog>

    {/* Discard unsaved changes confirmation */}
    <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes that will be lost if you close the builder.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Keep editing</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={() => { setShowDiscardDialog(false); onClose() }}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete page confirmation */}
    <AlertDialog open={showDeletePageDialog !== null} onOpenChange={(v) => { if (!v) setShowDeletePageDialog(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete page?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{showDeletePageDialog !== null ? screens[showDeletePageDialog]?.title : ""}&quot; and all its components will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer" onClick={confirmRemoveScreen}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
