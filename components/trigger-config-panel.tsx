"use client"

import { useState, useEffect } from "react"
import { Play, Plus, X, Copy, AlertTriangle, Link } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger as SelectTrig, SelectValue } from "@/components/ui/select"
import { getTriggersByPlatform } from "@/constants/triggers"
import { toast } from "sonner"
import type { Platform } from "@/types"

export const MATCH_TYPE_LABELS: Record<string, { label: string; help: string }> = {
  contains_whole_word: { label: "Contains Whole Word", help: "Matches the word anywhere in the message (e.g. \"hi\" matches \"hi there\" but not \"this\")" },
  exact: { label: "Exact Match", help: "User must send this exact word or phrase — nothing more, nothing less" },
  contains: { label: "Contains", help: "Matches even inside other words (e.g. \"order\" matches \"reorder\")" },
  starts_with: { label: "Starts With", help: "Message must begin with this word (e.g. \"order\" matches \"order status\")" },
}

export interface TriggerConfigState {
  selectedTriggers: string[]
  triggerKeywords: string[]
  triggerMatchType: string
  triggerRef: string
}

interface TriggerConfigPanelProps {
  platform: Platform
  state: TriggerConfigState
  onChange: (state: TriggerConfigState) => void
  waPhoneNumber?: string
  publishedFlowId?: string
  disabled?: boolean
  /** "full" = two-column with trigger selection on left, config on right. "compact" = stacked. */
  layout?: "full" | "compact"
  /** Extra content rendered above trigger selection in the left column (full layout only) */
  leftColumnHeader?: React.ReactNode
  conflictWarnings?: Record<string, string>
  refConflict?: string | null
}

function getPlatformColor(platform: Platform) {
  switch (platform) {
    case "web": return "bg-blue-500"
    case "whatsapp": return "bg-green-500"
    case "instagram": return "bg-pink-500"
  }
}

export function TriggerConfigPanel({
  platform,
  state,
  onChange,
  waPhoneNumber,
  disabled = false,
  layout = "full",
  leftColumnHeader,
  conflictWarnings = {},
  refConflict = null,
}: TriggerConfigPanelProps) {
  const [keywordInput, setKeywordInput] = useState("")
  const allTriggers = getTriggersByPlatform(platform)

  const hasMessageTrigger = state.selectedTriggers.includes("whatsapp-message") || state.selectedTriggers.includes("instagram-message")
  const hasUrlTrigger = state.selectedTriggers.includes("whatsapp-url")
  const cleanPhone = waPhoneNumber?.replace(/[^0-9]/g, "") || ""

  const handleToggleTrigger = (triggerId: string) => {
    if (disabled) return
    const trigger = allTriggers.find(t => t.id === triggerId)
    if (trigger?.comingSoon) return
    const newTriggers = state.selectedTriggers.includes(triggerId)
      ? state.selectedTriggers.filter(id => id !== triggerId)
      : [...state.selectedTriggers, triggerId]
    onChange({ ...state, selectedTriggers: newTriggers })
  }

  const addKeyword = () => {
    const keyword = keywordInput.trim().toLowerCase()
    if (keyword && !state.triggerKeywords.includes(keyword)) {
      onChange({ ...state, triggerKeywords: [...state.triggerKeywords, keyword] })
    }
    setKeywordInput("")
  }

  const removeKeyword = (keyword: string) => {
    onChange({ ...state, triggerKeywords: state.triggerKeywords.filter(k => k !== keyword) })
  }

  const triggerSelectionUI = (
    <div className="space-y-1.5">
      {allTriggers.map((trigger) => {
        const isSelected = state.selectedTriggers.includes(trigger.id)
        const isComingSoon = trigger.comingSoon
        return (
          <button
            key={trigger.id}
            onClick={() => handleToggleTrigger(trigger.id)}
            disabled={disabled}
            className={`w-full px-3 py-2.5 rounded-lg transition-all text-left ${
              isComingSoon
                ? "border border-border opacity-50 cursor-not-allowed"
                : isSelected
                  ? "border-2 border-accent bg-accent/10 shadow-sm cursor-pointer"
                  : "border border-border hover:border-accent/50 hover:bg-muted/50 cursor-pointer"
            } disabled:opacity-50`}
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-6 h-6 rounded-full ${getPlatformColor(platform)} flex items-center justify-center shrink-0 text-white`}>
                {/* Simple platform icon fallback */}
                <Play className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-card-foreground">{trigger.title}</div>
                {trigger.description && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{trigger.description}</div>
                )}
              </div>
              {isComingSoon && (
                <Badge variant="outline" className="shrink-0 text-[10px] h-5 text-muted-foreground">
                  Coming Soon
                </Badge>
              )}
              {!isComingSoon && isSelected && (
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )

  const keywordConfigUI = hasMessageTrigger ? (
    <div className="p-4 rounded-lg border border-border bg-muted shadow-sm">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-border">
        <Play className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
        <Label className="text-sm font-semibold">Keyword Triggers</Label>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Match Type</Label>
          <Select value={state.triggerMatchType} onValueChange={(v) => onChange({ ...state, triggerMatchType: v })} disabled={disabled}>
            <SelectTrig className="h-8 text-sm bg-background border-border shadow-sm">
              <SelectValue />
            </SelectTrig>
            <SelectContent>
              {Object.entries(MATCH_TYPE_LABELS).map(([value, { label }]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {MATCH_TYPE_LABELS[state.triggerMatchType]?.help}
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Keywords</Label>
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addKeyword()
                }
              }}
              placeholder="Type a keyword and press Enter"
              className="flex-1 h-8 text-sm bg-background border-border shadow-sm"
              disabled={disabled}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addKeyword}
              disabled={!keywordInput.trim() || disabled}
              className="h-8 px-3 shadow-sm"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          {state.triggerKeywords.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {state.triggerKeywords.map((keyword) => (
                  <Badge
                    key={keyword}
                    variant="secondary"
                    className={`flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer hover:bg-destructive/10 ${conflictWarnings[keyword] ? "border-amber-400 dark:border-amber-600" : ""}`}
                    onClick={() => !disabled && removeKeyword(keyword)}
                  >
                    {keyword}
                    <X className="w-3 h-3" />
                  </Badge>
                ))}
              </div>
              {Object.entries(conflictWarnings).filter(([kw]) => state.triggerKeywords.includes(kw)).map(([kw, flowName]) => (
                <p key={kw} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  &ldquo;{kw}&rdquo; already triggers &ldquo;{flowName}&rdquo;. Saving will switch it to this flow instead.
                </p>
              ))}
            </div>
          )}
          {state.triggerKeywords.length === 0 && (
            <p className="text-[10px] text-destructive">At least one keyword is required</p>
          )}
        </div>
      </div>
    </div>
  ) : null

  const refConfigUI = hasUrlTrigger ? (
    <div className="p-4 rounded-lg border border-border bg-muted shadow-sm">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-border">
        <Link className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
        <Label className="text-sm font-semibold">Ref Link Trigger</Label>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Ref Keyword <span className="text-destructive">*</span></Label>
          <Input
            value={state.triggerRef}
            onChange={(e) => onChange({ ...state, triggerRef: e.target.value.slice(0, 100) })}
            placeholder="e.g. claim free sample"
            className="h-8 text-sm bg-background border-border shadow-sm"
            disabled={disabled}
          />
          {refConflict && (
            <p className="text-[10px] text-destructive flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              Already used by &ldquo;{refConflict}&rdquo;
            </p>
          )}
          {!refConflict && !state.triggerRef.trim() && (
            <p className="text-[10px] text-destructive">Ref keyword is required</p>
          )}
        </div>

        {state.triggerRef && cleanPhone && (
          <div className="flex items-center gap-2 p-2.5 rounded-md bg-background border border-border shadow-sm">
            <code className="text-[11px] flex-1 truncate text-muted-foreground">
              wa.me/{cleanPhone}?text={encodeURIComponent(state.triggerRef)}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 cursor-pointer shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(state.triggerRef)}`)
                toast.success("Link copied!")
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        )}
        {state.triggerRef && !cleanPhone && (
          <p className="text-[10px] text-muted-foreground/70">
            The wa.me preview link will appear after you publish this flow
          </p>
        )}
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Share this link — when clicked, the flow starts automatically via exact match.
        </p>
      </div>
    </div>
  ) : null

  const emptyStateUI = !hasMessageTrigger && !hasUrlTrigger ? (
    <div className="flex items-center justify-center h-full text-center p-6 rounded-lg border border-dashed border-border/60">
      <div>
        <p className="text-sm text-muted-foreground">No triggers selected</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">Select a trigger type to configure it</p>
      </div>
    </div>
  ) : null

  if (layout === "full") {
    return (
      <div className="grid grid-cols-2 gap-0 items-start">
        <div className="space-y-4 pr-6 border-r-2 border-border/50">
          {leftColumnHeader}
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">
              {platform === "web" ? "Form Type" : "Triggers"}
            </Label>
            {triggerSelectionUI}
          </div>
        </div>
        <div className="space-y-4 pl-6">
          {emptyStateUI}
          {keywordConfigUI}
          {refConfigUI}
        </div>
      </div>
    )
  }

  // Compact layout: trigger selection list, then config below
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">
          {platform === "web" ? "Form Type" : "Triggers"}
        </Label>
        {triggerSelectionUI}
      </div>
      {keywordConfigUI}
      {refConfigUI}
    </div>
  )
}

/** Check if save should be disabled based on trigger config state */
export function isTriggerConfigInvalid(state: TriggerConfigState, refConflict?: string | null): boolean {
  const hasMessageTrigger = state.selectedTriggers.includes("whatsapp-message") || state.selectedTriggers.includes("instagram-message")
  const hasUrlTrigger = state.selectedTriggers.includes("whatsapp-url")
  return (
    (hasMessageTrigger && state.triggerKeywords.length === 0) ||
    (hasUrlTrigger && !state.triggerRef.trim()) ||
    !!refConflict
  )
}

/** Get the data to persist — clears fields for deselected trigger types */
export function getSaveData(state: TriggerConfigState) {
  const hasMessageTrigger = state.selectedTriggers.includes("whatsapp-message") || state.selectedTriggers.includes("instagram-message")
  const hasUrlTrigger = state.selectedTriggers.includes("whatsapp-url")
  return {
    selectedTriggers: state.selectedTriggers,
    triggerKeywords: hasMessageTrigger ? state.triggerKeywords : [],
    triggerMatchType: hasMessageTrigger ? state.triggerMatchType : "contains_whole_word",
    triggerRef: hasUrlTrigger ? state.triggerRef.trim() : "",
  }
}
