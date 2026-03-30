"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { Loader2 } from "lucide-react"
import type { Platform } from "@/types"
import { TriggerConfigPanel, isTriggerConfigInvalid, getSaveData, type TriggerConfigState } from "@/components/trigger-config-panel"

interface FlowSetupModalProps {
  open: boolean
  onClose: () => void
  onComplete: (data: {
    name: string
    platform: Platform
    triggerId: string
    triggerIds?: string[]
    description?: string
    triggerKeywords?: string[]
    triggerMatchType?: string
    triggerRef?: string
    waAccountId?: string
    waPhoneNumber?: string
  }) => Promise<void>
}

export function FlowSetupModal({ open, onClose, onComplete }: FlowSetupModalProps) {
  const [flowName, setFlowName] = useState("")
  const [flowDescription, setFlowDescription] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("whatsapp")
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [conflictWarnings, setConflictWarnings] = useState<Record<string, string>>({})
  const [refConflict, setRefConflict] = useState<string | null>(null)
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfigState>({
    selectedTriggers: [],
    triggerKeywords: [],
    triggerMatchType: "contains_whole_word",
    triggerRef: "",
  })

  // WhatsApp account selection
  const [waAccounts, setWaAccounts] = useState<{ id: string; name: string; status: string; phone_number?: string }[]>([])
  const [waAccountsLoading, setWaAccountsLoading] = useState(false)
  const [selectedWaAccountId, setSelectedWaAccountId] = useState("")
  const [waPhoneNumber, setWaPhoneNumber] = useState("")

  useEffect(() => {
    if (selectedPlatform === "whatsapp" && open) {
      setWaAccountsLoading(true)
      fetch("/api/accounts")
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data.accounts || []
          setWaAccounts(list)
          // Auto-select default outgoing or first account
          const defaultAcc = list.find((a: any) => a.is_default_outgoing) || list[0]
          if (defaultAcc && !selectedWaAccountId) {
            setSelectedWaAccountId(defaultAcc.id)
          }
        })
        .catch(() => setWaAccounts([]))
        .finally(() => setWaAccountsLoading(false))
    }
  }, [selectedPlatform, open])

  const getPlatformIcon = (platform: Platform, size: "sm" | "md" | "lg" = "md") => {
    const sizeClasses = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8" }
    switch (platform) {
      case "web": return <WebIcon className={sizeClasses[size]} />
      case "whatsapp": return <WhatsAppIcon className={sizeClasses[size]} />
      case "instagram": return <InstagramIcon className={sizeClasses[size]} />
    }
  }

  const getPlatformColor = (platform: Platform) => {
    switch (platform) { case "web": return "bg-blue-500"; case "whatsapp": return "bg-green-500"; case "instagram": return "bg-pink-500" }
  }

  const handleTriggerChange = (newState: TriggerConfigState) => {
    if (newState.triggerRef !== triggerConfig.triggerRef && refConflict) {
      setRefConflict(null)
    }
    setTriggerConfig(newState)
  }

  const handleComplete = async () => {
    const saveData = getSaveData(triggerConfig)
    if (flowName.trim() && saveData.selectedTriggers.length > 0 && !isCreating) {
      setIsCreating(true)

      // Check conflicts before creating
      if (selectedPlatform === "whatsapp" && (saveData.triggerKeywords.length > 0 || saveData.triggerRef)) {
        try {
          const res = await fetch("/api/whatsapp/flows")
          if (res.ok) {
            const result = await res.json()
            const otherFlows = result.flows || []
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
            // Ref conflict: hard block
            if (refConflictName) {
              setIsCreating(false)
              return
            }
            // Keyword conflict: show warning first time, proceed on second click
            if (Object.keys(warnings).length > 0 && Object.keys(conflictWarnings).length === 0) {
              setIsCreating(false)
              return
            }
          }
        } catch {
          // Network error — create anyway
        }
      }

      try {
        await onComplete({
          name: flowName,
          platform: selectedPlatform,
          triggerId: saveData.selectedTriggers[0],
          triggerIds: saveData.selectedTriggers,
          description: flowDescription.trim() || undefined,
          triggerKeywords: saveData.triggerKeywords.length > 0 ? saveData.triggerKeywords : undefined,
          triggerMatchType: saveData.triggerMatchType,
          triggerRef: saveData.triggerRef || undefined,
          waAccountId: selectedPlatform === "whatsapp" && selectedWaAccountId ? selectedWaAccountId : undefined,
          waPhoneNumber: selectedPlatform === "whatsapp" ? waAccounts.find(a => a.id === selectedWaAccountId)?.phone_number : undefined,
        })
        setFlowName("")
        setFlowDescription("")
        setSelectedPlatform("whatsapp")
        setTriggerConfig({ selectedTriggers: [], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "" })
        setSearchQuery("")
        setSelectedWaAccountId("")
      } catch (error) {
        // Don't reset state on error so user can retry
      } finally {
        setIsCreating(false)
      }
    }
  }

  const canComplete = flowName.trim().length > 0 && triggerConfig.selectedTriggers.length > 0 && !isCreating && !isTriggerConfigInvalid(triggerConfig, refConflict)

  // Prevent closing dialog while creating
  const handleOpenChange = (open: boolean) => {
    if (!open && !isCreating) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">Start automation when...</DialogTitle>
            {selectedPlatform === "whatsapp" && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">WhatsApp Account</Label>
                <Select
                  value={selectedWaAccountId}
                  onValueChange={setSelectedWaAccountId}
                  disabled={isCreating || waAccountsLoading}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[160px] text-sm border-border shadow-sm">
                    <SelectValue placeholder={waAccountsLoading ? "Loading..." : "Select account"} />
                  </SelectTrigger>
                  <SelectContent>
                    {waAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                        {acc.phone_number ? ` (${acc.phone_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3">
          <TriggerConfigPanel
            platform={selectedPlatform}
            state={triggerConfig}
            onChange={handleTriggerChange}
            waPhoneNumber={waAccounts.find(a => a.id === selectedWaAccountId)?.phone_number}
            disabled={isCreating}
            layout="full"
            conflictWarnings={conflictWarnings}
            refConflict={refConflict}
            leftColumnHeader={
              <>
                <div className="space-y-2">
                  <Label htmlFor="flow-name" className="text-sm text-muted-foreground">Flow Name</Label>
                  <Input
                    id="flow-name"
                    placeholder="e.g., Customer Support Flow"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="h-10 border-border shadow-sm"
                    disabled={isCreating}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="flow-description" className="text-sm text-muted-foreground">
                    Description <span className="text-xs text-muted-foreground/70">(Optional)</span>
                  </Label>
                  <Textarea
                    id="flow-description"
                    placeholder="Describe the purpose and context to get better AI suggestions..."
                    value={flowDescription}
                    onChange={(e) => setFlowDescription(e.target.value)}
                    className="min-h-[60px] resize-none border-border shadow-sm"
                    rows={2}
                    disabled={isCreating}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Channel</Label>
                  <div className="flex gap-2">
                    {(["whatsapp", "instagram", "web"] as Platform[]).map((platform) => (
                      <button
                        key={platform}
                        onClick={() => {
                          if (!isCreating) {
                            setSelectedPlatform(platform)
                            setTriggerConfig({ selectedTriggers: [], triggerKeywords: [], triggerMatchType: "contains_whole_word", triggerRef: "" })
                          }
                        }}
                        disabled={isCreating}
                        className={`flex-1 p-2.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${
                          selectedPlatform === platform
                            ? "border-2 border-accent bg-accent/10 shadow-sm"
                            : "border border-border hover:border-accent/50 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-7 h-7 rounded-lg ${getPlatformColor(platform)} flex items-center justify-center text-white`}>
                            {getPlatformIcon(platform, "sm")}
                          </div>
                          <span className="font-medium text-xs text-card-foreground capitalize">{platform}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

              </>
            }
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button 
            onClick={handleComplete} 
            disabled={!canComplete}
            className="min-w-[100px]"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

