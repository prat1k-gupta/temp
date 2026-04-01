"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Check, X, Loader2, Sparkles } from "lucide-react"
import type { Node } from "@xyflow/react"
import type { SuggestedNode, Platform } from "@/types"

interface AISuggestionsPanelProps {
  selectedNode: Node | null
  suggestions: SuggestedNode[]
  loading?: boolean
  onAccept: (suggestion: SuggestedNode) => void
  onReject: (suggestion: SuggestedNode) => void
  platform: Platform
  isOpen: boolean
  onClose: () => void
}

// All AI suggestions use FS blue to indicate they're powered by Freestand AI
const aiColors = {
  card: "border-primary/20 dark:border-primary/30",
  accent: "text-primary",
  button: "bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg",
}

export function AISuggestionsPanel({
  selectedNode,
  suggestions,
  loading = false,
  onAccept,
  onReject,
  platform,
  isOpen,
  onClose,
}: AISuggestionsPanelProps) {
  if (!isOpen) return null
  if (!selectedNode || selectedNode.type === "start" || selectedNode.type === "comment") {
    return null
  }

  const colors = aiColors

  return (
    <div className="w-80 h-full bg-background flex flex-col border-l border-2">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Freestand AI Suggestions</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <span className="sr-only">Close suggestions panel</span>×
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Freestand AI is suggesting nodes...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Sparkles className="w-8 h-8 text-primary mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground text-center">
              No suggestions available for this node
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <Card
                key={index}
                className={`p-4 ${colors.card} bg-card hover:shadow-md transition-shadow`}
              >
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-base ${colors.accent} mb-1`}>
                        {suggestion.label}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {suggestion.description || suggestion.reason}
                      </div>
                    </div>
                  </div>

                  {/* Preview content if available */}
                  {suggestion.previewContent && (
                    <div className="pt-2 border-t border-border">
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Preview:
                      </div>
                      <div className="text-sm text-foreground bg-muted/50 p-2 rounded">
                        {suggestion.previewContent}
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  {suggestion.reason && (
                    <div className="text-xs text-muted-foreground italic pt-1 border-t border-border">
                      💡 {suggestion.reason}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onAccept(suggestion)}
                      className={`flex-1 ${colors.button}`}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReject(suggestion)}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

