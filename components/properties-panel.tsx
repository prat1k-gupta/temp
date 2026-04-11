"use client"

import type { Node } from "@xyflow/react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { VariablePickerTextarea } from "@/components/variable-picker-textarea"
import { VariableHighlightText } from "@/components/variable-highlight-text"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Trash2,
  Plus,
  Settings,
  MessageCircle,
  MessageSquare,
  List,
  MessageSquareText,
  Play,
  GripVertical,
  Calendar,
  MapPin,
  Sparkles,
  CheckCircle2,
  GitBranch,
  Package,
  PackageSearch,
  Store,
  Truck,
  Users,
  Globe,
  PhoneForwarded,
  FileText,
  Loader2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Copy,
  Pencil,
  Search,
  ChevronDown,
  Smartphone,
  Send,
  CheckCircle,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConditionRuleDialog } from "@/components/condition-rule-dialog"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { useEffect, useMemo, useRef, useState } from "react"
import { CSS } from "@dnd-kit/utilities"
import { createButtonData, createOptionData } from "@/utils"
import { collectFlowVariables, collectFlowVariablesRich } from "@/utils/flow-variables"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { getNodeLimits } from "@/constants/node-limits/config"
import { getImplicitInputType, VALIDATION_PRESETS } from "@/utils/validation-presets"
import { useGlobalVariables, useTemplates, useAccounts } from "@/hooks/queries"
import { apiClient } from "@/lib/api-client"

interface PropertiesPanelProps {
  selectedNode: Node & {
    data : {
      buttons?: any,
      options?: any,
      label?: string,
      question?: string,
      comment?: string,
      text?: string,
      platform?: string,
      [key: string]: any,
    }
  } | null
  platform: "web" | "whatsapp" | "instagram"
  onNodeUpdate: (nodeId: string, data: any) => void
  onAddButton?: (nodeId: string) => void
  onRemoveButton?: (nodeId: string, buttonIndex: number) => void
  allNodes?: Node[] // All nodes in the flow for variable mapping
  onOpenFlowBuilder?: (nodeId: string, mode: "create" | "edit") => void
  publishedFlowId?: string
  onSnapshot?: () => void
  onResumeTracking?: () => void
}

// Limits are resolved dynamically from getNodeLimits() per-node, not hardcoded.

const NODE_ICONS = {
  start: Play,
  question: MessageCircle,
  quickReply: MessageSquare,
  interactiveList: List,
  comment: MessageSquareText,
  // Platform-specific nodes
  webQuestion: MessageCircle,
  webQuickReply: MessageSquare,
  whatsappQuestion: MessageCircle,
  whatsappQuickReply: MessageSquare,
  whatsappInteractiveList: List,
  whatsappMessage: MessageCircle,
  instagramQuestion: MessageCircle,
  instagramQuickReply: MessageSquare,
  instagramDM: MessageCircle,
  instagramStory: MessageCircle,
  // Logic nodes
  condition: GitBranch,
  // Fulfillment nodes
  homeDelivery: Package,
  trackingNotification: PackageSearch,
  event: Calendar,
  retailStore: Store,
  // Action nodes
  apiFetch: Globe,
  transfer: PhoneForwarded,
  templateMessage: FileText,
}

const NODE_COLORS = {
  start: "bg-chart-2 text-white",
  question: "bg-primary text-primary-foreground",
  quickReply: "bg-chart-1 text-white",
  interactiveList: "bg-chart-4 text-white",
  comment: "bg-yellow-400 text-yellow-900",
  // Platform-specific nodes
  webQuestion: "bg-blue-500 text-white",
  webQuickReply: "bg-blue-600 text-white",
  whatsappQuestion: "bg-green-500 text-white",
  whatsappQuickReply: "bg-green-600 text-white",
  whatsappInteractiveList: "bg-green-700 text-white",
  whatsappMessage: "bg-green-400 text-white",
  instagramQuestion: "bg-pink-500 text-white",
  instagramQuickReply: "bg-pink-600 text-white",
  instagramDM: "bg-pink-400 text-white",
  instagramStory: "bg-pink-500 text-white",
  // Logic nodes
  condition: "bg-primary text-primary-foreground",
  // Fulfillment nodes
  homeDelivery: "bg-primary text-primary-foreground",
  trackingNotification: "bg-primary text-primary-foreground",
  event: "bg-primary text-primary-foreground",
  retailStore: "bg-primary text-primary-foreground",
  // Action nodes
  apiFetch: "bg-[#1a365d] text-white",
  transfer: "bg-[#7c2d12] text-white",
  templateMessage: "bg-[#075e54] text-white",
}

function SortableButtonItem({
  button,
  index,
  itemId,
  onUpdate,
  onRemove,
  isOverLimit,
  limits,
  onSnapshot,
  onResumeTracking,
}: {
  button: any
  index: number
  itemId: string
  onUpdate: (index: number, text: string) => void
  onRemove: (index: number) => void
  isOverLimit: (text: string, type: "question" | "button") => boolean
  limits: any
  onSnapshot?: () => void
  onResumeTracking?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/10 rounded"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <Input
          value={button.text || ""}
          onChange={(e) => onUpdate(index, e.target.value)}
          onFocus={() => onSnapshot?.()}
          onBlur={() => onResumeTracking?.()}
          placeholder={`Button ${index + 1}`}
          className={`flex-1 ${isOverLimit(button.text || "", "button") ? "border-destructive" : ""}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex justify-between items-center ml-6">
        <span
          className={`text-xs ${
            isOverLimit(button.text || "", "button") ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {(button.text || "").length}/{limits.button} characters
        </span>
        {isOverLimit(button.text || "", "button") && (
          <Badge variant="destructive" className="text-xs">
            Too long
          </Badge>
        )}
      </div>
    </div>
  )
}

function SortableOptionItem({
  option,
  index,
  itemId,
  onUpdate,
  onRemove,
  isOverLimit,
  limits,
  onSnapshot,
  onResumeTracking,
}: {
  option: any
  index: number
  itemId: string
  onUpdate: (index: number, text: string) => void
  onRemove: (index: number) => void
  isOverLimit: (text: string, type: "question" | "button") => boolean
  limits: any
  onSnapshot?: () => void
  onResumeTracking?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/10 rounded"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">
          {index + 1}
        </div>
        <Input
          value={option.text || ""}
          onChange={(e) => onUpdate(index, e.target.value)}
          onFocus={() => onSnapshot?.()}
          onBlur={() => onResumeTracking?.()}
          placeholder={`Option ${index + 1}`}
          className={`flex-1 ${isOverLimit(option.text || "", "button") ? "border-destructive" : ""}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex justify-between items-center ml-12">
        <span
          className={`text-xs ${
            isOverLimit(option.text || "", "button") ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {(option.text || "").length}/{limits.button} characters
        </span>
        {isOverLimit(option.text || "", "button") && (
          <Badge variant="destructive" className="text-xs">
            Too long
          </Badge>
        )}
      </div>
    </div>
  )
}

// --- WhatsApp Flow Picker (searchable dropdown) ---

function WhatsAppFlowPicker({ flows, value, onChange }: {
  flows: any[]
  value: string
  onChange: (metaFlowId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedFlow = flows.find((f: any) => f.meta_flow_id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-full flex items-center justify-between h-9 px-3 border rounded-md text-sm bg-background hover:bg-muted/50 transition-colors cursor-pointer">
          {selectedFlow ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="truncate">{selectedFlow.name}</span>
              <span className={`text-[9px] px-1 py-0 rounded ${selectedFlow.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                {selectedFlow.status}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Select a flow...</span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandInput placeholder="Search flows..." className="h-8 text-xs" />
          <CommandList className="max-h-[200px]">
            <CommandEmpty className="py-3 text-center text-xs">No flows found</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(""); setOpen(false) }} className="text-xs text-muted-foreground cursor-pointer">
                None
              </CommandItem>
              {flows.map((flow: any) => (
                <CommandItem
                  key={flow.id}
                  value={flow.name}
                  onSelect={() => { onChange(flow.meta_flow_id); setOpen(false) }}
                  className={`text-xs cursor-pointer ${value === flow.meta_flow_id ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : ""}`}
                >
                  <span className="flex-1 truncate">{flow.name}</span>
                  <span className={`text-[8px] px-1 py-0 rounded shrink-0 ${flow.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                    {flow.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// --- Response Mapping Editor (array-based to avoid key collision bugs) ---

function ResponseMappingEditor({
  mapping,
  onChange,
}: {
  mapping: Record<string, string>
  onChange: (mapping: Record<string, string>) => void
}) {
  // Convert object to array for stable editing (no key collisions)
  const [rows, setRows] = useState<Array<{ varName: string; jsonPath: string }>>(() =>
    Object.entries(mapping).map(([varName, jsonPath]) => ({ varName, jsonPath: String(jsonPath) }))
  )

  // Sync rows when mapping changes externally (e.g. node selection change)
  const mappingKey = JSON.stringify(mapping)
  useEffect(() => {
    setRows(Object.entries(mapping).map(([varName, jsonPath]) => ({ varName, jsonPath: String(jsonPath) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingKey])

  const commitRows = (updated: typeof rows) => {
    setRows(updated)
    const obj: Record<string, string> = {}
    for (const row of updated) {
      if (row.varName || row.jsonPath) obj[row.varName] = row.jsonPath
    }
    onChange(obj)
  }

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={row.varName}
            onChange={(e) => {
              const updated = [...rows]
              updated[idx] = { ...updated[idx], varName: e.target.value }
              commitRows(updated)
            }}
            placeholder="variable_name"
            className="flex-1 text-xs font-mono"
          />
          <span className="text-xs text-muted-foreground">&larr;</span>
          <Input
            value={row.jsonPath}
            onChange={(e) => {
              const updated = [...rows]
              updated[idx] = { ...updated[idx], jsonPath: e.target.value }
              commitRows(updated)
            }}
            placeholder="data.field"
            className="flex-1 text-xs font-mono"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => commitRows(rows.filter((_, i) => i !== idx))}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => commitRows([...rows, { varName: "", jsonPath: "" }])}
        className="w-full cursor-pointer"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Mapping
      </Button>
    </div>
  )
}

// --- API Test Section (extracted for clarity) ---

function ApiTestSection({
  url,
  method,
  headers,
  body,
  responseMapping,
}: {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  responseMapping: Record<string, string>
}) {
  const [testVars, setTestVars] = useState<Record<string, string>>({})
  const { data: fetchedGlobals = {} } = useGlobalVariables()
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{
    status?: number
    statusText?: string
    duration?: number
    body?: any
    processedUrl?: string
    error?: string
  } | null>(null)
  const [mappedValues, setMappedValues] = useState<Record<string, any> | null>(null)

  // Extract {{variable}} placeholders from url, body, headers (supports dot notation)
  const templateVars = useMemo(() => {
    const vars = new Set<string>()
    const regex = /\{\{([^}]+)\}\}/g
    let match: RegExpExecArray | null

    for (const str of [url, body, ...Object.values(headers)]) {
      regex.lastIndex = 0
      while ((match = regex.exec(str)) !== null) {
        vars.add(match[1].trim())
      }
    }
    return Array.from(vars)
  }, [url, body, headers])

  // Auto-populate system and global variables
  useEffect(() => {
    const autoVars: Record<string, string> = {}
    for (const v of templateVars) {
      if (testVars[v]) continue // don't overwrite user input
      if (v === "system.phone_number") {
        autoVars[v] = "919773722464"
      } else if (v === "system.contact_name") {
        autoVars[v] = "Test User"
      } else if (v.startsWith("global.")) {
        const key = v.slice(7)
        if (fetchedGlobals[key]) {
          autoVars[v] = String(fetchedGlobals[key])
        }
      }
    }
    if (Object.keys(autoVars).length > 0) {
      setTestVars((prev) => ({ ...autoVars, ...prev }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateVars.join(","), fetchedGlobals])

  const runTest = async () => {
    if (!url) return
    setIsLoading(true)
    setResult(null)
    setMappedValues(null)

    try {
      const res = await fetch("/api/test-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          method,
          headers,
          body,
          testVariables: testVars,
        }),
      })
      const data = await res.json()

      if (data.error) {
        setResult({ error: data.error })
      } else {
        setResult(data)

        // Extract mapped values if response is JSON and mappings exist
        if (
          data.body &&
          typeof data.body === "object" &&
          Object.keys(responseMapping).length > 0
        ) {
          const extractRes = await fetch("/api/test-api", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              responseBody: data.body,
              responseMapping,
            }),
          })
          const extractData = await extractRes.json()
          if (extractData.extracted) {
            setMappedValues(extractData.extracted)
          }
        }
      }
    } catch (err: any) {
      setResult({ error: err.message || "Request failed" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <Label className="text-sm font-medium mb-2 block">Test API</Label>

      {/* Test variable inputs */}
      {templateVars.length > 0 && (
        <div className="space-y-2 mb-3">
          <p className="text-xs text-muted-foreground">Provide test values for variables:</p>
          <p className="text-[10px] text-muted-foreground/70">
            Tip: Use <code className="bg-muted px-1 rounded">{'"{{var}}"'}</code> in body for strings, <code className="bg-muted px-1 rounded">{'{{var}}'}</code> without quotes for numbers/booleans.
          </p>
          {templateVars.map((varName) => {
            const isSystem = varName.startsWith("system.")
            const isGlobal = varName.startsWith("global.")
            const pillColor = isSystem
              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
              : isGlobal
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
            return (
            <div key={varName} className="flex items-center gap-2">
              <code className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${pillColor}`}>
                {varName}
              </code>
              <Input
                value={testVars[varName] || ""}
                onChange={(e) => setTestVars((prev) => ({ ...prev, [varName]: e.target.value }))}
                placeholder={isSystem || isGlobal ? `auto: ${testVars[varName] || ""}` : `test value for ${varName}`}
                className="flex-1 text-xs h-7"
              />
            </div>
            )
          })}
        </div>
      )}

      {/* Send button */}
      <Button
        variant="outline"
        size="sm"
        onClick={runTest}
        disabled={isLoading || !url}
        className="w-full cursor-pointer"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Play className="w-4 h-4 mr-2" />
        )}
        {isLoading ? "Sending..." : "Send Request"}
      </Button>

      {/* Results */}
      {result && (
        <div className="mt-3 space-y-2">
          {result.error ? (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{result.error}</span>
            </div>
          ) : (
            <>
              {/* Status line */}
              <div className="flex items-center gap-2 text-xs">
                <Badge
                  variant={result.status && result.status < 400 ? "default" : "destructive"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {result.status} {result.statusText}
                </Badge>
                <span className="text-muted-foreground">{result.duration}ms</span>
              </div>

              {/* Processed URL */}
              {result.processedUrl && result.processedUrl !== url && (
                <p className="text-[10px] text-muted-foreground font-mono truncate" title={result.processedUrl}>
                  {result.processedUrl}
                </p>
              )}

              {/* Response body */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Response:</p>
                <pre className="text-[10px] font-mono bg-muted p-2 rounded-md overflow-auto max-h-[200px] whitespace-pre-wrap break-all">
                  {typeof result.body === "object"
                    ? JSON.stringify(result.body, null, 2)
                    : String(result.body)}
                </pre>
              </div>

              {/* Mapped values */}
              {mappedValues && Object.keys(mappedValues).length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    Mapped Variables:
                  </p>
                  <div className="space-y-1">
                    {Object.entries(mappedValues).map(([varName, value]) => (
                      <div key={varName} className="flex items-center gap-2 text-[10px]">
                        <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{varName}</code>
                        <span className="text-muted-foreground">=</span>
                        <span className="font-mono text-green-600 dark:text-green-400 truncate" title={String(value)}>
                          {value === undefined || value === null ? (
                            <span className="text-destructive italic">not found</span>
                          ) : (
                            String(value)
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function StartNodePanel({ selectedNode, platform, allNodes = [], publishedFlowIdOverride }: { selectedNode: any; platform: string; allNodes?: Node[]; publishedFlowIdOverride?: string }) {
  const publishedFlowId = publishedFlowIdOverride || selectedNode.data?.publishedFlowId
  const waAccountId = selectedNode.data?.waAccountId
  const { data: accounts = [] } = useAccounts()

  const [phoneNumber, setPhoneNumber] = useState("")
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [isSending, setIsSending] = useState(false)
  const [isEndingSession, setIsEndingSession] = useState(false)
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string; hasActiveSession?: boolean } | null>(null)

  // Find template message nodes and extract their named parameters
  const templateParams = useMemo(() => {
    const params: string[] = []
    for (const node of allNodes) {
      if (node.type === "templateMessage") {
        const mappings = (node.data as any)?.parameterMappings || []
        for (const m of mappings) {
          if (m.templateVar && !params.includes(m.templateVar)) {
            params.push(m.templateVar)
          }
        }
      }
    }
    return params
  }, [allNodes])

  const hasTemplateNode = templateParams.length > 0

  // Resolve account name from ID
  const accountName = useMemo(() => {
    if (!waAccountId) return ""
    const account = accounts.find((a) => a.id === waAccountId || a.name === waAccountId)
    return account?.name || waAccountId
  }, [waAccountId, accounts])

  const handleEndSessionAndRetry = async () => {
    if (!phoneNumber.trim() || !publishedFlowId) return
    setIsEndingSession(true)
    try {
      // Find active sessions for this phone number
      const sessionsData = await apiClient.get<any>(`/api/chatbot/sessions?phone=${encodeURIComponent(phoneNumber.trim())}&status=active`)
      const sessions = sessionsData?.sessions || []
      if (sessions.length === 0) {
        setLastResult({ success: false, message: "No active session found" })
        setIsEndingSession(false)
        return
      }
      // Complete all active sessions
      for (const session of sessions) {
        await apiClient.put(`/api/chatbot/sessions/${session.id}`, { status: "completed" })
      }
      setIsEndingSession(false)
      // Retry send
      await handleSend()
    } catch (error: any) {
      setLastResult({ success: false, message: error?.message || "Failed to end session" })
      setIsEndingSession(false)
    }
  }

  const handleSend = async () => {
    if (!phoneNumber.trim() || !publishedFlowId) return
    setIsSending(true)
    setLastResult(null)
    try {
      const body: Record<string, any> = {
        phone_number: phoneNumber.trim(),
      }
      if (accountName) body.whatsapp_account = accountName
      const nonEmptyVars = Object.fromEntries(
        Object.entries(variables).filter(([, v]) => v.trim() !== "")
      )
      if (Object.keys(nonEmptyVars).length > 0) body.variables = nonEmptyVars

      await apiClient.post(`/api/chatbot/flows/${publishedFlowId}/send`, body)
      setLastResult({ success: true, message: "Flow sent to " + phoneNumber.trim() })
    } catch (error: any) {
      const msg = error?.message || "Failed to send flow"
      const hasActiveSession = msg.toLowerCase().includes("active session")
      setLastResult({ success: false, message: msg, hasActiveSession })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Test Flow Section */}
      {platform === "whatsapp" && publishedFlowId ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            <h4 className="font-medium text-sm">Test Flow</h4>
          </div>
          <div className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-primary/80 leading-relaxed">
              {hasTemplateNode
                ? "Sends the template message to the phone number. Works outside the 24hr conversation window."
                : "Contact must have messaged you in the last 24hrs, or add a template message node to your flow."}
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="test-phone" className="text-xs">Phone Number</Label>
              <Input
                id="test-phone"
                placeholder="+91 70421 10034"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">E.164 format with country code</p>
            </div>

            {hasTemplateNode && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Template Parameters</Label>
                {templateParams.map((param) => (
                  <div key={param} className="space-y-1">
                    <Label htmlFor={`var-${param}`} className="text-[11px] font-mono">{param}</Label>
                    <Input
                      id={`var-${param}`}
                      placeholder={param}
                      value={variables[param] || ""}
                      onChange={(e) => setVariables((prev) => ({ ...prev, [param]: e.target.value }))}
                      className="text-sm h-8"
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={!phoneNumber.trim() || isSending}
              className="w-full gap-2"
              size="sm"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {isSending ? "Sending..." : "Send Test"}
            </Button>

            {lastResult && (
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-md ${
                  lastResult.success
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {lastResult.success ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  {lastResult.message}
                </div>
                {lastResult.hasActiveSession && (
                  <Button
                    onClick={handleEndSessionAndRetry}
                    disabled={isEndingSession}
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-xs"
                  >
                    {isEndingSession ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {isEndingSession ? "Ending session..." : "End Session & Retry"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : !publishedFlowId ? (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">Publish your flow first to test it</p>
        </div>
      ) : null}
    </div>
  )
}

export function PropertiesPanel({
  selectedNode,
  platform,
  onNodeUpdate,
  onAddButton,
  onRemoveButton,
  allNodes = [],
  onOpenFlowBuilder,
  publishedFlowId: publishedFlowIdProp,
  onSnapshot,
  onResumeTracking,
}: PropertiesPanelProps) {
  console.log("[v0] Selected node:", selectedNode)
  console.log("[v0] Platform:", platform)

  // Compute flow variables from all nodes (selectedNode.data may not have injected flowVariablesRich)
  const flowVariablesRich = useMemo(
    () => collectFlowVariablesRich(allNodes),
    [allNodes]
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Condition rule dialog state
  const [isConditionDialogOpen, setIsConditionDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<any>(null)

  // Template picker
  const { data: availableTemplates = [], isLoading: templatesLoading } = useTemplates("APPROVED")

  if (!selectedNode) {
    return null
  }

  const nodeLimits = getNodeLimits(selectedNode.type || "", platform)
  const textMax = nodeLimits.text?.max ?? nodeLimits.question?.max ?? 500
  const buttonTextMax = nodeLimits.buttons?.textMaxLength ?? nodeLimits.options?.textMaxLength ?? 20
  const limits = { question: textMax, button: buttonTextMax }
  const isOverLimit = (text: string, type: "question" | "button") => {
    return text.length > limits[type]
  }

  const NodeIcon = NODE_ICONS[selectedNode.type as keyof typeof NODE_ICONS] || Settings
  const nodeColor = NODE_COLORS[selectedNode.type as keyof typeof NODE_COLORS] || "bg-muted text-muted-foreground"

  // Local state to avoid excessive parent rerenders during reorder/drag
  const idCounterRef = useRef(0)
  const makeId = () => {
    idCounterRef.current += 1
    return `${Date.now().toString(36)}-${idCounterRef.current.toString(36)}-${Math.random().toString(36).slice(2,6)}`
  }
  const withIds = (arr: any[], prefix: string) => arr.map((item) => ({ __id: item.__id || makeId(), ...item }))
  const stripIds = (arr: any[]) => arr.map(({ __id, ...rest }) => rest)

  const [localButtons, setLocalButtons] = useState<any[]>(withIds(selectedNode.data.buttons || [], "button"))
  const [localOptions, setLocalOptions] = useState<any[]>(withIds(selectedNode.data.options || [], "option"))

  // Sync when node changes
  useEffect(() => {
    setLocalButtons(withIds(selectedNode.data.buttons || [], "button"))
  }, [selectedNode.id, selectedNode.data.buttons])

  useEffect(() => {
    setLocalOptions(withIds(selectedNode.data.options || [], "option"))
  }, [selectedNode.id, selectedNode.data.options])

  const updateButton = (index: number, text: string) => {
    console.log("[v0] Updating button", index, "with text:", text)
    setLocalButtons((prev) => {
      const buttons = [...prev]
      buttons[index] = { ...(buttons[index] || {}), text }
      return buttons
    })
    // Commit immediately for text edits to persist
    const buttonsCommit = [...stripIds(localButtons)]
    buttonsCommit[index] = { ...(buttonsCommit[index] || {}), text }
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons: buttonsCommit })
  }

  const removeButton = (index: number) => {
    console.log("[v0] Removing button", index)
    if (onRemoveButton && selectedNode) {
      onRemoveButton(selectedNode.id, index)
    } else {
      setLocalButtons((prev) => prev.filter((_, i) => i !== index))
      const buttons = [...stripIds(localButtons)].filter((_, i) => i !== index)
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons })
    }
  }

  const addButton = () => {
    console.log("[v0] Adding new button")
    if (onAddButton && selectedNode) {
      onAddButton(selectedNode.id)
    } else {
      const next = createButtonData(`Button ${stripIds(localButtons).length + 1}`, stripIds(localButtons).length)
      setLocalButtons((prev) => [...prev, next])
      const buttons = [...stripIds(localButtons), next]
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons })
    }
  }

  const onButtonsDragOver = (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localButtons.findIndex((b) => `button-${b.__id}` === active.id)
    const newIndex = localButtons.findIndex((b) => `button-${b.__id}` === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setLocalButtons((prev) => arrayMove(prev, oldIndex, newIndex))
  }

  const reorderButtons = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = localButtons.findIndex((b) => `button-${b.__id}` === active.id)
      const newIndex = localButtons.findIndex((b) => `button-${b.__id}` === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reorderedButtons = arrayMove(localButtons, oldIndex, newIndex)
      console.log("[v0] Reordering buttons from", oldIndex, "to", newIndex)
      console.log("[v0] Final buttons order:", reorderedButtons.map((b: any, i: number) => ({ index: i, id: b.__id, text: b.text })))
      setLocalButtons(reorderedButtons)
      // Commit once at drag end
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons: stripIds(reorderedButtons) })
    }
  }

  const updateOption = (index: number, text: string) => {
    console.log("[v0] Updating option", index, "with text:", text)
    setLocalOptions((prev) => {
      const options = [...prev]
      options[index] = { ...(options[index] || {}), text }
      return options
    })
    const optionsCommit = [...stripIds(localOptions)]
    optionsCommit[index] = { ...(optionsCommit[index] || {}), text }
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, options: optionsCommit })
  }

  const removeOption = (index: number) => {
    console.log("[v0] Removing option", index)
    if (onRemoveButton && selectedNode) {
      onRemoveButton(selectedNode.id, index)
    } else {
      setLocalOptions((prev) => prev.filter((_, i) => i !== index))
      const options = [...stripIds(localOptions)].filter((_, i) => i !== index)
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, options })
    }
  }

  const addOption = () => {
    console.log("[v0] Adding new option")
    if (onAddButton && selectedNode) {
      onAddButton(selectedNode.id)
    } else {
      const next = createOptionData(`Option ${stripIds(localOptions).length + 1}`, stripIds(localOptions).length)
      setLocalOptions((prev) => [...prev, next])
      const options = [...stripIds(localOptions), next]
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, options })
    }
  }

  const onOptionsDragOver = (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localOptions.findIndex((o) => `option-${o.__id}` === active.id)
    const newIndex = localOptions.findIndex((o) => `option-${o.__id}` === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setLocalOptions((prev) => arrayMove(prev, oldIndex, newIndex))
  }

  const reorderOptions = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = localOptions.findIndex((o) => `option-${o.__id}` === active.id)
      const newIndex = localOptions.findIndex((o) => `option-${o.__id}` === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reorderedOptions = arrayMove(localOptions, oldIndex, newIndex)
      console.log("[v0] Reordering options from", oldIndex, "to", newIndex)
      console.log("[v0] Final options order:", reorderedOptions.map((o: any, i: number) => ({ index: i, id: o.__id, text: o.text })))
      setLocalOptions(reorderedOptions)
      // Commit once at drag end
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, options: stripIds(reorderedOptions) })
    }
  }

  const getNodeTitle = () => {
    switch (selectedNode.type) {
      case "start":
        return "Start Node"
      case "question":
        return "Question Node"
      case "quickReply":
        return "Quick Reply Node"
      case "interactiveList":
        return "Interactive List Node"
      case "comment":
        return "Comment Node"
      // Platform-specific nodes
      case "webQuestion":
        return "Web Question Node"
      case "webQuickReply":
        return "Web Quick Reply Node"
      case "whatsappQuestion":
        return "WhatsApp Question Node"
      case "whatsappQuickReply":
        return "WhatsApp Quick Reply Node"
      case "whatsappInteractiveList":
        return "WhatsApp List Node"
      case "whatsappMessage":
        return "WhatsApp Message Node"
      case "instagramQuestion":
        return "Instagram Question Node"
      case "instagramQuickReply":
        return "Instagram Quick Reply Node"
      case "instagramDM":
        return "Instagram DM Node"
      case "instagramStory":
        return "Instagram Story Node"
      case "condition":
        return "Condition Node"
      // Fulfillment nodes
      case "homeDelivery":
        return "At-home Delivery Node"
      case "trackingNotification":
        return "Tracking Notification Node"
      case "event":
        return "Event Node"
      case "retailStore":
        return "Retail Store Node"
      case "apiFetch":
        return "API Call Node"
      case "transfer":
        return "Transfer Node"
      case "templateMessage":
        return "Template Message Node"
      default:
        return "Node Properties"
    }
  }

  const isConditionNode = selectedNode.type === "condition"
  const isFulfillmentNode = ["homeDelivery", "trackingNotification", "event", "retailStore"].includes(selectedNode.type || "")
  const isApiFetchNode = selectedNode.type === "apiFetch"
  const isTransferNode = selectedNode.type === "transfer"
  const isTemplateMessageNode = selectedNode.type === "templateMessage"
  const isActionNode = selectedNode.type === "action"
  const isWhatsAppFlowNode = selectedNode.type === "whatsappFlow"

  // Extract form field names from a WhatsApp Flow's JSON definition
  const extractFlowResponseFields = (flowJson: any): string[] => {
    if (!flowJson?.screens) return []
    const fields: string[] = []
    const inputTypes = new Set(["TextInput", "TextArea", "DatePicker", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "CalendarPicker", "OptIn"])
    for (const screen of flowJson.screens) {
      for (const child of screen?.layout?.children || []) {
        if (inputTypes.has(child.type) && child.name) {
          fields.push(child.name)
        }
      }
    }
    return fields
  }

  // WhatsApp Flows — data injected into node.data at page level
  const availableWhatsAppFlows: any[] = selectedNode.data.availableWhatsAppFlows || []

  // Get available fields purely from flow session variables
  const getAvailableFields = () => {
    const fields: Array<{ value: string; label: string; source?: string; sourceType?: string }> = []
    const seen = new Set<string>()

    // Flow variables with source info
    for (const fv of flowVariablesRich) {
      if (!seen.has(fv.name)) {
        seen.add(fv.name)
        fields.push({
          value: fv.name,
          label: fv.name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          source: fv.sourceNodeLabel,
          sourceType: fv.sourceNodeType,
        })
      }
    }

    // Tags — special field for has_tag/not_has_tag operators
    fields.push({ value: "_tags", label: "Tags" })

    if (fields.length === 0) {
      fields.push({ value: "value", label: "Value" })
    }

    return fields
  }

  // Get available operators for a field
  const getAvailableOperators = (field?: string) => {
    // Tag field gets tag-specific operators
    if (field === "_tags") {
      return [
        { value: "hasTag", label: "Has Tag" },
        { value: "notHasTag", label: "Does Not Have Tag" },
      ]
    }
    return [
      { value: "equals", label: "Equals (=)" },
      { value: "notEquals", label: "Not Equals (≠)" },
      { value: "greaterThan", label: "Greater Than (>)" },
      { value: "lessThan", label: "Less Than (<)" },
      { value: "greaterThanOrEqual", label: "Greater or Equal (≥)" },
      { value: "lessThanOrEqual", label: "Less or Equal (≤)" },
      { value: "contains", label: "Contains" },
      { value: "notContains", label: "Does Not Contain" },
      { value: "startsWith", label: "Starts With" },
      { value: "endsWith", label: "Ends With" },
      { value: "isEmpty", label: "Is Empty" },
      { value: "isNotEmpty", label: "Is Not Empty" },
      { value: "isTrue", label: "Is True" },
      { value: "isFalse", label: "Is False" },
    ]
  }

  const handleLabelChange = (value: string) => {
    console.log("[v0] Updating label:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, label: value })
  }

  const handleQuestionChange = (value: string) => {
    console.log("[v0] Updating question:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, question: value })
  }

  const handleTextChange = (value: string) => {
    console.log("[v0] Updating text:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, text: value })
  }

  const handleCommentChange = (value: string) => {
    console.log("[v0] Updating comment:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, comment: value })
  }

  return (
    <div className="overflow-y-auto h-full pr-2 properties-panel-scroll">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-lg ${nodeColor} flex items-center justify-center`}>
            <NodeIcon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">{getNodeTitle()}</h2>
            <div className="flex flex-col items-start gap-2 mt-1">
              <div className="flex gap-1">
              <Badge variant="secondary" className="text-xs">
                {selectedNode.type === "comment" ? "NOTE" : platform.toUpperCase()}
              </Badge>
              </div>
              <span className="text-xs text-muted-foreground">ID: {selectedNode.id}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Comment Node */}
          {selectedNode.type === "comment" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="comment-text" className="text-sm font-medium">
                  Comment Text
                </Label>
                <Textarea
                  id="comment-text"
                  value={selectedNode.data.comment || ""}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter your comment..."
                  className="mt-2 min-h-[100px]"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Comments are for documentation and won't affect the chatbot flow.
                </p>
              </div>
            </div>
          )}

          {/* Interactive Nodes */}
          {(selectedNode.type === "question" ||
            selectedNode.type === "quickReply" ||
            selectedNode.type === "interactiveList" ||
            selectedNode.type === "webQuestion" ||
            selectedNode.type === "webQuickReply" ||
            selectedNode.type === "whatsappQuestion" ||
            selectedNode.type === "whatsappQuickReply" ||
            selectedNode.type === "whatsappInteractiveList" ||
            selectedNode.type === "whatsappMessage" ||
            selectedNode.type === "instagramQuestion" ||
            selectedNode.type === "instagramQuickReply" ||
            selectedNode.type === "instagramDM" ||
            selectedNode.type === "instagramStory") && (
            <>
              {/* Node Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter node label..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This label helps you identify the node in the flow.
                </p>
              </div>

              <Separator />

              {/* Question/Message Text */}
              <div>
                <Label htmlFor="question-text" className="text-sm font-medium">
                  {(selectedNode.type === "whatsappMessage" || 
                    selectedNode.type === "instagramDM" || 
                    selectedNode.type === "instagramStory") ? "Message Text" : "Question Text"}
                </Label>
                <VariablePickerTextarea
                  id="question-text"
                  value={(selectedNode.type === "whatsappMessage" ||
                          selectedNode.type === "instagramDM" ||
                          selectedNode.type === "instagramStory")
                          ? (selectedNode.data.text || "")
                          : (selectedNode.data.question || "")}
                  onValueChange={(val) => {
                    if (selectedNode.type === "whatsappMessage" ||
                        selectedNode.type === "instagramDM" ||
                        selectedNode.type === "instagramStory") {
                      handleTextChange(val)
                    } else {
                      handleQuestionChange(val)
                    }
                  }}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder={(selectedNode.type === "whatsappMessage" ||
                               selectedNode.type === "instagramDM" ||
                               selectedNode.type === "instagramStory")
                               ? "Enter your message..." : "Enter your question..."}
                  className={`mt-2 min-h-[80px] ${
                    isOverLimit((selectedNode.type === "whatsappMessage" ||
                                selectedNode.type === "instagramDM" ||
                                selectedNode.type === "instagramStory")
                                ? (selectedNode.data.text || "")
                                : (selectedNode.data.question || ""), "question") ? "border-destructive" : ""
                  }`}
                  rows={3}
                  flowVariables={flowVariablesRich}
                  excludeVariable={selectedNode.data.storeAs || undefined}
                />
                <div className="flex justify-between items-center mt-2">
                  <span
                    className={`text-xs ${
                      isOverLimit((selectedNode.type === "whatsappMessage" || 
                                  selectedNode.type === "instagramDM" || 
                                  selectedNode.type === "instagramStory") 
                                  ? (selectedNode.data.text || "") 
                                  : (selectedNode.data.question || ""), "question")
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {((selectedNode.type === "whatsappMessage" || 
                       selectedNode.type === "instagramDM" || 
                       selectedNode.type === "instagramStory") 
                       ? (selectedNode.data.text || "") 
                       : (selectedNode.data.question || "")).length}/{limits.question} characters
                  </span>
                  {isOverLimit((selectedNode.type === "whatsappMessage" || 
                               selectedNode.type === "instagramDM" || 
                               selectedNode.type === "instagramStory") 
                               ? (selectedNode.data.text || "") 
                               : (selectedNode.data.question || ""), "question") && (
                    <Badge variant="destructive" className="text-xs">
                      Limit exceeded
                    </Badge>
                  )}
                </div>
              </div>

              {/* Store Response As — only for input-collecting nodes */}
              {(selectedNode.type === "question" ||
                selectedNode.type === "whatsappQuestion" ||
                selectedNode.type === "instagramQuestion" ||
                selectedNode.type === "webQuestion" ||
                selectedNode.type === "quickReply" ||
                selectedNode.type === "whatsappQuickReply" ||
                selectedNode.type === "instagramQuickReply" ||
                selectedNode.type === "webQuickReply" ||
                selectedNode.type === "interactiveList" ||
                selectedNode.type === "whatsappInteractiveList") && (
                <>
                  <Separator />
                  <div>
                    <Label htmlFor="store-as" className="text-sm font-medium">
                      Store Response As
                    </Label>
                    <Input
                      id="store-as"
                      value={selectedNode.data.storeAs || ""}
                      onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, storeAs: e.target.value })}
                      onFocus={() => onSnapshot?.()}
                      onBlur={() => onResumeTracking?.()}
                      placeholder="e.g. customer_name"
                      className="mt-2 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Variable name to store the user's response in the session.
                    </p>
                  </div>
                </>
              )}

              {/* Quick Reply Buttons */}
              {(selectedNode.type === "quickReply" ||
                selectedNode.type === "webQuickReply" ||
                selectedNode.type === "whatsappQuickReply" ||
                selectedNode.type === "instagramQuickReply") && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">
                        Buttons (Max {BUTTON_LIMITS[platform]})
                      </Label>
                      <Button size="sm" variant="outline" onClick={addButton} className="h-7 px-2 bg-transparent">
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onButtonsDragOver} onDragEnd={reorderButtons}>
                      <SortableContext
                        items={localButtons.map((b: any) => `button-${b.__id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {localButtons.map((button: any, index: number) => (
                            <SortableButtonItem
                              key={`button-${button.__id}`}
                              button={button}
                              index={index}
                              itemId={`button-${button.__id}`}
                              onUpdate={updateButton}
                              onRemove={removeButton}
                              isOverLimit={isOverLimit}
                              limits={limits}
                              onSnapshot={onSnapshot}
                              onResumeTracking={onResumeTracking}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </>
              )}

              {/* List Options */}
              {(selectedNode.type === "interactiveList" ||
                selectedNode.type === "whatsappInteractiveList") && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Options (Max 10)</Label>
                      {(selectedNode.data.options || []).length < 10 && (
                        <Button size="sm" variant="outline" onClick={addOption} className="h-7 px-2 bg-transparent">
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onOptionsDragOver} onDragEnd={reorderOptions}>
                      <SortableContext
                        items={localOptions.map((o: any) => `option-${o.__id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {localOptions.map((option: any, index: number) => (
                            <SortableOptionItem
                              key={`option-${option.__id}`}
                              option={option}
                              index={index}
                              itemId={`option-${option.__id}`}
                              onUpdate={updateOption}
                              onRemove={removeOption}
                              isOverLimit={isOverLimit}
                              limits={limits}
                              onSnapshot={onSnapshot}
                              onResumeTracking={onResumeTracking}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </>
              )}

              {/* Validation & Retry — only for input-collecting nodes */}
              {(selectedNode.type === "question" ||
                selectedNode.type === "whatsappQuestion" ||
                selectedNode.type === "instagramQuestion" ||
                selectedNode.type === "webQuestion" ||
                selectedNode.type === "quickReply" ||
                selectedNode.type === "whatsappQuickReply" ||
                selectedNode.type === "instagramQuickReply" ||
                selectedNode.type === "webQuickReply" ||
                selectedNode.type === "interactiveList" ||
                selectedNode.type === "whatsappInteractiveList") && (() => {
                const inputType = getImplicitInputType(selectedNode.type || "")
                const preset = VALIDATION_PRESETS[inputType]
                const nodeValidation = (selectedNode.data.validation || {}) as Record<string, any>
                const isQuestionType = selectedNode.type === "question" ||
                  selectedNode.type === "whatsappQuestion" ||
                  selectedNode.type === "instagramQuestion"
                const retryEnabled = nodeValidation.retryOnInvalid ?? preset.retryOnInvalid ?? true

                return (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-sm font-medium">Validation & Retry</Label>
                      </div>

                      {/* Retry on Invalid */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Retry on Invalid</Label>
                          <p className="text-xs text-muted-foreground">Re-prompt when input fails validation</p>
                        </div>
                        <Switch
                          checked={retryEnabled}
                          onCheckedChange={(checked) =>
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              validation: { ...nodeValidation, retryOnInvalid: checked },
                            })
                          }
                        />
                      </div>

                      {/* Max Retries — only when retry is enabled */}
                      {retryEnabled && (
                        <div>
                          <Label htmlFor="max-retries" className="text-sm">Max Retries</Label>
                          <Input
                            id="max-retries"
                            type="number"
                            min={1}
                            max={10}
                            value={nodeValidation.maxRetries ?? ""}
                            onChange={(e) => {
                              const val = e.target.value === "" ? undefined : Math.min(10, Math.max(1, parseInt(e.target.value) || 1))
                              onNodeUpdate(selectedNode.id, {
                                ...selectedNode.data,
                                validation: { ...nodeValidation, maxRetries: val },
                              })
                            }}
                            placeholder={String(preset.maxRetries ?? 3)}
                            className="mt-1 w-24"
                          />
                        </div>
                      )}

                      {/* Error Message */}
                      <div>
                        <Label htmlFor="validation-error" className="text-sm">Error Message</Label>
                        <VariablePickerTextarea
                          id="validation-error"
                          value={nodeValidation.errorMessage || ""}
                          onValueChange={(val) =>
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              validation: { ...nodeValidation, errorMessage: val },
                            })
                          }
                          placeholder={preset.errorMessage || "Please enter a valid response"}
                          className="mt-1 min-h-[60px]"
                          flowVariables={flowVariablesRich}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave blank to use the default message.
                        </p>
                      </div>

                      {/* Validation Regex — only for question nodes */}
                      {isQuestionType && (
                        <div>
                          <Label htmlFor="validation-regex" className="text-sm">Validation Regex</Label>
                          <Input
                            id="validation-regex"
                            value={nodeValidation.regex || ""}
                            onChange={(e) =>
                              onNodeUpdate(selectedNode.id, {
                                ...selectedNode.data,
                                validation: { ...nodeValidation, regex: e.target.value },
                              })
                            }
                            placeholder={preset.regex || "^.+$"}
                            className="mt-1 font-mono text-xs"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Regular expression to validate the user's input. Leave blank for default.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )
              })()}
            </>
          )}

          {/* Condition Node Configuration */}
          {isConditionNode && (
            <>
              {/* Node Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter condition name..."
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* Main Question with inline logic selector */}
              <div className="space-y-2">
                <p className="text-sm text-card-foreground">
                  Does the contact match
                </p>
                <button
                  onClick={() => {
                    const newLogic = selectedNode.data.conditionLogic === "AND" ? "OR" : "AND"
                    onNodeUpdate(selectedNode.id, { ...selectedNode.data, conditionLogic: newLogic })
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
                >
                  {selectedNode.data.conditionLogic === "AND" ? "all" : "any"} of the following conditions?
                </button>
              </div>

              <Separator />

              {/* Condition Groups */}
              <div className="space-y-4">
                {(selectedNode.data.conditionGroups || []).map((group: any, groupIndex: number) => {
                  const groupRules = group.rules || []
                  
                  return (
                    <div key={group.id} className="space-y-3 p-3 bg-muted/10 rounded-lg border border-border">
                      {/* Group Header */}
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          Condition Group {groupIndex + 1}
                        </Label>
                        {(selectedNode.data.conditionGroups || []).length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newGroups = (selectedNode.data.conditionGroups || []).filter((_: any, i: number) => i !== groupIndex)
                              onNodeUpdate(selectedNode.id, { 
                                ...selectedNode.data, 
                                conditionGroups: newGroups
                              })
                            }}
                            className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>

                      {/* Group Logic Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Match</span>
                        <div className="flex gap-1">
                          <Button
                            variant={group.logic === "AND" || !group.logic ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              const updatedGroups = (selectedNode.data.conditionGroups || []).map((g: any) =>
                                g.id === group.id ? { ...g, logic: "AND" } : g
                              )
                              onNodeUpdate(selectedNode.id, { ...selectedNode.data, conditionGroups: updatedGroups })
                            }}
                            className="h-6 px-2 text-xs cursor-pointer"
                          >
                            ALL
                          </Button>
                          <Button
                            variant={group.logic === "OR" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              const updatedGroups = (selectedNode.data.conditionGroups || []).map((g: any) =>
                                g.id === group.id ? { ...g, logic: "OR" } : g
                              )
                              onNodeUpdate(selectedNode.id, { ...selectedNode.data, conditionGroups: updatedGroups })
                            }}
                            className="h-6 px-2 text-xs cursor-pointer"
                          >
                            ANY
                          </Button>
                        </div>
                        <span className="text-xs text-muted-foreground">of these conditions</span>
                      </div>

                      {/* Group Rules */}
                      <div className="space-y-2">
                        {groupRules.map((rule: any, ruleIndex: number) => {
                          return (
                            <div 
                              key={rule.id || ruleIndex} 
                              className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer group"
                              onClick={() => {
                                setEditingRule({ ...rule, groupId: group.id, groupIndex, ruleIndex })
                                setIsConditionDialogOpen(true)
                              }}
                            >
                              <span className="text-xs text-card-foreground flex-1">
                                <span className="font-medium">{rule.fieldLabel || rule.field || "Field"}</span>
                                {" "}
                                <span className="text-muted-foreground">{rule.operatorLabel || rule.operator || "equals"}</span>
                                {" "}
                                {rule.value && <span className="font-medium">{rule.value}</span>}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const updatedGroups = [...(selectedNode.data.conditionGroups || [])]
                                  updatedGroups[groupIndex] = {
                                    ...updatedGroups[groupIndex],
                                    rules: updatedGroups[groupIndex].rules.filter((_: any, i: number) => i !== ruleIndex)
                                  }
                                  onNodeUpdate(selectedNode.id, { ...selectedNode.data, conditionGroups: updatedGroups })
                                }}
                                className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>

                      {/* Add Condition to Group */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingRule({ groupId: group.id })
                          setIsConditionDialogOpen(true)
                        }}
                        className="w-full text-teal-600 dark:text-teal-400 border-dashed cursor-pointer"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Condition
                      </Button>
                    </div>
                  )
                })}
              </div>

              {/* Add Group Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newGroup = {
                    id: `group-${Date.now()}`,
                    label: `Group ${(selectedNode.data.conditionGroups || []).length + 1}`,
                    logic: "AND",
                    rules: []
                  }
                  onNodeUpdate(selectedNode.id, { 
                    ...selectedNode.data, 
                    conditionGroups: [...(selectedNode.data.conditionGroups || []), newGroup]
                  })
                }}
                className="w-full cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Condition Group
              </Button>

              <Separator />

              {/* Else Section */}
              <div className="p-3 bg-muted/10 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground mb-2">
                  If none of the above groups match
                </p>
                <p className="text-xs text-muted-foreground">
                  Connect the red handle (else) to define what happens when no conditions match
                </p>
              </div>

              {/* Info/Help Box */}
              {!selectedNode.data.connectedNode && (
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <GitBranch className="w-5 h-5 text-indigo-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
                        Connect a Node
                      </h4>
                      <p className="text-xs text-indigo-700 dark:text-indigo-300">
                        Connect this condition node to another node (like Name, Email, DOB) to enable smart, context-aware condition options.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Condition Rule Dialog */}
          {isConditionNode && (
            <ConditionRuleDialog
              isOpen={isConditionDialogOpen}
              onClose={() => {
                setIsConditionDialogOpen(false)
                setEditingRule(null)
              }}
              onSave={(rule) => {
                const updatedGroups = [...(selectedNode.data.conditionGroups || [])]
                const groupId = editingRule?.groupId || updatedGroups[0]?.id || "group-1"
                const groupIndex = editingRule?.groupIndex ?? updatedGroups.findIndex((g: any) => g.id === groupId)

                if (groupIndex !== -1 && updatedGroups[groupIndex]) {
                  const groupRules = updatedGroups[groupIndex].rules || []

                  if (editingRule && editingRule.id) {
                    // Update existing rule
                    const ruleIndex = editingRule.ruleIndex ?? groupRules.findIndex((r: any) => r.id === editingRule.id)
                    if (ruleIndex !== -1) {
                      groupRules[ruleIndex] = rule
                    }
                  } else {
                    // Add new rule
                    groupRules.push(rule)
                  }

                  updatedGroups[groupIndex] = {
                    ...updatedGroups[groupIndex],
                    rules: groupRules
                  }

                  onNodeUpdate(selectedNode.id, { ...selectedNode.data, conditionGroups: updatedGroups })
                }

                setIsConditionDialogOpen(false)
                setEditingRule(null)
              }}
              existingRule={editingRule}
              connectedNodeType={selectedNode.data.connectedNode?.type}
              availableFields={getAvailableFields()}
              getOperators={(field) => getAvailableOperators(field)}
              availableTags={allNodes
                .filter((n) => n.type === "action" && Array.isArray((n.data as any).tags))
                .flatMap((n) => ((n.data as any).tags as string[]).filter((t: string) => t.trim()))
                .filter((t, i, arr) => arr.indexOf(t) === i)
              }
            />
          )}

          {/* Fulfillment Nodes Configuration */}
          {isFulfillmentNode && (
            <>
              {/* Node Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter node label..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This label helps you identify the node in the flow.
                </p>
              </div>

              <Separator />

              {/* Description - Hide for tracking notification */}
              {selectedNode.type !== "trackingNotification" && (
                <>
                  <div>
                    <Label htmlFor="node-description" className="text-sm font-medium">
                      Description
                    </Label>
                    <Textarea
                      id="node-description"
                      value={selectedNode.data.description || ""}
                      onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, description: e.target.value })}
                      onFocus={() => onSnapshot?.()}
                      onBlur={() => onResumeTracking?.()}
                      placeholder="Enter description..."
                      className="mt-2 min-h-[60px]"
                      rows={2}
                    />
                  </div>

                  <Separator />
                </>
              )}

              {/* Vendor Selection Info - Only show for nodes with vendors */}
              {selectedNode.type !== "trackingNotification" && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">System-Optimized Vendor</h4>
                    <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed mb-2">
                      Our system automatically selects the most optimized vendor based on your configuration settings below. The vendor is intelligently chosen to provide the best service for your specific requirements.
                    </p>
                    {selectedNode.data.vendor?.name && (
                      <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2">
                          {selectedNode.type === "homeDelivery" && <Truck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                          {selectedNode.type === "event" && <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                          {selectedNode.type === "retailStore" && <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                          <span className="text-xs font-medium text-blue-900 dark:text-blue-100">
                            {selectedNode.data.vendor.name}
                          </span>
                        </div>
                        {selectedNode.data.vendor.description && (
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1.5">
                            {selectedNode.data.vendor.description}
                          </p>
                        )}
                        {selectedNode.data.vendor?.features && selectedNode.data.vendor.features.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {selectedNode.data.vendor.features.map((feature: string, index: number) => (
                              <Badge
                                key={index}
                                variant="secondary"
                                className="text-[10px] h-5 px-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                              >
                                {feature}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}

              <Separator />

              {/* Configuration Settings */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
                </div>

                <div className="space-y-4">
                  {/* Home Delivery Configuration */}
                  {selectedNode.type === "homeDelivery" && (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Real-time Tracking</Label>
                          <p className="text-xs text-muted-foreground">Enable delivery tracking</p>
                        </div>
                        <Switch
                          checked={selectedNode.data.configuration?.trackingEnabled !== false}
                          onCheckedChange={(checked) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), trackingEnabled: checked }
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Notifications</Label>
                          <p className="text-xs text-muted-foreground">Send delivery notifications</p>
                        </div>
                        <Switch
                          checked={selectedNode.data.configuration?.notificationsEnabled !== false}
                          onCheckedChange={(checked) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), notificationsEnabled: checked }
                            })
                          }
                        />
                      </div>

                      <div>
                        <Label htmlFor="delivery-window" className="text-sm">Delivery Window</Label>
                        <Select
                          value={selectedNode.data.configuration?.deliveryWindow || "flexible"}
                          onValueChange={(value) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), deliveryWindow: value }
                            })
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flexible">Flexible</SelectItem>
                            <SelectItem value="same-day">Same Day</SelectItem>
                            <SelectItem value="next-day">Next Day</SelectItem>
                            <SelectItem value="scheduled">Scheduled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Tracking Notification Configuration */}
                  {selectedNode.type === "trackingNotification" && (() => {
                    // Parse variables from message template ({{variable}})
                    const message = selectedNode.data.message || ""
                    const variableRegex = /\{\{(\w+)\}\}/g
                    const variables = new Set<string>()
                    let match
                    while ((match = variableRegex.exec(message)) !== null) {
                      variables.add(match[1])
                    }
                    const variableArray = Array.from(variables)
                    
                    // Get available nodes for mapping (exclude current node and start node)
                    const availableNodes = allNodes.filter(n => 
                      n.id !== selectedNode.id && n.type !== "start" && n.type !== "comment"
                    )
                    
                    // Get fields available from a node type
                    const getNodeFields = (nodeType: string) => {
                      switch (nodeType) {
                        case "homeDelivery":
                          return [
                            { value: "trackingNumber", label: "Tracking Number" },
                            { value: "deliveryDate", label: "Delivery Date" }
                          ]
                        default:
                          return [
                            { value: "label", label: "Label" },
                            { value: "value", label: "Value" }
                          ]
                      }
                    }
                    
                    const variableMappings = selectedNode.data.variableMappings || {}
                    
                    return (
                      <>
                        <div>
                          <Label htmlFor="tracking-message" className="text-sm mb-2 block">
                            Message Template
                          </Label>
                          <VariablePickerTextarea
                            id="tracking-message"
                            value={message}
                            onValueChange={(val) =>
                              onNodeUpdate(selectedNode.id, {
                                ...selectedNode.data,
                                message: val
                              })
                            }
                            placeholder="Use variables: {{name}}, {{product}}, {{delivery}}, {{tracking}}"
                            className="min-h-[120px] font-mono text-xs"
                            flowVariables={flowVariablesRich}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Use double curly braces for variables: <code className="text-[10px] bg-muted px-1 rounded">{"{{variable_name}}"}</code>
                          </p>
                        </div>

                        {variableArray.length > 0 && (
                          <>
                            <Separator />
                            <div>
                              <Label className="text-sm mb-3 block">Variable Mappings</Label>
                              <div className="space-y-3">
                                {variableArray.map((variable) => {
                                  const mapping = variableMappings[variable] || { nodeId: "", field: "" }
                                  const selectedNodeData = availableNodes.find(n => n.id === mapping.nodeId)
                                  
                                  return (
                                    <div key={variable} className="space-y-2 p-3 border border-border rounded-lg bg-muted/30">
                                      <div className="flex items-center gap-2">
                                        <code className="text-xs bg-background px-2 py-1 rounded border border-border">
                                          {"{{" + variable + "}}"}
                                        </code>
                                        <span className="text-xs text-muted-foreground">→</span>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-xs mb-1 block">From Node</Label>
                                          <Select
                                            value={mapping?.nodeId || ""}
                                            onValueChange={(nodeId) => {
                                              const node = availableNodes.find(n => n.id === nodeId)
                                              const fields = node && node.type ? getNodeFields(node.type) : []
                                              const defaultField = fields[0]?.value || ""
                                              
                                              onNodeUpdate(selectedNode.id, {
                                                ...selectedNode.data,
                                                variableMappings: {
                                                  ...variableMappings,
                                                  [variable]: {
                                                    nodeId,
                                                    field: defaultField
                                                  }
                                                }
                                              })
                                            }}
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue placeholder="Select node..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {availableNodes.map((node) => {
                                                const nodeType = node.type || "unknown"
                                                const nodeLabel = (node.data?.label as string) || nodeType
                                                return (
                                                  <SelectItem key={node.id} value={node.id}>
                                                    {String(nodeLabel)} ({String(nodeType)})
                                                  </SelectItem>
                                                )
                                              })}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        
                                        {selectedNodeData && selectedNodeData.type && (
                                          <div>
                                            <Label className="text-xs mb-1 block">Field</Label>
                                            <Select
                                              value={mapping?.field || ""}
                                              onValueChange={(field) => {
                                                onNodeUpdate(selectedNode.id, {
                                                  ...selectedNode.data,
                                                  variableMappings: {
                                                    ...variableMappings,
                                                    [variable]: {
                                                      ...mapping,
                                                      field
                                                    }
                                                  }
                                                })
                                              }}
                                            >
                                              <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Select field..." />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {getNodeFields(selectedNodeData.type).map((field) => (
                                                  <SelectItem key={field.value} value={field.value}>
                                                    {field.label}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </>
                        )}

                        <Separator />

                        <div className="flex items-center justify-between pt-2">
                          <div className="space-y-0.5">
                            <Label className="text-sm">Free Sample Note</Label>
                            <p className="text-xs text-muted-foreground">Include note about free sample</p>
                          </div>
                          <Switch
                            checked={selectedNode.data.showFreeSampleNote !== false}
                            onCheckedChange={(checked) => 
                              onNodeUpdate(selectedNode.id, {
                                ...selectedNode.data,
                                showFreeSampleNote: checked
                              })
                            }
                          />
                        </div>
                      </>
                    )
                  })()}

                  {/* Event Configuration */}
                  {selectedNode.type === "event" && (
                    <>
                      <div>
                        <Label htmlFor="promoter-network" className="text-sm mb-2 block">Promoter Network</Label>
                        <Select
                          value={selectedNode.data.configuration?.promoterNetwork || "our-network"}
                          onValueChange={(value) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), promoterNetwork: value }
                            })
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="our-network">Our Promoter Network</SelectItem>
                            <SelectItem value="brand-network">Brand's Own Promoters</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Choose between our network or your brand's own promoters
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Booking Enabled</Label>
                          <p className="text-xs text-muted-foreground">Allow event booking</p>
                        </div>
                        <Switch
                          checked={selectedNode.data.configuration?.bookingEnabled !== false}
                          onCheckedChange={(checked) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), bookingEnabled: checked }
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Reminders</Label>
                          <p className="text-xs text-muted-foreground">Send event reminders</p>
                        </div>
                        <Switch
                          checked={selectedNode.data.configuration?.remindersEnabled !== false}
                          onCheckedChange={(checked) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), remindersEnabled: checked }
                            })
                          }
                        />
                      </div>

                      <div>
                        <Label className="text-sm mb-2 block">Event Types</Label>
                        <div className="space-y-2">
                          {["in-store", "event"].map((type) => (
                            <div key={type} className="flex items-center gap-2">
                              <Checkbox
                                checked={(selectedNode.data.configuration?.eventTypes || []).includes(type)}
                                onCheckedChange={(checked) => {
                                  const eventTypes = selectedNode.data.configuration?.eventTypes || []
                                  const updated = checked
                                    ? [...eventTypes, type]
                                    : eventTypes.filter((t: string) => t !== type)
                                  onNodeUpdate(selectedNode.id, {
                                    ...selectedNode.data,
                                    configuration: { ...(selectedNode.data.configuration || {}), eventTypes: updated }
                                  })
                                }}
                                className="rounded border-border cursor-pointer"
                              />
                              <Label className="text-sm font-normal cursor-pointer">{type}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Retail Store Configuration */}
                  {selectedNode.type === "retailStore" && (
                    <>
                      <div>
                        <Label htmlFor="retailer-network" className="text-sm mb-2 block">Retailer Network</Label>
                        <Select
                          value={selectedNode.data.configuration?.retailerNetwork || "our-network"}
                          onValueChange={(value) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), retailerNetwork: value }
                            })
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="our-network">Our Retailer Network</SelectItem>
                            <SelectItem value="brand-network">Brand's Own Retailers</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          Choose between our network or your brand's own retail stores
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Store Locator</Label>
                          <p className="text-xs text-muted-foreground">Enable store finder</p>
                        </div>
                        <Switch
                          checked={selectedNode.data.configuration?.storeLocatorEnabled !== false}
                          onCheckedChange={(checked) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), storeLocatorEnabled: checked }
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm">Inventory Check</Label>
                          <p className="text-xs text-muted-foreground">Check product availability</p>
                        </div>
                        <Switch
                          checked={selectedNode.data.configuration?.inventoryCheckEnabled !== false}
                          onCheckedChange={(checked) => 
                            onNodeUpdate(selectedNode.id, {
                              ...selectedNode.data,
                              configuration: { ...(selectedNode.data.configuration || {}), inventoryCheckEnabled: checked }
                            })
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Info Box */}
              <div className="p-4 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Package className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-primary dark:text-primary/80 mb-1">Fulfillment Node</h4>
                    <p className="text-xs text-primary/80 dark:text-primary/60">
                      Configure your fulfillment service settings below. The system will automatically select the most optimized vendor based on your configuration. Changes are applied in real-time and reflected in the node on the canvas.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* API Fetch Node Configuration */}
          {isApiFetchNode && (
            <>
              {/* Node Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter node label..."
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* URL */}
              <div>
                <Label htmlFor="api-url" className="text-sm font-medium">
                  URL
                </Label>
                <VariablePickerTextarea
                  id="api-url"
                  value={selectedNode.data.url || ""}
                  onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, url: val })}
                  placeholder="https://api.example.com/endpoint"
                  className="mt-2 font-mono text-xs min-h-[36px]"
                  flowVariables={flowVariablesRich}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use <code className="text-[10px] bg-muted px-1 rounded">{"{{variable}}"}</code> for dynamic values
                </p>
              </div>

              {/* Method */}
              <div>
                <Label htmlFor="api-method" className="text-sm font-medium">
                  Method
                </Label>
                <Select
                  value={selectedNode.data.method || "GET"}
                  onValueChange={(value) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, method: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Headers */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Headers</Label>
                <div className="space-y-2">
                  {Object.entries(selectedNode.data.headers || {}).map(([key, value], idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={key}
                        onChange={(e) => {
                          const headers = { ...(selectedNode.data.headers || {}) }
                          const oldValue = headers[key]
                          delete headers[key]
                          headers[e.target.value] = oldValue
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, headers })
                        }}
                        placeholder="Header name"
                        className="flex-1 text-xs font-mono"
                      />
                      <VariablePickerTextarea
                        value={(value as string) || ""}
                        onValueChange={(val) => {
                          const headers = { ...(selectedNode.data.headers || {}) }
                          headers[key] = val
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, headers })
                        }}
                        placeholder="Value"
                        className="flex-1 text-xs font-mono min-h-[36px]"
                        flowVariables={flowVariablesRich}
                        showVariableButton={false}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const headers = { ...(selectedNode.data.headers || {}) }
                          delete headers[key]
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, headers })
                        }}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const headers = { ...(selectedNode.data.headers || {}), "": "" }
                      onNodeUpdate(selectedNode.id, { ...selectedNode.data, headers })
                    }}
                    className="w-full cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Header
                  </Button>
                </div>
              </div>

              {/* Body (for POST/PUT) */}
              {(selectedNode.data.method === "POST" || selectedNode.data.method === "PUT") && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="api-body" className="text-sm font-medium">
                        Request Body
                      </Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => {
                          const raw = selectedNode.data.body || ""
                          // Collect vars with their surrounding quotes for faithful restoration
                          const vars: string[] = []
                          const stripped = raw.replace(/"?\{\{[^}]+\}\}"?/g, (m: string) => { vars.push(m); return '"__var__"' })
                          try {
                            const parsed = JSON.parse(stripped)
                            const formatted = JSON.stringify(parsed, null, 2)
                            let idx = 0
                            const result = formatted.replace(/"__var__"/g, () => vars[idx++] || '""')
                            onNodeUpdate(selectedNode.id, { ...selectedNode.data, body: result })
                          } catch {
                            // Can't format — invalid JSON even after stripping variables
                          }
                        }}
                      >
                        Format JSON
                      </Button>
                    </div>
                    <VariablePickerTextarea
                      id="api-body"
                      value={selectedNode.data.body || ""}
                      onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, body: val })}
                      placeholder='{"key": "{{variable}}"}'
                      className="mt-2 min-h-[80px] font-mono text-xs"
                      flowVariables={flowVariablesRich}
                    />
                    {(() => {
                      const raw = selectedNode.data.body || ""
                      if (!raw.trim()) return null
                      const stripped = raw.replace(/"?\{\{[^}]+\}\}"?/g, '"__var__"')
                      try { JSON.parse(stripped); return null } catch (e: any) {
                        const msg = e.message?.replace("JSON.parse: ", "").replace(" at line ", " at line ") || "Invalid JSON"
                        return <p className="text-[10px] text-destructive mt-1">{msg}</p>
                      }
                    })()}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Use <code className="bg-muted px-1 rounded">{'"{{var}}"'}</code> for strings, <code className="bg-muted px-1 rounded">{'{{var}}'}</code> for numbers/booleans
                    </p>
                  </div>
                </>
              )}

              <Separator />

              {/* Response Mapping */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Response Mapping</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Map JSON response paths to session variables
                </p>
                <ResponseMappingEditor
                  mapping={selectedNode.data.responseMapping || {}}
                  onChange={(mapping) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, responseMapping: mapping })}
                />
              </div>

              <Separator />

              {/* Fallback Message */}
              <div>
                <Label htmlFor="api-fallback" className="text-sm font-medium">
                  Fallback Message
                </Label>
                <VariablePickerTextarea
                  id="api-fallback"
                  value={selectedNode.data.fallbackMessage || ""}
                  onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, fallbackMessage: val })}
                  placeholder="Message to send if API call fails..."
                  className="mt-2 min-h-[60px]"
                  flowVariables={flowVariablesRich}
                />
              </div>

              {/* Message Template */}
              <div>
                <Label htmlFor="api-message" className="text-sm font-medium">
                  Response Message
                </Label>
                <VariablePickerTextarea
                  id="api-message"
                  value={selectedNode.data.message || ""}
                  onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, message: val })}
                  placeholder="Message with {{mapped_variable}} to send after API call..."
                  className="mt-2 min-h-[60px]"
                  flowVariables={flowVariablesRich}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use mapped variables with <code className="text-[10px] bg-muted px-1 rounded">{"{{variable}}"}</code> syntax
                </p>
              </div>

              <Separator />

              {/* Test API */}
              <ApiTestSection
                url={selectedNode.data.url as string || ""}
                method={selectedNode.data.method as string || "GET"}
                headers={selectedNode.data.headers as Record<string, string> || {}}
                body={selectedNode.data.body as string || ""}
                responseMapping={selectedNode.data.responseMapping as Record<string, string> || {}}
              />
            </>
          )}

          {/* Transfer Node Configuration */}
          {isTransferNode && (
            <>
              {/* Node Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter node label..."
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* Team ID */}
              <div>
                <Label htmlFor="transfer-team" className="text-sm font-medium">
                  Team ID
                </Label>
                <Input
                  id="transfer-team"
                  value={selectedNode.data.teamId || "_general"}
                  onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, teamId: e.target.value })}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Team UUID or _general"
                  className="mt-2 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter team UUID or use <code className="text-[10px] bg-muted px-1 rounded">_general</code> for general queue
                </p>
              </div>

              {/* Team Name */}
              <div>
                <Label htmlFor="transfer-team-name" className="text-sm font-medium">
                  Team Name
                </Label>
                <Input
                  id="transfer-team-name"
                  value={selectedNode.data.teamName || ""}
                  onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, teamName: e.target.value })}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Display name for the team"
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* Notes */}
              <div>
                <Label htmlFor="transfer-notes" className="text-sm font-medium">
                  Agent Notes
                </Label>
                <VariablePickerTextarea
                  id="transfer-notes"
                  value={selectedNode.data.notes || ""}
                  onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, notes: val })}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Notes for the receiving agent... Use {{variable}} for context."
                  className="mt-2 min-h-[80px]"
                  flowVariables={flowVariablesRich}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use <code className="text-[10px] bg-muted px-1 rounded">{"{{variable}}"}</code> for dynamic context
                </p>
              </div>

              {/* Pre-transfer Message */}
              <div>
                <Label htmlFor="transfer-message" className="text-sm font-medium">
                  Pre-transfer Message
                </Label>
                <Textarea
                  id="transfer-message"
                  value={selectedNode.data.message || ""}
                  onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, message: e.target.value })}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Message to send before transferring..."
                  className="mt-2 min-h-[60px]"
                  rows={2}
                />
              </div>

              {/* Info Box */}
              <div className="p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <PhoneForwarded className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-1">Transfer Node</h4>
                    <p className="text-xs text-orange-800 dark:text-orange-300">
                      This node transfers the conversation to a human agent or team. The flow will end after transfer.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Template Message Node */}
          {isTemplateMessageNode && (
            <>
              {/* Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Enter node label..."
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* Template Picker */}
              <div>
                <Label className="text-sm font-medium">Select Template</Label>
                <Select
                  value={selectedNode.data.templateId || ""}
                  onValueChange={(templateId) => {
                    const tmpl = availableTemplates.find((t) => t.id === templateId)
                    if (tmpl) {
                      // Extract variables from body
                      const bodyVars = (tmpl.body_content || "").match(/\{\{(\d+|[a-zA-Z_]+)\}\}/g) || []
                      const varNames = [...new Set<string>(bodyVars.map((m: string) => m.replace(/\{\{|\}\}/g, "")))]
                      // Auto-create parameter mappings for detected variables
                      const mappings = varNames.map((v: string) => {
                        const existing = (selectedNode.data.parameterMappings || []).find((m: any) => m.templateVar === v)
                        return { templateVar: v, flowValue: existing?.flowValue || "" }
                      })
                      // Assign IDs to buttons for handle mapping
                      const buttons = (tmpl.buttons || []).map((btn: any, idx: number) => ({
                        ...btn,
                        id: btn.id || `btn-${idx}`,
                      }))
                      onNodeUpdate(selectedNode.id, {
                        ...selectedNode.data,
                        templateId: tmpl.id,
                        templateName: tmpl.name,
                        displayName: tmpl.display_name || "",
                        language: tmpl.language,
                        category: tmpl.category,
                        headerType: tmpl.header_type,
                        bodyPreview: tmpl.body_content,
                        buttons,
                        parameterMappings: mappings,
                        label: selectedNode.data.label || tmpl.display_name || tmpl.name,
                      })
                    }
                  }}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Choose an approved template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((tmpl) => (
                      <SelectItem key={tmpl.id} value={tmpl.id}>
                        <span className="font-medium">{tmpl.display_name || tmpl.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">({tmpl.language})</span>
                      </SelectItem>
                    ))}
                    {!templatesLoading && availableTemplates.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                        No approved templates found
                      </div>
                    )}
                  </SelectContent>
                </Select>
                {selectedNode.data.templateName && (
                  <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                    {selectedNode.data.templateName}
                  </p>
                )}
              </div>

              {/* Selected Template Preview */}
              {selectedNode.data.templateId && (
                <>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedNode.data.category && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {selectedNode.data.category}
                        </Badge>
                      )}
                      {selectedNode.data.language && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {selectedNode.data.language}
                        </Badge>
                      )}
                    </div>
                    {selectedNode.data.bodyPreview && (
                      <VariableHighlightText
                        text={selectedNode.data.bodyPreview}
                        className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap"
                      />
                    )}
                  </div>

                  <Separator />

                  {/* Parameter Mappings */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-sm font-medium">Parameter Mappings</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const mappings = selectedNode.data.parameterMappings || []
                          const next = mappings.length + 1
                          onNodeUpdate(selectedNode.id, {
                            ...selectedNode.data,
                            parameterMappings: [...mappings, { templateVar: String(next), flowValue: "" }],
                          })
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    {(selectedNode.data.parameterMappings || []).length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No variables in this template.</p>
                    )}
                    {(selectedNode.data.parameterMappings || []).map((mapping: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 mb-2">
                        <div className="shrink-0 font-mono text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded px-1.5 py-1">
                          {mapping.templateVar}
                        </div>
                        <span className="text-xs text-muted-foreground">=</span>
                        <Input
                          value={mapping.flowValue}
                          onChange={(e) => {
                            const mappings = [...(selectedNode.data.parameterMappings || [])]
                            mappings[idx] = { ...mappings[idx], flowValue: e.target.value }
                            onNodeUpdate(selectedNode.id, { ...selectedNode.data, parameterMappings: mappings })
                          }}
                          placeholder={`{{${mapping.templateVar}}}`}
                          className="flex-1 text-xs font-mono"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive"
                          onClick={() => {
                            const mappings = (selectedNode.data.parameterMappings || []).filter((_: any, i: number) => i !== idx)
                            onNodeUpdate(selectedNode.id, { ...selectedNode.data, parameterMappings: mappings })
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                      Leave empty if the variable name matches a session variable (e.g. <code className="bg-muted px-1 rounded">first_name</code> resolves from session automatically). Only map when names differ.
                    </p>
                  </div>
                </>
              )}

              <Separator />

              {/* Link to builder */}
              <div className="p-4 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-teal-600 mt-0.5" />
                  <div>
                    <p className="text-xs text-teal-800 dark:text-teal-300 mb-2">
                      Create and manage templates in the Template Builder.
                    </p>
                    <a
                      href="/templates"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-600 hover:text-teal-700 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open Template Builder
                    </a>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Action Node */}
          {isActionNode && (
            <>
              <div>
                <Label className="text-sm font-medium">Node Label</Label>
                <Input
                  value={selectedNode.data.label || ""}
                  onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, label: e.target.value })}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="Action"
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* Set Variables */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Set Variables</Label>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Set variables to static or computed values. Use <code className="bg-muted px-1 rounded">{"{{variable}}"}</code> for interpolation.
                </p>
                <div className="space-y-2">
                  {(selectedNode.data.variables || []).map((v: any, idx: number) => {
                    const varNames = (selectedNode.data.variables || []).map((x: any) => x.name?.trim()).filter(Boolean)
                    const isDuplicateName = v.name?.trim() && varNames.filter((n: string) => n === v.name.trim()).length > 1
                    return (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={v.name || ""}
                        onChange={(e) => {
                          const vars = [...(selectedNode.data.variables || [])]
                          vars[idx] = { ...vars[idx], name: e.target.value }
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, variables: vars })
                        }}
                        placeholder="variable_name"
                        className={`flex-1 text-xs font-mono ${isDuplicateName ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        title={isDuplicateName ? "Duplicate variable name" : undefined}
                      />
                      <span className="text-xs text-muted-foreground">=</span>
                      <Input
                        value={v.value || ""}
                        onChange={(e) => {
                          const vars = [...(selectedNode.data.variables || [])]
                          vars[idx] = { ...vars[idx], value: e.target.value }
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, variables: vars })
                        }}
                        placeholder="value or {{variable}}"
                        className="flex-1 text-xs font-mono"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const vars = [...(selectedNode.data.variables || [])]
                          if (vars.length >= 10) return
                          const baseName = v.name?.replace(/_\d+$/, "") || ""
                          const existingNames = new Set(vars.map((x: any) => x.name))
                          let copyName = `${baseName}_copy`
                          let counter = 1
                          while (existingNames.has(copyName)) {
                            copyName = `${baseName}_copy_${counter++}`
                          }
                          vars.splice(idx + 1, 0, { name: copyName, value: v.value || "" })
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, variables: vars })
                        }}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                        disabled={(selectedNode.data.variables || []).length >= 10}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const vars = [...(selectedNode.data.variables || [])]
                          vars.splice(idx, 1)
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, variables: vars })
                        }}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const vars = [...(selectedNode.data.variables || []), { name: "", value: "" }]
                      onNodeUpdate(selectedNode.id, { ...selectedNode.data, variables: vars })
                    }}
                    className="w-full cursor-pointer"
                    disabled={(selectedNode.data.variables || []).length >= 10}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {(selectedNode.data.variables || []).length >= 10 ? "Max 10 variables" : "Add Variable"}
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Tags */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Tags</Label>
                <div className="space-y-2">
                  <Select value={selectedNode.data.tagAction || "add"} onValueChange={(v) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, tagAction: v })}>
                    <SelectTrigger className="w-full h-8 text-xs cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add" className="text-xs cursor-pointer">Add Tags</SelectItem>
                      <SelectItem value="remove" className="text-xs cursor-pointer">Remove Tags</SelectItem>
                    </SelectContent>
                  </Select>
                  {(selectedNode.data.tags || []).map((tag: string, idx: number) => {
                    const allTags = (selectedNode.data.tags || []).map((t: string) => t?.trim()).filter(Boolean)
                    const isDuplicateTag = tag?.trim() && allTags.filter((t: string) => t === tag.trim()).length > 1
                    return (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={tag}
                        onChange={(e) => {
                          const tags = [...(selectedNode.data.tags || [])]
                          tags[idx] = e.target.value
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, tags })
                        }}
                        placeholder="tag_name or {{variable}}"
                        className={`flex-1 text-xs font-mono ${isDuplicateTag ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        title={isDuplicateTag ? "Duplicate tag" : undefined}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const tags = [...(selectedNode.data.tags || [])]
                          if (tags.length >= 10) return
                          const baseTag = tag?.replace(/_\d+$/, "") || ""
                          const existingTags = new Set(tags)
                          let copyTag = `${baseTag}_copy`
                          let counter = 1
                          while (existingTags.has(copyTag)) {
                            copyTag = `${baseTag}_copy_${counter++}`
                          }
                          tags.splice(idx + 1, 0, copyTag)
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, tags })
                        }}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
                        disabled={(selectedNode.data.tags || []).length >= 10}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const tags = [...(selectedNode.data.tags || [])]
                          tags.splice(idx, 1)
                          onNodeUpdate(selectedNode.id, { ...selectedNode.data, tags })
                        }}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const tags = [...(selectedNode.data.tags || []), ""]
                      onNodeUpdate(selectedNode.id, { ...selectedNode.data, tags })
                    }}
                    className="w-full cursor-pointer"
                    disabled={(selectedNode.data.tags || []).length >= 10}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {(selectedNode.data.tags || []).length >= 10 ? "Max 10 tags" : "Add Tag"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* WhatsApp Flow Node */}
          {isWhatsAppFlowNode && (
            <>
              <div>
                <Label className="text-sm font-medium">Node Label</Label>
                <Input
                  value={selectedNode.data.label || ""}
                  onChange={(e) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, label: e.target.value })}
                  onFocus={() => onSnapshot?.()}
                  onBlur={() => onResumeTracking?.()}
                  placeholder="WhatsApp Flow"
                  className="mt-2"
                />
              </div>

              <Separator />

              {/* Flow Selector */}
              <div>
                <Label className="text-sm font-medium mb-2 block">WhatsApp Flow</Label>
                <WhatsAppFlowPicker
                  flows={availableWhatsAppFlows}
                  value={selectedNode.data.whatsappFlowId || ""}
                  onChange={(metaFlowId) => {
                    const flow = availableWhatsAppFlows.find((f: any) => f.meta_flow_id === metaFlowId)
                    if (flow) {
                      const responseFields = extractFlowResponseFields(flow.flow_json)
                      onNodeUpdate(selectedNode.id, {
                        ...selectedNode.data,
                        whatsappFlowId: flow.meta_flow_id,
                        flowName: flow.name,
                        flowStatus: flow.status,
                        responseFields,
                      })
                    } else {
                      onNodeUpdate(selectedNode.id, {
                        ...selectedNode.data,
                        whatsappFlowId: "",
                        flowName: "",
                        flowStatus: "",
                        responseFields: [],
                      })
                    }
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs cursor-pointer"
                    onClick={() => onOpenFlowBuilder?.(selectedNode.id, "create")}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Create New
                  </Button>
                  {selectedNode.data.whatsappFlowId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs cursor-pointer"
                      onClick={() => onOpenFlowBuilder?.(selectedNode.id, "edit")}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit Flow
                    </Button>
                  )}
                </div>
                {availableWhatsAppFlows.length === 0 && !selectedNode.data.whatsappFlowId && (
                  <p className="text-[10px] text-muted-foreground mt-1">No published flows found. Click &quot;Create New&quot; to build one.</p>
                )}
              </div>

              {/* Header */}
              <div>
                <Label className="text-sm font-medium mb-1 block">Header (optional)</Label>
                <VariablePickerTextarea
                  value={selectedNode.data.headerText || ""}
                  onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, headerText: val })}
                  placeholder="Form header text"
                  className="min-h-[32px]"
                  flowVariables={flowVariablesRich}
                />
              </div>

              {/* Body */}
              <div>
                <Label className="text-sm font-medium mb-1 block">Message Body</Label>
                <VariablePickerTextarea
                  value={selectedNode.data.bodyText || ""}
                  onValueChange={(val) => onNodeUpdate(selectedNode.id, { ...selectedNode.data, bodyText: val })}
                  placeholder="Please fill out this form"
                  className="min-h-[60px]"
                  flowVariables={flowVariablesRich}
                />
              </div>

              {/* CTA */}
              <div>
                <Label className="text-sm font-medium mb-1 block">
                  CTA Button Text
                  <span className="text-[10px] text-muted-foreground font-normal ml-2">
                    {(selectedNode.data.ctaText || "").length}/20
                  </span>
                </Label>
                <Input
                  value={selectedNode.data.ctaText || ""}
                  onChange={(e) => {
                    if (e.target.value.length <= 20) {
                      onNodeUpdate(selectedNode.id, { ...selectedNode.data, ctaText: e.target.value })
                    }
                  }}
                  placeholder="Open Form"
                  maxLength={20}
                />
              </div>

              {/* Response Fields */}
              {(selectedNode.data.responseFields || []).length > 0 && (
                <div>
                  <Separator />
                  <Label className="text-sm font-medium mb-2 block mt-3">Response Fields</Label>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    These fields will be available as variables in subsequent nodes.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(selectedNode.data.responseFields || []).map((field: string, i: number) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-mono">
                        {`{{${field}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Flow Builder Modal lives at page level — opened via onOpenFlowBuilder */}
            </>
          )}

          {/* Start Node */}
          {selectedNode.type === "start" && (
            <StartNodePanel
              selectedNode={selectedNode}
              platform={platform}
              allNodes={allNodes}
              publishedFlowIdOverride={publishedFlowIdProp}
            />
          )}
        </div>
      </div>
    </div>
  )
}
