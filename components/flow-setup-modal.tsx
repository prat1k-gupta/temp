"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import type { Platform } from "@/types"
import { getTriggersByPlatform } from "@/constants/triggers"

interface FlowSetupModalProps {
  open: boolean
  onClose: () => void
  onComplete: (data: {
    name: string
    platform: Platform
    triggerId: string
  }) => void
}

export function FlowSetupModal({ open, onClose, onComplete }: FlowSetupModalProps) {
  const [flowName, setFlowName] = useState("")
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("whatsapp")
  const [selectedTrigger, setSelectedTrigger] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")

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

  const handleComplete = () => {
    if (flowName.trim() && selectedTrigger) {
      onComplete({
        name: flowName,
        platform: selectedPlatform,
        triggerId: selectedTrigger,
      })
      // Reset state
      setFlowName("")
      setSelectedPlatform("whatsapp")
      setSelectedTrigger("")
      setSearchQuery("")
    }
  }

  const canComplete = flowName.trim().length > 0 && selectedTrigger.length > 0

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Start automation when...</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Flow Name Input */}
          <div className="space-y-2 px-1">
            <Label htmlFor="flow-name" className="text-sm text-muted-foreground">Flow Name</Label>
            <Input
              id="flow-name"
              placeholder="e.g., Customer Support Flow"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Channel Selection */}
          <div className="space-y-3 px-1">
            <Label className="text-sm text-muted-foreground">Channel</Label>
            <div className="flex gap-3">
              {(["whatsapp", "instagram", "web"] as Platform[]).map((platform) => (
                <button
                  key={platform}
                  onClick={() => {
                    setSelectedPlatform(platform)
                    setSelectedTrigger("") // Reset trigger when changing platform
                  }}
                  className={`flex-1 p-4 rounded-lg border-2 transition-all duration-200 ${
                    selectedPlatform === platform
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-12 h-12 rounded-lg ${getPlatformColor(platform)} flex items-center justify-center text-white`}>
                      {getPlatformIcon(platform, "md")}
                    </div>
                    <span className="font-medium text-sm text-card-foreground capitalize">{platform}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Triggers Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <Label className="text-sm text-muted-foreground">Triggers</Label>
              <p className="text-xs text-muted-foreground">
                Specific {selectedPlatform === "web" ? "Web" : selectedPlatform === "whatsapp" ? "WhatsApp" : "Instagram"} event that starts your automation.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative px-1">
              <Input
                placeholder={`Search in ${selectedPlatform === "web" ? "Web" : selectedPlatform === "whatsapp" ? "WhatsApp" : "Instagram"}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 pl-10"
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
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {filteredTriggers.map((trigger) => (
                <button
                  key={trigger.id}
                  onClick={() => setSelectedTrigger(trigger.id)}
                  className={`w-full p-3 rounded-lg border transition-all duration-200 text-left ${
                    selectedTrigger === trigger.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50 hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full ${getPlatformColor(selectedPlatform)} flex items-center justify-center shrink-0 text-white`}>
                      {getPlatformIcon(selectedPlatform, "sm")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">{trigger.category}</div>
                      <div className="font-medium text-card-foreground text-sm">{trigger.title}</div>
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleComplete} 
            disabled={!canComplete}
            className="min-w-[100px]"
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

