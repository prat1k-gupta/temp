"use client"

import { useState, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Play, Plus, Edit3, Layout, Globe, Loader2, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { getTriggersByPlatform } from "@/constants/triggers"
import { TriggerConfigPanel, MATCH_TYPE_LABELS, isTriggerConfigInvalid, getSaveData, type TriggerConfigState } from "@/components/trigger-config-panel"
import type { Platform } from "@/types"
import { useChatbotFlows } from "@/hooks/queries"

export function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingTriggers, setIsEditingTriggers] = useState(false)
  const [flowDescription, setFlowDescription] = useState(data.flowDescription || "")
  const [isSaving, setIsSaving] = useState(false)
  const [conflictWarnings, setConflictWarnings] = useState<Record<string, string>>({})
  const [refConflict, setRefConflict] = useState<string | null>(null)
  const { data: chatbotFlows } = useChatbotFlows()

  const platform = (data.platform || "web") as Platform
  const allTriggers = getTriggersByPlatform(platform)

  // Build initial trigger config state from node data
  const getInitialState = (): TriggerConfigState => ({
    selectedTriggers: data.triggerIds || (data.triggerId ? [data.triggerId] : []),
    triggerKeywords: data.triggerKeywords || [],
    triggerMatchType: data.triggerMatchType || "contains_whole_word",
    triggerRef: data.triggerRef || "",
  })

  const [triggerState, setTriggerState] = useState<TriggerConfigState>(getInitialState)

  // Sync state when data changes from outside
  const dataKey = JSON.stringify({
    ids: data.triggerIds || data.triggerId || "",
    kw: data.triggerKeywords || [],
    mt: data.triggerMatchType || "",
    ref: data.triggerRef || "",
  })
  useEffect(() => {
    setTriggerState(getInitialState())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey])

  const flowDescKey = data.flowDescription || ""
  useEffect(() => {
    setFlowDescription(flowDescKey)
  }, [flowDescKey])

  // Clear conflict warnings when modal closes
  useEffect(() => {
    if (!isEditingTriggers) {
      setConflictWarnings({})
      setRefConflict(null)
    }
  }, [isEditingTriggers])

  // Clear ref conflict when user edits ref
  const handleTriggerChange = (newState: TriggerConfigState) => {
    if (newState.triggerRef !== triggerState.triggerRef && refConflict) {
      setRefConflict(null)
    }
    setTriggerState(newState)
  }

  const activeTriggers = triggerState.selectedTriggers
    .map(id => allTriggers.find(t => t.id === id))
    .filter(Boolean)

  const isSaveDisabled = isTriggerConfigInvalid(triggerState, refConflict) || isSaving

  const handleSaveTriggers = () => {
    const saveData = getSaveData(triggerState)

    // Check conflicts before saving
    if (platform === "whatsapp" && (saveData.triggerKeywords.length > 0 || saveData.triggerRef)) {
      const otherFlows = (chatbotFlows || []).filter((f: any) => f.id !== data.publishedFlowId)
      const warnings: Record<string, string> = {}
      let refConflictName: string | null = null
      for (const flow of otherFlows) {
        for (const kw of saveData.triggerKeywords) {
          if (flow.triggerKeywords?.some((fkw: string) => fkw.toLowerCase() === kw.toLowerCase()) && !warnings[kw]) {
            warnings[kw] = flow.name
          }
        }
        if (saveData.triggerRef && flow.triggerRef === saveData.triggerRef) {
          refConflictName = flow.name
        }
      }
      setConflictWarnings(warnings)
      setRefConflict(refConflictName)
      if (refConflictName) {
        return
      }
      // Keyword conflict: show warning first time, proceed on second click
      if (Object.keys(warnings).length > 0 && Object.keys(conflictWarnings).length === 0) {
        return
      }
    }

    if (data.onFlowUpdate) {
      const flowUpdates: Record<string, any> = {
        triggerKeywords: saveData.triggerKeywords,
        triggerMatchType: saveData.triggerMatchType,
        triggerRef: saveData.triggerRef,
      }
      if (flowDescription !== (data.flowDescription || "")) {
        flowUpdates.description = flowDescription
      }
      data.onFlowUpdate(flowUpdates)
    }
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, {
        ...data,
        triggerIds: saveData.selectedTriggers,
        triggerId: saveData.selectedTriggers[0],
        triggerKeywords: saveData.triggerKeywords,
        triggerMatchType: saveData.triggerMatchType,
        triggerRef: saveData.triggerRef,
      })
    }
    setTriggerState(saveData)
    setIsEditingTriggers(false)
  }

  const resetAndClose = () => {
    setTriggerState(getInitialState())
    setFlowDescription(data.flowDescription || "")
    setIsEditingTriggers(false)
  }

  // --- Platform styling helpers ---
  const getPlatformIcon = (p: Platform) => {
    switch (p) {
      case "web": return <WebIcon className="w-3 h-3 text-white" />
      case "whatsapp": return <WhatsAppIcon className="w-3 h-3 text-white" />
      case "instagram": return <InstagramIcon className="w-3 h-3 text-white" />
    }
  }
  const getPlatformColor = (p: Platform) => {
    switch (p) { case "web": return "bg-blue-500"; case "whatsapp": return "bg-green-500"; case "instagram": return "bg-pink-500" }
  }
  const getPlatformGradient = (p: Platform) => {
    switch (p) { case "web": return "from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/40"; case "whatsapp": return "from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/40"; case "instagram": return "from-pink-50 to-pink-100 dark:from-pink-950/30 dark:to-pink-900/40" }
  }
  const getPlatformRing = (p: Platform) => {
    switch (p) { case "web": return "ring-blue-200 dark:ring-blue-800"; case "whatsapp": return "ring-green-200 dark:ring-green-800"; case "instagram": return "ring-pink-200 dark:ring-pink-800" }
  }
  const getPlatformBorder = (p: Platform) => {
    switch (p) { case "web": return "border-blue-200 dark:border-blue-800"; case "whatsapp": return "border-green-200 dark:border-green-800"; case "instagram": return "border-pink-200 dark:border-pink-800" }
  }
  const getPlatformTextColor = (p: Platform) => {
    switch (p) { case "web": return "text-blue-700 dark:text-blue-300"; case "whatsapp": return "text-green-700 dark:text-green-300"; case "instagram": return "text-pink-700 dark:text-pink-300" }
  }
  const getPlatformIconBg = (p: Platform) => {
    switch (p) { case "web": return "bg-blue-100 dark:bg-blue-900/50"; case "whatsapp": return "bg-green-100 dark:bg-green-900/50"; case "instagram": return "bg-pink-100 dark:bg-pink-900/50" }
  }
  const getPlatformTriggerBg = (p: Platform) => {
    switch (p) { case "web": return "bg-blue-50/80 dark:bg-blue-900/20"; case "whatsapp": return "bg-green-50/80 dark:bg-green-900/20"; case "instagram": return "bg-pink-50/80 dark:bg-pink-900/20" }
  }
  const getTriggerIcon = (trigger: (typeof allTriggers)[0]) => {
    if (trigger.icon) {
      const iconMap: Record<string, React.ComponentType<{ className?: string }>> = { Layout, Globe }
      const IconComponent = iconMap[trigger.icon]
      if (IconComponent) return <IconComponent className="w-4 h-4" />
    }
    return getPlatformIcon(platform)
  }

  return (
    <>
    <div className="relative">
        <Card
          className={`min-w-[280px] max-w-[320px] bg-gradient-to-br ${getPlatformGradient(platform)} ${getPlatformBorder(platform)} shadow-lg cursor-pointer transition-all hover:shadow-xl ${
            selected ? `ring-2 ${getPlatformRing(platform)} scale-105` : ""
        }`}
          onClick={() => setIsEditingTriggers(true)}
        >
          <CardHeader className="pt-3 px-4">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getPlatformIconBg(platform)}`}>
                <Play className={`w-4 h-4 ${getPlatformTextColor(platform)} fill-current`} />
          </div>
          <div className="flex-1">
                <h3 className={`font-semibold text-sm ${getPlatformTextColor(platform)}`}>Start</h3>
              </div>
              <Edit3 className={`w-3.5 h-3.5 ${getPlatformTextColor(platform)} opacity-70`} />
            </div>
          </CardHeader>

          <CardContent className="pt-0 pb-3 px-4 space-y-2">
            {activeTriggers.length > 0 ? (
              <div className="space-y-1.5">
                {activeTriggers.map((trigger: any) => (
                  <div
                    key={trigger.id}
                    className={`flex items-start gap-2 p-2 rounded-md ${getPlatformTriggerBg(platform)} backdrop-blur-sm border ${getPlatformBorder(platform)}`}
                  >
                    <div className={`w-6 h-6 rounded-full ${getPlatformColor(platform)} flex items-center justify-center shrink-0 mt-0.5 text-white`}>
                      {getTriggerIcon(trigger)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${getPlatformTextColor(platform)}`}>{trigger.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{trigger.category}</p>
          </div>
        </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <p className="text-xs text-muted-foreground">No triggers set</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">Click to add triggers</p>
              </div>
            )}

            {triggerState.triggerKeywords.length > 0 && (
              <div className="space-y-1">
                <p className={`text-[9px] font-medium uppercase tracking-wider ${getPlatformTextColor(platform)} opacity-70`}>
                  Keywords {triggerState.triggerMatchType !== "contains_whole_word" && `· ${MATCH_TYPE_LABELS[triggerState.triggerMatchType]?.label || triggerState.triggerMatchType}`}
                </p>
                <div className="flex flex-wrap gap-1">
                  {triggerState.triggerKeywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 h-4 ${getPlatformTextColor(platform)} bg-background/50 border ${getPlatformBorder(platform)}`}
                    >
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {triggerState.triggerRef && (
              <div className="space-y-1">
                <p className={`text-[9px] font-medium uppercase tracking-wider ${getPlatformTextColor(platform)} opacity-70`}>Ref Link</p>
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0.5 ${getPlatformTextColor(platform)} bg-background/50`}
                  >
                    {triggerState.triggerRef}
                  </Badge>
                  {data.waPhoneNumber && (
                    <a
                      href={`https://wa.me/${data.waPhoneNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(triggerState.triggerRef)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`inline-flex items-center gap-0.5 text-[9px] ${getPlatformTextColor(platform)} opacity-70 hover:opacity-100 cursor-pointer`}
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      Preview
                    </a>
                  )}
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className={`w-full h-7 text-xs gap-1.5 ${getPlatformBorder(platform)} ${getPlatformTextColor(platform)} hover:bg-accent/10`}
              onClick={(e) => {
                e.stopPropagation()
                setIsEditingTriggers(true)
              }}
            >
              <Plus className="w-3 h-3" />
              Add Trigger
            </Button>
          </CardContent>

        <div className="absolute -right-2 top-1/2 -translate-y-1/2">
          <Handle
            type="source"
            position={Position.Right}
              className={`w-4 h-4 ${getPlatformColor(platform)} hover:scale-110 transition-transform shadow-md border-2 border-background`}
          />
        </div>
        </Card>
      </div>

      {/* Trigger Selection Modal */}
      <Dialog open={isEditingTriggers} onOpenChange={(open) => { if (!open) resetAndClose() }}>
        <DialogContent className="sm:max-w-5xl max-h-[80vh] overflow-hidden flex flex-col" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Configure Start Triggers</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            <TriggerConfigPanel
              platform={platform}
              state={triggerState}
              onChange={handleTriggerChange}
              waPhoneNumber={data.waPhoneNumber}
              publishedFlowId={data.publishedFlowId}
              layout="full"
              conflictWarnings={conflictWarnings}
              refConflict={refConflict}
              leftColumnHeader={
                <div className="space-y-2">
                  <Label htmlFor="flow-description" className="text-sm text-muted-foreground">
                    Flow Description <span className="text-xs text-muted-foreground/70">(Optional)</span>
                  </Label>
                  <Textarea
                    id="flow-description"
                    placeholder="Describe the purpose and context of this flow to get better AI suggestions..."
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    className="min-h-[80px] resize-none border-border shadow-sm"
                    rows={3}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Helps the AI assistant suggest better interactions
                  </p>
                </div>
              }
            />
          </div>

          <DialogFooter className="pt-4 border-t-2 border-border/50 bg-muted/30 -mx-6 -mb-6 px-6 pb-6">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-muted-foreground">
                {triggerState.selectedTriggers.length} trigger{triggerState.selectedTriggers.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAndClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTriggers}
                  disabled={isSaveDisabled}
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
