"use client"

import { Sparkles } from "lucide-react"

interface Suggestion {
  icon: string
  text: string
}

const SUGGESTIONS_EMPTY: Suggestion[] = [
  { icon: "✏️", text: "Create a customer feedback survey flow" },
  { icon: "🛒", text: "Build a product recommendation bot" },
  { icon: "📋", text: "Add user registration with email validation" },
]

const SUGGESTIONS_EXISTING: Suggestion[] = [
  { icon: "✨", text: "Add a follow-up question to collect feedback" },
  { icon: "🔀", text: "Add conditional routing based on the user's answer" },
  { icon: "🔍", text: "Review this flow for issues and suggest improvements" },
]

interface AIEmptyStateProps {
  hasRealNodes: boolean
  onSelectSuggestion: (text: string) => void
}

export function AIEmptyState({ hasRealNodes, onSelectSuggestion }: AIEmptyStateProps) {
  const suggestions = hasRealNodes ? SUGGESTIONS_EXISTING : SUGGESTIONS_EMPTY
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center gap-6">
      <Sparkles className="w-10 h-10 text-primary" />
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">What can I help you with?</h3>
        <p className="text-sm text-muted-foreground">Ask me to create or edit your flow</p>
      </div>
      <div className="space-y-2 w-full max-w-sm">
        {suggestions.map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onSelectSuggestion(s.text)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left text-sm cursor-pointer"
          >
            <span className="text-base">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
