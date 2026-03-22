"use client"

import { useState, useRef, useEffect } from "react"
import { Variable } from "lucide-react"

interface StoreAsPillProps {
  storeAs: string
  onUpdate: (value: string) => void
  flowVariables?: string[]
  placeholder?: string
  /** Auto-suggested name pre-filled when user clicks an empty pill */
  suggestedName?: string
}

function sanitizeVariableName(value: string, trimEdges = false): string {
  let result = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 30)
  if (trimEdges) result = result.replace(/^_+|_+$/g, "")
  return result
}

export function StoreAsPill({ storeAs, onUpdate, flowVariables = [], placeholder = "Save response as...", suggestedName }: StoreAsPillProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(storeAs || "")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const isDuplicate = editValue.trim() !== "" &&
    editValue.trim() !== storeAs &&
    flowVariables.includes(editValue.trim())

  const startEditing = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Pre-fill with suggested name when opening an empty pill
    const prefill = storeAs || (suggestedName ? sanitizeVariableName(suggestedName) : "")
    setEditValue(prefill)
    setIsEditing(true)
  }

  const finishEditing = () => {
    const sanitized = sanitizeVariableName(editValue, true)
    onUpdate(sanitized)
    setIsEditing(false)
  }

  const cancelEditing = () => {
    setEditValue(storeAs || "")
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30">
          <Variable className="w-3 h-3 text-indigo-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(sanitizeVariableName(e.target.value))}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishEditing()
              if (e.key === "Escape") cancelEditing()
            }}
            className="bg-transparent text-xs text-indigo-700 dark:text-indigo-300 outline-none w-full min-w-[80px] font-mono"
            placeholder="variable_name"
            maxLength={30}
          />
        </div>
        {isDuplicate && (
          <span className="text-[10px] text-amber-600 px-2">Variable already in use</span>
        )}
      </div>
    )
  }

  if (storeAs) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 cursor-pointer hover:bg-indigo-200/70 dark:hover:bg-indigo-900/60 transition-colors"
        onClick={startEditing}
      >
        <Variable className="w-3 h-3 text-indigo-500" />
        <span className="text-xs font-mono text-indigo-700 dark:text-indigo-300">{storeAs}</span>
      </div>
    )
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-muted-foreground/30 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors"
      onClick={startEditing}
    >
      <Variable className="w-3 h-3 text-muted-foreground/50" />
      <span className="text-xs text-muted-foreground/50">{placeholder}</span>
    </div>
  )
}
