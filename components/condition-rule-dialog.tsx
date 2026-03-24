"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Search,
  Tag,
  Variable,
  Globe,
  Zap,
  Check,
  ChevronDown,
  MessageSquare,
  MousePointerClick,
  List,
  Braces,
} from "lucide-react"

interface ConditionField {
  value: string
  label: string
  group: "variable" | "tag" | "system"
  source?: string // e.g., "Ask Name", "API Response", "Action"
  sourceType?: string // node type for icon
}

interface ConditionRuleDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (rule: any) => void
  existingRule?: any
  connectedNodeType?: string
  availableFields: Array<{ value: string; label: string; source?: string; sourceType?: string }>
  getOperators: (field: string) => Array<{ value: string; label: string }>
  availableTags?: string[]
}

const SOURCE_CONFIG: Record<string, { icon: any; bg: string; text: string }> = {
  whatsappQuestion: { icon: MessageSquare, bg: "bg-indigo-500/10", text: "text-indigo-500" },
  question: { icon: MessageSquare, bg: "bg-indigo-500/10", text: "text-indigo-500" },
  whatsappQuickReply: { icon: MousePointerClick, bg: "bg-purple-500/10", text: "text-purple-500" },
  quickReply: { icon: MousePointerClick, bg: "bg-purple-500/10", text: "text-purple-500" },
  whatsappInteractiveList: { icon: List, bg: "bg-purple-500/10", text: "text-purple-500" },
  interactiveList: { icon: List, bg: "bg-purple-500/10", text: "text-purple-500" },
  apiFetch: { icon: Globe, bg: "bg-blue-500/10", text: "text-blue-500" },
  action: { icon: Braces, bg: "bg-amber-500/10", text: "text-amber-500" },
}

const DEFAULT_SOURCE = { icon: Variable, bg: "bg-indigo-500/10", text: "text-indigo-500" }

function getSourceConfig(sourceType?: string) {
  if (!sourceType) return DEFAULT_SOURCE
  return SOURCE_CONFIG[sourceType] || DEFAULT_SOURCE
}

function TagValueSelect({ value, onChange, availableTags }: { value: string; onChange: (v: string) => void; availableTags: string[] }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const filtered = search
    ? availableTags.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : availableTags

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between h-9 px-3 border rounded-md text-sm bg-background hover:bg-accent/50 transition-colors cursor-pointer"
      >
        {value ? (
          <span className="flex items-center gap-1.5 font-mono text-xs">
            <Tag className="w-3 h-3 text-teal-500" />
            {value}
          </span>
        ) : (
          <span className="text-muted-foreground">Select a tag...</span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full border rounded-lg bg-popover shadow-md overflow-hidden">
          <div className="relative border-b">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tags..."
              className="w-full h-8 pl-8 pr-3 text-xs bg-transparent border-0 outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-[160px] overflow-y-auto p-1">
            {filtered.map((tag) => (
              <button
                key={tag}
                onClick={() => { onChange(tag); setOpen(false); setSearch("") }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs font-mono transition-colors cursor-pointer",
                  value === tag ? "bg-teal-500/10 text-teal-600 dark:text-teal-400" : "hover:bg-accent"
                )}
              >
                <Tag className="w-3 h-3 text-teal-500 shrink-0" />
                <span className="flex-1 truncate">{tag}</span>
                {value === tag && <Check className="w-3 h-3 text-teal-500 shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && search && (
              <button
                onClick={() => { onChange(search); setOpen(false); setSearch("") }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer hover:bg-accent"
              >
                <Tag className="w-3 h-3 text-teal-500 shrink-0" />
                <span className="text-muted-foreground">Use "</span>
                <span className="font-mono font-medium">{search}</span>
                <span className="text-muted-foreground">"</span>
              </button>
            )}
            {availableTags.length === 0 && !search && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                No tags in this flow. Type to use a custom tag.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ConditionRuleDialog({
  isOpen,
  onClose,
  onSave,
  existingRule,
  availableFields,
  getOperators,
  availableTags = [],
}: ConditionRuleDialogProps) {
  const [field, setField] = useState(existingRule?.field || "")
  const [fieldLabel, setFieldLabel] = useState(existingRule?.fieldLabel || "")
  const [operator, setOperator] = useState(existingRule?.operator || "equals")
  const [operatorLabel, setOperatorLabel] = useState(existingRule?.operatorLabel || "equals")
  const [value, setValue] = useState(existingRule?.value || "")
  const [fieldSearch, setFieldSearch] = useState("")
  const [showFieldPicker, setShowFieldPicker] = useState(false)
  const [fieldTab, setFieldTab] = useState<"all" | "variables" | "tags">("all")

  useEffect(() => {
    if (existingRule) {
      setField(existingRule.field || "")
      setFieldLabel(existingRule.fieldLabel || "")
      setOperator(existingRule.operator || "equals")
      setOperatorLabel(existingRule.operatorLabel || "equals")
      setValue(existingRule.value || "")
    } else {
      setField("")
      setFieldLabel("")
      setOperator("equals")
      setOperatorLabel("equals")
      setValue("")
    }
    setFieldSearch("")
    setShowFieldPicker(!existingRule)
  }, [existingRule, isOpen])

  const operators = field ? getOperators(field) : []
  const needsValue = !["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(operator)
  const isTagField = field === "_tags"

  // Group fields into categories
  const groupedFields = useMemo(() => {
    const variables: typeof availableFields = []
    const tags: typeof availableFields = []

    for (const f of availableFields) {
      if (f.value === "_tags") {
        tags.push(f)
      } else {
        variables.push(f)
      }
    }

    // Filter by search
    const q = fieldSearch.toLowerCase()
    return {
      variables: q ? variables.filter(f => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)) : variables,
      tags: q ? tags.filter(f => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)) : tags,
    }
  }, [availableFields, fieldSearch])

  const handleSave = () => {
    const rule = {
      id: existingRule?.id || `rule-${Date.now()}`,
      branch: existingRule?.branch || "true",
      field,
      fieldLabel: fieldLabel || availableFields.find((f) => f.value === field)?.label || field,
      operator,
      operatorLabel: operators.find((op) => op.value === operator)?.label || operator,
      value: needsValue ? value : "",
    }
    onSave(rule)
    onClose()
  }

  const handleFieldSelect = (f: (typeof availableFields)[0]) => {
    setField(f.value)
    setFieldLabel(f.label)
    setShowFieldPicker(false)
    setFieldSearch("")
    // Reset operator to first available for this field
    const ops = getOperators(f.value)
    if (ops.length > 0) {
      setOperator(ops[0].value)
      setOperatorLabel(ops[0].label)
    }
    setValue("")
  }

  const selectedFieldObj = availableFields.find((f) => f.value === field)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[460px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">
            {existingRule ? "Edit Condition" : "Add Condition"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {!field
              ? "Choose what to check"
              : isTagField
                ? "Check if contact has a specific tag"
                : `Check the value of "${fieldLabel}"`}
          </p>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-4">
          {/* Step 1: Field Selection */}
          {showFieldPicker ? (
            <div className="border rounded-lg overflow-hidden bg-muted/30">
              {/* Filter tabs */}
              <div className="flex border-b">
                {([
                  { key: "all" as const, label: "All", icon: Search },
                  { key: "variables" as const, label: "Variables", icon: Variable },
                  { key: "tags" as const, label: "Tags", icon: Tag },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFieldTab(tab.key)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer border-b-2",
                      fieldTab === tab.key
                        ? tab.key === "tags"
                          ? "border-teal-500 text-teal-600 dark:text-teal-400"
                          : tab.key === "variables"
                            ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                            : "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative border-b">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder={fieldTab === "tags" ? "Search tags..." : fieldTab === "variables" ? "Search variables..." : "Search..."}
                  className="w-full h-9 pl-9 pr-3 text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>

              <div className="max-h-[240px] overflow-y-auto p-1">
                {/* Variables */}
                {(fieldTab === "all" || fieldTab === "variables") && groupedFields.variables.length > 0 && (
                  <div>
                    {fieldTab === "all" && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5">
                        <Variable className="w-3 h-3 text-indigo-500" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Variables</span>
                      </div>
                    )}
                    {groupedFields.variables.map((f) => {
                      const config = getSourceConfig(f.sourceType)
                      const Icon = config.icon
                      return (
                        <button
                          key={f.value}
                          onClick={() => handleFieldSelect(f)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors cursor-pointer",
                            field === f.value
                              ? `${config.bg} ${config.text}`
                              : "hover:bg-accent"
                          )}
                        >
                          <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", config.bg)}>
                            <Icon className={cn("w-3 h-3", config.text)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{f.label}</div>
                            {f.source && (
                              <div className="text-[10px] text-muted-foreground truncate">from {f.source}</div>
                            )}
                          </div>
                          <code className="text-[10px] text-muted-foreground/60 font-mono shrink-0">{f.value}</code>
                          {field === f.value && <Check className={cn("w-3.5 h-3.5 shrink-0", config.text)} />}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Tags */}
                {(fieldTab === "all" || fieldTab === "tags") && groupedFields.tags.length > 0 && (
                  <div className={fieldTab === "all" && groupedFields.variables.length > 0 ? "mt-1 pt-1 border-t" : ""}>
                    {fieldTab === "all" && (
                      <div className="flex items-center gap-1.5 px-2 py-1.5">
                        <Tag className="w-3 h-3 text-teal-500" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</span>
                      </div>
                    )}
                    {groupedFields.tags.map((f) => (
                      <button
                        key={f.value}
                        onClick={() => handleFieldSelect(f)}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors cursor-pointer",
                          field === f.value
                            ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                            : "hover:bg-accent"
                        )}
                      >
                        <div className="w-5 h-5 rounded bg-teal-500/10 flex items-center justify-center shrink-0">
                          <Tag className="w-3 h-3 text-teal-500" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">Contact Tags</div>
                          <div className="text-[10px] text-muted-foreground">Check if contact has a specific tag</div>
                        </div>
                        {field === f.value && <Check className="w-3.5 h-3.5 text-teal-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {((fieldTab === "all" && groupedFields.variables.length === 0 && groupedFields.tags.length === 0) ||
                  (fieldTab === "variables" && groupedFields.variables.length === 0) ||
                  (fieldTab === "tags" && groupedFields.tags.length === 0)) && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {fieldSearch ? `No results for "${fieldSearch}"` : "No fields available"}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Selected field display */
            <button
              onClick={() => setShowFieldPicker(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 border rounded-lg hover:bg-accent/50 transition-colors text-left cursor-pointer group"
            >
              {(() => {
                const config = isTagField
                  ? { icon: Tag, bg: "bg-teal-500/10", text: "text-teal-500" }
                  : getSourceConfig(selectedFieldObj?.sourceType)
                const Icon = config.icon
                return (
                  <div className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", config.bg)}>
                    <Icon className={cn("w-3.5 h-3.5", config.text)} />
                  </div>
                )
              })()}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{fieldLabel || "Select field..."}</div>
                {selectedFieldObj?.source && (
                  <div className="text-[10px] text-muted-foreground">from {selectedFieldObj.source}</div>
                )}
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </button>
          )}

          {/* Step 2: Operator + Value (inline sentence) */}
          {field && !showFieldPicker && (
            <div className="space-y-3">
              {/* Operator as pills */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Condition</span>
                <div className="flex flex-wrap gap-1.5">
                  {operators.map((op) => (
                    <button
                      key={op.value}
                      onClick={() => {
                        setOperator(op.value)
                        setOperatorLabel(op.label)
                        if (["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(op.value)) {
                          setValue("")
                        }
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border",
                        operator === op.value
                          ? isTagField
                            ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"
                            : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
                          : "bg-transparent text-muted-foreground border-border hover:border-foreground/20 hover:text-foreground"
                      )}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Value input */}
              {needsValue && (
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    {isTagField ? "Tag" : "Value"}
                  </span>
                  {isTagField ? (
                    <TagValueSelect
                      value={value}
                      onChange={setValue}
                      availableTags={availableTags}
                    />
                  ) : (
                    <Input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="Enter value..."
                      className="h-9"
                      autoFocus
                    />
                  )}
                </div>
              )}

              {/* Preview sentence */}
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
                <span>If </span>
                <Badge variant="secondary" className="text-[10px] font-mono mx-0.5">
                  {isTagField ? "tags" : fieldLabel || field}
                </Badge>
                <span className="mx-0.5 font-medium text-foreground">{operatorLabel}</span>
                {needsValue && value && (
                  <>
                    <span> </span>
                    <Badge variant="outline" className="text-[10px] font-mono mx-0.5">{value}</Badge>
                  </>
                )}
                {!needsValue && <span className="text-foreground/60"> (no value needed)</span>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!field || (needsValue && !value)}
            className="cursor-pointer"
          >
            {existingRule ? "Update" : "Add"} Condition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
