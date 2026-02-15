"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { Loader2, Layout, Globe } from "lucide-react"
import type { Platform } from "@/types"
import { getTriggersByPlatform } from "@/constants/triggers"

interface FlowSetupModalProps {
  open: boolean
  onClose: () => void
  onComplete: (data: {
    name: string
    platform: Platform
    triggerId: string
    description?: string
  }) => Promise<void>
}

export function FlowSetupModal({ open, onClose, onComplete }: FlowSetupModalProps) {
  const [flowName, setFlowName] = useState("")
  const [flowDescription, setFlowDescription] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("whatsapp")
  const [selectedTrigger, setSelectedTrigger] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const triggers = getTriggersByPlatform(selectedPlatform)
  const filteredTriggers = triggers.filter(
    trigger =>
      trigger.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trigger.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trigger.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getPlatformIcon = (platform: Platform, size: "sm" | "md" | "lg" = "md") => {
    const sizeClasses = {
      sm: "w-4 h-4",
      md: "w-5 h-5",
      lg: "w-8 h-8"
    }
    
    switch (platform) {
      case "web":
        return <WebIcon className={sizeClasses[size]} />
      case "whatsapp":
        return <WhatsAppIcon className={sizeClasses[size]} />
      case "instagram":
        return <InstagramIcon className={sizeClasses[size]} />
    }
  }

  const getTriggerIcon = (trigger: (typeof triggers)[0]) => {
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
    return getPlatformIcon(selectedPlatform, "sm")
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

  const handleComplete = async () => {
    if (flowName.trim() && selectedTrigger && !isCreating) {
      setIsCreating(true)
      try {
        await onComplete({
          name: flowName,
          platform: selectedPlatform,
          triggerId: selectedTrigger,
          description: flowDescription.trim() || undefined,
        })
        // Reset state only on success
        setFlowName("")
        setFlowDescription("")
        setSelectedPlatform("whatsapp")
        setSelectedTrigger("")
        setSearchQuery("")
      } catch (error) {
        // Error handling is done in parent component
        // Don't reset state on error so user can retry
      } finally {
        setIsCreating(false)
      }
    }
  }

  const canComplete = flowName.trim().length > 0 && selectedTrigger.length > 0 && !isCreating

  // Prevent closing dialog while creating
  const handleOpenChange = (open: boolean) => {
    if (!open && !isCreating) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl">Start automation when...</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-3">
          {/* Flow Name Input */}
          <div className="space-y-2 px-1">
            <Label htmlFor="flow-name" className="text-sm text-muted-foreground">Flow Name</Label>
            <Input
              id="flow-name"
              placeholder="e.g., Customer Support Flow"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="h-10"
              disabled={isCreating}
            />
          </div>

          {/* Flow Description/Context */}
          <div className="space-y-2 px-1">
            <Label htmlFor="flow-description" className="text-sm text-muted-foreground">
              What is this flow about? <span className="text-xs text-muted-foreground/70">(Optional)</span>
            </Label>
            <Textarea
              id="flow-description"
              placeholder="This will help our smart AI assistant to suggest better interactions. e.g., Customer support flow for handling product inquiries, returns, and technical issues..."
              value={flowDescription}
              onChange={(e) => setFlowDescription(e.target.value)}
              className="min-h-[80px] resize-none"
              rows={3}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Describe the purpose and context of this flow to get better AI suggestions
            </p>
          </div>

          {/* Channel Selection */}
          <div className="space-y-3 px-1">
            <Label className="text-sm text-muted-foreground">Channel</Label>
            <div className="flex gap-3">
              {(["whatsapp", "instagram", "web"] as Platform[]).map((platform) => (
                <button
                  key={platform}
                  onClick={() => {
                    if (!isCreating) {
                      setSelectedPlatform(platform)
                      setSelectedTrigger("") // Reset trigger when changing platform
                    }
                  }}
                  disabled={isCreating}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedPlatform === platform
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`w-9 h-9 rounded-lg ${getPlatformColor(platform)} flex items-center justify-center text-white`}>
                      {getPlatformIcon(platform, "sm")}
                    </div>
                    <span className="font-medium text-xs text-card-foreground capitalize">{platform}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Triggers Section */}
          <div className="space-y-2.5">
            <div className="flex items-start justify-between px-1 gap-2">
              <Label className="text-sm text-muted-foreground">
                {selectedPlatform === "web" ? "Form Type" : "Triggers"}
              </Label>
              <p className="text-[11px] text-muted-foreground text-right leading-tight">
                {selectedPlatform === "web" 
                  ? "Choose how your form will be displayed"
                  : `Specific ${selectedPlatform === "whatsapp" ? "WhatsApp" : "Instagram"} event that starts your automation.`}
              </p>
            </div>

            {/* Search Input */}
            <div className="relative px-1">
              <Input
                placeholder={`Search in ${selectedPlatform === "web" ? "Web" : selectedPlatform === "whatsapp" ? "WhatsApp" : "Instagram"}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-10"
                disabled={isCreating}
              />
              <svg 
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Trigger Options */}
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30">
              {filteredTriggers.map((trigger) => (
                <button
                  key={trigger.id}
                  onClick={() => {
                    if (!isCreating) {
                      setSelectedTrigger(trigger.id)
                    }
                  }}
                  disabled={isCreating}
                  className={`w-full p-2.5 rounded-lg border transition-all duration-200 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    selectedTrigger === trigger.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-7 h-7 rounded-full ${getPlatformColor(selectedPlatform)} flex items-center justify-center shrink-0 text-white`}>
                      {getTriggerIcon(trigger)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-muted-foreground mb-0.5">{trigger.category}</div>
                      <div className="font-medium text-card-foreground text-xs">{trigger.title}</div>
                      {trigger.description && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{trigger.description}</div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {filteredTriggers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No triggers found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isCreating}>
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

