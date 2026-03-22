"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"

interface VariableHighlightTextProps {
  text: string
  flowVariables?: string[]
  className?: string
}

export function VariableHighlightText({
  text,
  flowVariables = [],
  className,
}: VariableHighlightTextProps) {
  const parts = useMemo(() => {
    if (!text) return []

    const flowVarSet = new Set(flowVariables)
    for (const v of flowVariables) flowVarSet.add(`${v}_title`)

    const segments: Array<{ type: "text" | "var"; content: string; displayName: string; varType: string }> = []
    const regex = /\{\{([^}]+)\}\}/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", content: text.slice(lastIndex, match.index), displayName: "", varType: "" })
      }

      const varName = match[1].trim()
      let varType = "unknown"
      let displayName = varName

      if (flowVarSet.has(varName)) {
        varType = "flow"
      } else if (flowVariables.length === 0 && !varName.startsWith("global.") && !varName.startsWith("flow.")) {
        // No flow context (e.g. template preview) — treat bare vars as session variables
        varType = "flow"
      } else if (varName.startsWith("global.")) {
        varType = "global"
        displayName = varName.slice(7) // strip "global." prefix
      } else if (varName.startsWith("flow.")) {
        varType = "cross-flow"
        // "flow.slug.var" → show just "var"
        const parts = varName.split(".")
        displayName = parts.length >= 3 ? parts.slice(2).join(".") : varName
      }

      segments.push({ type: "var", content: match[0], displayName, varType })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      segments.push({ type: "text", content: text.slice(lastIndex), displayName: "", varType: "" })
    }

    return segments
  }, [text, flowVariables])

  if (!text) return null
  if (parts.length === 0 || parts.every((p) => p.type === "text")) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={i}>{part.content}</span>
        }

        const pillClasses = cn(
          "inline-flex items-center px-1 py-px rounded text-[10px] font-mono font-medium mx-0.5 align-text-bottom leading-normal",
          part.varType === "flow" &&
            "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
          part.varType === "global" &&
            "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
          part.varType === "cross-flow" &&
            "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
          part.varType === "unknown" &&
            "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        )

        return (
          <span key={i} className={pillClasses}>
            {part.displayName}
          </span>
        )
      })}
    </span>
  )
}
