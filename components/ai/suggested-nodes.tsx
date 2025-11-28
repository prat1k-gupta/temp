"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Check, X, Loader2, Sparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

export interface SuggestedNode {
  type: string
  label: string
  reason: string
  description: string
}

interface SuggestedNodesProps {
  suggestions: SuggestedNode[]
  loading?: boolean
  onAccept: (suggestion: SuggestedNode) => void
  onReject: (suggestion: SuggestedNode) => void
  platform: "web" | "whatsapp" | "instagram"
}

const platformColors = {
  web: {
    card: "border-blue-200 dark:border-blue-800",
    accent: "text-blue-600 dark:text-blue-400",
    button: "bg-blue-500 hover:bg-blue-600",
  },
  whatsapp: {
    card: "border-green-200 dark:border-green-800",
    accent: "text-green-600 dark:text-green-400",
    button: "bg-green-500 hover:bg-green-600",
  },
  instagram: {
    card: "border-pink-200 dark:border-pink-800",
    accent: "text-pink-600 dark:text-pink-400",
    button: "bg-pink-500 hover:bg-pink-600",
  },
}

export function SuggestedNodes({
  suggestions,
  loading = false,
  onAccept,
  onReject,
  platform,
}: SuggestedNodesProps) {
  const colors = platformColors[platform] || platformColors.web

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <Sparkles className="w-3 h-3 text-purple-500" />
          <span>AI is suggesting nodes...</span>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
        </div>
      </div>
    )
  }

  if (suggestions.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        <Sparkles className="w-3 h-3 text-purple-500" />
        <span>Suggested Nodes</span>
      </div>
      <div className="space-y-2">
        {suggestions.map((suggestion, index) => (
          <Card
            key={index}
            className={`p-3 ${colors.card} bg-card hover:shadow-sm transition-shadow`}
          >
            <div className="space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${colors.accent}`}>
                    {suggestion.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {suggestion.description || suggestion.reason}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Accept Button */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onAccept(suggestion)}
                    className={`h-7 w-7 p-0 ${colors.button}`}
                    title="Accept suggestion"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  {/* Reject Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onReject(suggestion)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                    title="Reject suggestion"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {/* Reason */}
              {suggestion.reason && (
                <div className="text-xs text-muted-foreground italic pt-1 border-t border-border">
                  💡 {suggestion.reason}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

