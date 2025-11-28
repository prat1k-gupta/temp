"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Check, X } from "lucide-react"
import type { ButtonData, Platform } from "@/types"

interface AIButtonSuggestionsProps {
  suggestedButtons: ButtonData[]
  maxButtons?: number
  platform: Platform
  loading?: boolean
  onGenerateMore: () => void
  onAccept: () => void
  onCancel: () => void
}

const platformColors = {
  web: {
    badge: "bg-blue-500 hover:bg-blue-600",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-purple-200 dark:border-purple-800",
    hover: "hover:bg-purple-50 dark:hover:bg-purple-900/20",
    button: "bg-blue-500 hover:bg-blue-600"
  },
  whatsapp: {
    badge: "bg-green-500 hover:bg-green-600",
    text: "text-green-600 dark:text-green-400",
    border: "border-purple-200 dark:border-purple-800",
    hover: "hover:bg-purple-50 dark:hover:bg-purple-900/20",
    button: "bg-green-500 hover:bg-green-600"
  },
  instagram: {
    badge: "bg-pink-500 hover:bg-pink-600",
    text: "text-pink-600 dark:text-pink-400",
    border: "border-purple-200 dark:border-purple-800",
    hover: "hover:bg-purple-50 dark:hover:bg-purple-900/20",
    button: "bg-pink-500 hover:bg-pink-600"
  }
}

export function AIButtonSuggestions({
  suggestedButtons,
  maxButtons = 10,
  platform,
  loading = false,
  onGenerateMore,
  onAccept,
  onCancel
}: AIButtonSuggestionsProps) {
  const colors = platformColors[platform] || platformColors.web
  const canGenerateMore = suggestedButtons.length < maxButtons

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${colors.text}`}>
          AI Suggestions ({suggestedButtons.length}/{maxButtons})
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
              <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            )}
            <span className="text-purple-600 dark:text-purple-400 font-medium">
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

