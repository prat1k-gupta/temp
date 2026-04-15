"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Check, X } from "lucide-react"
import type { ChoiceData, Platform } from "@/types"

interface AIButtonSuggestionsProps {
  suggestedButtons: ChoiceData[]
  maxButtons?: number
  platform: Platform
  loading?: boolean
  onGenerateMore: () => void
  onAccept: () => void
  onCancel: () => void
}

const aiColors = {
  badge: "bg-primary hover:bg-primary/90",
  text: "text-primary",
  border: "border-primary/20 dark:border-primary/30",
  hover: "hover:bg-primary/5 dark:hover:bg-primary/10",
  button: "bg-primary hover:bg-primary/90"
}

export function AIButtonSuggestions({
  suggestedButtons,
  maxButtons = 10,
  loading = false,
  onGenerateMore,
  onAccept,
  onCancel
}: AIButtonSuggestionsProps) {
  const colors = aiColors
  const canGenerateMore = suggestedButtons.length < maxButtons

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${colors.text}`}>
          Freestand AI Suggestions ({suggestedButtons.length}/{maxButtons})
        </span>
      </div>

      {/* Suggested Buttons as Badges */}
      <div className="space-y-1.5">
        {suggestedButtons.map((button, index) => (
          <Badge 
            key={index} 
            variant="default" 
            className={`text-xs w-full justify-start ${colors.badge}`}
          >
            {button.text || button.label}
          </Badge>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-1.5 pt-1">
        {/* Generate More */}
        {canGenerateMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onGenerateMore()
            }}
            onMouseDown={(e) => e.preventDefault()}
            disabled={loading}
            className={`w-full h-7 px-2 text-xs gap-1.5 ${colors.border} ${colors.hover}`}
          >
            {loading ? (
              <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="text-primary font-medium">
              Add More ({suggestedButtons.length}/{maxButtons})
            </span>
          </Button>
        )}

        {/* Accept & Convert */}
        <Button
          variant="default"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onAccept()
          }}
          className={`w-full h-7 px-2 text-xs gap-1.5 ${colors.button}`}
        >
          <Check className="w-3.5 h-3.5" />
          <span className="font-medium">Accept & Convert to Quick Reply</span>
        </Button>

        {/* Cancel */}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }}
          className="w-full h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-red-600"
        >
          <X className="w-3 h-3" />
          <span>Cancel</span>
        </Button>
      </div>
    </div>
  )
}

