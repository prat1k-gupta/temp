"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Edit3, Plus, ChevronDown } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { WhatsAppIcon } from "@/components/platform-icons"
import { VariableHighlightText } from "@/components/variable-highlight-text"
import { VariablePickerTextarea } from "@/components/variable-picker-textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

function NodeFlowPicker({ flows, onSelect, onCreateNew }: { flows: any[]; onSelect: (metaFlowId: string) => void; onCreateNew: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-between h-8 px-2 border border-border rounded text-xs bg-background hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <span className="text-muted-foreground">Choose a flow...</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start" onClick={(e) => e.stopPropagation()}>
          <Command>
            <CommandInput placeholder="Search..." className="h-7 text-[11px]" />
            <CommandList className="max-h-[140px]">
              <CommandEmpty className="py-2 text-center text-[10px]">No flows found</CommandEmpty>
              <CommandGroup>
                {flows.map((flow: any) => (
                  <CommandItem
                    key={flow.id}
                    value={flow.name}
                    onSelect={() => { onSelect(flow.meta_flow_id || flow.id); setOpen(false) }}
                    className="text-[11px] cursor-pointer"
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
      <div
        className="flex items-center justify-center gap-1 text-[10px] text-white font-medium cursor-pointer bg-emerald-600 hover:bg-emerald-700 rounded py-1.5 transition-colors relative z-10"
        onClick={(e) => { e.stopPropagation(); onCreateNew() }}
      >
        <Plus className="w-3 h-3" />
        Create New
      </div>
    </div>
  )
}

export function WhatsAppFlowNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [isEditingHeader, setIsEditingHeader] = useState(false)
  const [editingHeaderValue, setEditingHeaderValue] = useState("")
  const [isEditingBody, setIsEditingBody] = useState(false)
  const [editingBodyValue, setEditingBodyValue] = useState("")
  const [isEditingCta, setIsEditingCta] = useState(false)
  const [editingCtaValue, setEditingCtaValue] = useState("")
  const editingContainerRef = useRef<HTMLDivElement>(null)

  const flowName = data.flowName || ""
  const flowStatus = data.flowStatus || ""
  const ctaText = data.ctaText || "Open Form"
  const headerText = data.headerText || ""
  const bodyText = data.bodyText || ""
  const responseFields: string[] = data.responseFields || []
  const hasFlow = !!data.whatsappFlowId
  const availableFlows: any[] = data.availableWhatsAppFlows || []

  const extractResponseFields = useCallback((flowJson: any): string[] => {
    if (!flowJson?.screens) return []
    const fields: string[] = []
    const inputTypes = new Set(["TextInput", "TextArea", "DatePicker", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "ChipsSelector", "CalendarPicker", "OptIn"])
    for (const screen of flowJson.screens) {
      for (const child of screen?.layout?.children || []) {
        if (inputTypes.has(child.type) && child.name) fields.push(child.name)
      }
    }
    return fields
  }, [])

  const selectFlow = useCallback((metaFlowId: string) => {
    const flow = availableFlows.find((f: any) => (f.meta_flow_id || f.id) === metaFlowId)
    if (flow && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, {
        ...data,
        whatsappFlowId: flow.meta_flow_id || "",
        flowDbId: flow.id,
        flowName: flow.name,
        flowStatus: flow.status,
        responseFields: extractResponseFields(flow.flow_json),
      })
    }
  }, [availableFlows, data, extractResponseFields])

  useEffect(() => { if (!isEditingLabel) setEditingLabelValue(data.label || "WhatsApp Flow") }, [data.label, isEditingLabel])
  useEffect(() => { if (!isEditingHeader) setEditingHeaderValue(data.headerText || "") }, [data.headerText, isEditingHeader])
  useEffect(() => { if (!isEditingBody) setEditingBodyValue(data.bodyText || "") }, [data.bodyText, isEditingBody])
  useEffect(() => { if (!isEditingCta) setEditingCtaValue(data.ctaText || "Open Form") }, [data.ctaText, isEditingCta])

  const update = (updates: Record<string, any>) => {
    if (data.onNodeUpdate) data.onNodeUpdate(data.id, { ...data, ...updates })
  }

  const finishEditingLabel = () => {
    if (editingLabelValue.trim()) update({ label: editingLabelValue.trim() })
    setIsEditingLabel(false)
  }
  const finishEditingHeader = (e?: React.FocusEvent) => {
    if (e?.relatedTarget && editingContainerRef.current?.contains(e.relatedTarget as Node)) return
    update({ headerText: editingHeaderValue })
    setIsEditingHeader(false)
  }
  const finishEditingBody = (e?: React.FocusEvent) => {
    if (e?.relatedTarget && editingContainerRef.current?.contains(e.relatedTarget as Node)) return
    update({ bodyText: editingBodyValue })
    setIsEditingBody(false)
  }
  const finishEditingCta = () => {
    update({ ctaText: editingCtaValue.trim() || "Open Form" })
    setIsEditingCta(false)
  }

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-emerald-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
      />

      <Card
        className={`min-w-[240px] max-w-[280px] bg-card border-emerald-100 dark:border-emerald-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 ${
          selected ? "ring-1 ring-emerald-300/50 dark:ring-emerald-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-1 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-emerald-600 rounded-md flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onFocus={() => data.onSnapshot?.()}
                onBlur={() => { finishEditingLabel(); data.onResumeTracking?.() }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") setIsEditingLabel(false)
                }}
                className="h-6 text-sm font-medium border-emerald-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors flex-1"
                onClick={() => { setEditingLabelValue(data.label || "WhatsApp Flow"); setIsEditingLabel(true) }}
              >
                {data.label || "WhatsApp Flow"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-1.5 pb-3 px-4">
          {hasFlow ? (
            <>
              {/* Flow name + status */}
              <div>
                <div className="text-[11px] font-semibold text-card-foreground leading-tight">{flowName}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge className={`text-[8px] px-1 py-0 h-3.5 shrink-0 ${
                    flowStatus === "PUBLISHED"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}>
                    {flowStatus}
                  </Badge>
                  {responseFields.length > 0 && (
                    <span className="text-[9px] text-muted-foreground">{responseFields.length} field{responseFields.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>

              {/* Header — inline editable */}
              {isEditingHeader ? (
                <div ref={editingContainerRef}>
                  <Input
                    value={editingHeaderValue}
                    onChange={(e) => { if (e.target.value.length <= 60) setEditingHeaderValue(e.target.value) }}
                    onFocus={() => data.onSnapshot?.()}
                    onBlur={(e) => { finishEditingHeader(e); data.onResumeTracking?.() }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finishEditingHeader()
                      if (e.key === "Escape") setIsEditingHeader(false)
                    }}
                    className="text-xs h-7 font-semibold border-emerald-200"
                    placeholder="Header text (optional)"
                    autoFocus
                    maxLength={60}
                  />
                </div>
              ) : (
                <div
                  className="text-xs font-semibold text-card-foreground cursor-pointer hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30 px-2 py-1 rounded border border-transparent hover:border-emerald-100 dark:hover:border-emerald-800 transition-colors"
                  onClick={() => { setEditingHeaderValue(headerText); setIsEditingHeader(true) }}
                >
                  {headerText ? (
                    <VariableHighlightText text={headerText} flowVariables={data.flowVariables || []} />
                  ) : (
                    <span className="text-muted-foreground/50 font-normal italic">Add header (optional)...</span>
                  )}
                </div>
              )}

              {/* Body — inline editable with bg like template node */}
              {isEditingBody ? (
                <div ref={editingContainerRef}>
                  <VariablePickerTextarea
                    value={editingBodyValue}
                    onValueChange={setEditingBodyValue}
                    onFocus={() => data.onSnapshot?.()}
                    onBlur={(e) => { finishEditingBody(e as any); data.onResumeTracking?.() }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finishEditingBody() }
                      if (e.key === "Escape") setIsEditingBody(false)
                    }}
                    className="text-[11px] min-h-[50px] resize-none border-emerald-200 focus:border-emerald-300"
                    placeholder="Message body..."
                    autoFocus
                    flowVariables={data.flowVariablesRich || []}
                  />
                </div>
              ) : (
                <div
                  className="bg-muted/40 rounded p-2 max-h-[80px] overflow-y-auto scroll-minimal cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => { setEditingBodyValue(bodyText); setIsEditingBody(true) }}
                >
                  {bodyText ? (
                    <VariableHighlightText
                      text={bodyText}
                      className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed"
                      flowVariables={data.flowVariables || []}
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 italic">Add message body...</span>
                  )}
                </div>
              )}

              {/* CTA button — inline editable, styled like template buttons */}
              {isEditingCta ? (
                <Input
                  value={editingCtaValue}
                  onChange={(e) => { if (e.target.value.length <= 20) setEditingCtaValue(e.target.value) }}
                  onFocus={() => data.onSnapshot?.()}
                  onBlur={() => { finishEditingCta(); data.onResumeTracking?.() }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishEditingCta()
                    if (e.key === "Escape") setIsEditingCta(false)
                  }}
                  className="text-[10px] h-7 text-center font-medium border-emerald-200"
                  maxLength={20}
                  autoFocus
                />
              ) : (
                <div
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/5 border border-emerald-500/20 rounded px-2 py-1.5 text-center cursor-pointer hover:bg-emerald-500/10 transition-colors"
                  onClick={() => { setEditingCtaValue(ctaText); setIsEditingCta(true) }}
                >
                  {ctaText}
                </div>
              )}

              {/* Response fields */}
              {responseFields.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-dashed border-emerald-200 dark:border-emerald-800">
                  {responseFields.slice(0, 4).map((field, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-mono">
                      {field}
                    </span>
                  ))}
                  {responseFields.length > 4 && (
                    <span className="text-[9px] text-muted-foreground">+{responseFields.length - 4}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <NodeFlowPicker
              flows={availableFlows}
              onSelect={selectFlow}
              onCreateNew={() => data.onOpenFlowBuilder?.(data.id, "create")}
            />
          )}
        </CardContent>

        {/* Next handle */}
        <div className="px-4 pb-3 flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-emerald-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
            style={{ position: "relative", right: "auto", top: "auto", transform: "none" }}
          />
        </div>
      </Card>
    </div>
  )
}
