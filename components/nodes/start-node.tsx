"use client"

import { useState, useEffect } from "react"
import { Handle, Position } from "@xyflow/react"
import { Play, Plus, Edit3, Layout, Globe, X } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { getTriggersByPlatform } from "@/constants/triggers"
import type { Platform } from "@/types"

export function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingTriggers, setIsEditingTriggers] = useState(false)
  
  // Backward compatibility: support both triggerIds (array) and triggerId (single)
  const initialTriggers = data.triggerIds || (data.triggerId ? [data.triggerId] : [])
  const [selectedTriggers, setSelectedTriggers] = useState<string[]>(initialTriggers)
  const [flowDescription, setFlowDescription] = useState(data.flowDescription || "")
  const [triggerKeywords, setTriggerKeywords] = useState<string[]>(data.triggerKeywords || [])
  const [keywordInput, setKeywordInput] = useState("")
  
  const platform = (data.platform || "web") as Platform
  const allTriggers = getTriggersByPlatform(platform)
  
  // Sync state when data changes from outside
  useEffect(() => {
    const newTriggers = data.triggerIds || (data.triggerId ? [data.triggerId] : [])
    setSelectedTriggers(newTriggers)
  }, [data.triggerIds, data.triggerId])

  useEffect(() => {
    setFlowDescription(data.flowDescription || "")
  }, [data.flowDescription])

  useEffect(() => {
    setTriggerKeywords(data.triggerKeywords || [])
  }, [data.triggerKeywords])
  
  const activeTriggers = selectedTriggers
    .map(id => allTriggers.find(t => t.id === id))
    .filter(Boolean)

  const getPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case "web":
        return <WebIcon className="w-3 h-3 text-white" />
      case "whatsapp":
        return <WhatsAppIcon className="w-3 h-3 text-white" />
      case "instagram":
        return <InstagramIcon className="w-3 h-3 text-white" />
    }
  }

  const getPlatformColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-500"
      case "whatsapp":
        return "bg-green-500"
      case "instagram":
        return "bg-pink-500"
    }
  }

  const getPlatformGradient = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/40"
      case "whatsapp":
        return "from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/40"
      case "instagram":
        return "from-pink-50 to-pink-100 dark:from-pink-950/30 dark:to-pink-900/40"
    }
  }

  const getPlatformRing = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "ring-blue-200 dark:ring-blue-800"
      case "whatsapp":
        return "ring-green-200 dark:ring-green-800"
      case "instagram":
        return "ring-pink-200 dark:ring-pink-800"
    }
  }

  const getPlatformBorder = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "border-blue-200 dark:border-blue-800"
      case "whatsapp":
        return "border-green-200 dark:border-green-800"
      case "instagram":
        return "border-pink-200 dark:border-pink-800"
    }
  }

  const getPlatformTextColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "text-blue-700 dark:text-blue-300"
      case "whatsapp":
        return "text-green-700 dark:text-green-300"
      case "instagram":
        return "text-pink-700 dark:text-pink-300"
    }
  }

  const getPlatformIconBg = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-100 dark:bg-blue-900/50"
      case "whatsapp":
        return "bg-green-100 dark:bg-green-900/50"
      case "instagram":
        return "bg-pink-100 dark:bg-pink-900/50"
    }
  }

  const getPlatformTriggerBg = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-50/80 dark:bg-blue-900/20"
      case "whatsapp":
        return "bg-green-50/80 dark:bg-green-900/20"
      case "instagram":
        return "bg-pink-50/80 dark:bg-pink-900/20"
    }
  }

  const getTriggerIcon = (trigger: (typeof allTriggers)[0]) => {
    if (trigger.icon) {
      const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
        Layout,
        Globe,
      }
      const IconComponent = iconMap[trigger.icon]
      if (IconComponent) {
        return <IconComponent className="w-4 h-4" />
      }
    }
    // Fallback to platform icon if no specific icon
    return getPlatformIcon(platform)
  }

  const handleToggleTrigger = (triggerId: string) => {
    setSelectedTriggers(prev => {
      if (prev.includes(triggerId)) {
        return prev.filter(id => id !== triggerId)
      }
      return [...prev, triggerId]
    })
  }

  const addKeyword = () => {
    const keyword = keywordInput.trim().toLowerCase()
    if (keyword && !triggerKeywords.includes(keyword)) {
      setTriggerKeywords([...triggerKeywords, keyword])
    }
    setKeywordInput("")
  }

  const removeKeyword = (keyword: string) => {
    setTriggerKeywords(triggerKeywords.filter(k => k !== keyword))
  }

  const handleSaveTriggers = () => {
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, {
        ...data,
        triggerIds: selectedTriggers,
        triggerId: selectedTriggers[0], // Keep backwards compatibility
        triggerKeywords,
      })
    }
    // Update flow description and trigger keywords on the flow
    if (data.onFlowUpdate) {
      const flowUpdates: Record<string, any> = {}
      if (flowDescription !== (data.flowDescription || "")) {
        flowUpdates.description = flowDescription
      }
      flowUpdates.triggerKeywords = triggerKeywords
      data.onFlowUpdate(flowUpdates)
    }
    setIsEditingTriggers(false)
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
      <Dialog open={isEditingTriggers} onOpenChange={setIsEditingTriggers}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Configure Start Triggers</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 py-4">
            {/* Flow Description Section */}
            <div className="space-y-2 px-1">
              <Label htmlFor="flow-description" className="text-sm text-muted-foreground">
                Flow Description <span className="text-xs text-muted-foreground/70">(Optional)</span>
              </Label>
              <Textarea
                id="flow-description"
                placeholder="Describe the purpose and context of this flow to get better AI suggestions..."
                value={flowDescription}
                onChange={(e) => setFlowDescription(e.target.value)}
                className="min-h-[80px] resize-none"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This helps the AI assistant suggest better interactions for your flow
              </p>
            </div>

            {/* Triggers Section */}
            <div className="px-1">
              <div className="flex items-start justify-between mb-3 gap-2">
                <Label className="text-sm text-muted-foreground">
                  {platform === "web" ? "Form Type" : "Triggers"}
                </Label>
                <p className="text-[11px] text-muted-foreground text-right leading-tight">
                  {platform === "web" 
                    ? "Choose how your form will be displayed"
                    : `Select one or more triggers that will start this flow on ${platform === "whatsapp" ? "WhatsApp" : "Instagram"}.`}
                </p>
              </div>
              
              <div className="space-y-2">
                {allTriggers.map((trigger) => {
                  const isSelected = selectedTriggers.includes(trigger.id)
                  
                  return (
                    <button
                      key={trigger.id}
                      onClick={() => handleToggleTrigger(trigger.id)}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left cursor-pointer ${
                        isSelected
                          ? "border-accent bg-accent/10"
                          : "border-border hover:border-accent/50 hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-7 h-7 rounded-full ${getPlatformColor(platform)} flex items-center justify-center shrink-0 text-white`}>
                          {getTriggerIcon(trigger)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted-foreground mb-0.5">{trigger.category}</div>
                          <div className="font-medium text-sm text-card-foreground">{trigger.title}</div>
                          {trigger.description && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{trigger.description}</div>
                          )}
                        </div>
                        {isSelected && (
                          <Badge variant="secondary" className="shrink-0">
                            Selected
                          </Badge>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Trigger Keywords Section (WhatsApp only) */}
            {platform === "whatsapp" && (
              <div className="space-y-2 px-1">
                <Label className="text-sm text-muted-foreground">
                  Trigger Keywords
                </Label>
                <p className="text-xs text-muted-foreground">
                  Words that start this flow when a user sends a message (e.g. "hi", "menu", "help")
                </p>
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
                    className="flex-1 h-8 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addKeyword}
                    disabled={!keywordInput.trim()}
                    className="h-8 px-3"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                {triggerKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {triggerKeywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="secondary"
                        className="flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer hover:bg-destructive/10"
                        onClick={() => removeKeyword(keyword)}
                      >
                        {keyword}
                        <X className="w-3 h-3" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 border-t">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-muted-foreground">
                {selectedTriggers.length} trigger{selectedTriggers.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setIsEditingTriggers(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTriggers}>
                  Save
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
