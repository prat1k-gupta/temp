"use client"

import { useRef } from "react"
import { cn } from "@/lib/utils"
import { usePillClick } from "./pill-click-context"

interface VariablePillProps {
  displayName: string
  varType: string
  nodeKey: string
}

export function VariablePill({ displayName, varType, nodeKey }: VariablePillProps) {
  const spanRef = useRef<HTMLSpanElement>(null)
  const onPillClick = usePillClick()

  return (
    <span
      ref={spanRef}
      className={cn(
        "inline-flex items-center px-1 py-px rounded text-[10px] font-mono font-medium mx-0.5 select-none cursor-pointer align-text-bottom leading-normal",
        varType === "flow" &&
          "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
        varType === "global" &&
          "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
        varType === "cross-flow" &&
          "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
        varType === "system" &&
          "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
        varType === "unknown" &&
          "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      )}
      contentEditable={false}
      suppressContentEditableWarning
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (spanRef.current && onPillClick) {
          const rect = spanRef.current.getBoundingClientRect()
          onPillClick(nodeKey, rect)
        }
      }}
    >
      {displayName}
    </span>
  )
}
