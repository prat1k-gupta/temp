"use client"

import { useEffect, useRef, useState } from "react"
import type { FlowVariable } from "@/utils/flow-variables"
import { cn } from "@/lib/utils"
import { Variable, Globe, GitFork, Search, Plus } from "lucide-react"

export interface CrossFlowVariable {
  flowName: string
  flowSlug: string
  variables: string[]
}

interface VariablePickerProps {
  open: boolean
  onClose: () => void
  onSelect: (variableRef: string) => void
  flowVariables: FlowVariable[]
  globalVariables: Record<string, string>
  crossFlowVariables: CrossFlowVariable[]
  searchQuery: string
  onSearchChange?: (query: string) => void
  position: { top: number; left: number }
}

interface PickerItemProps {
  label: string
  sublabel?: string
  badge?: string
  selected: boolean
  onSelect: () => void
  colorClass: string
}

function PickerItem({ label, sublabel, badge, selected, onSelect, colorClass }: PickerItemProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" })
    }
  }, [selected])

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm text-xs transition-colors",
        selected
          ? "bg-muted/80"
          : "hover:bg-muted/40"
      )}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
    >
      <div className="flex flex-col gap-0 flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn("font-mono font-medium truncate text-[11px]", colorClass)}>
            {label}
          </span>
          {badge && (
            <span className="text-[9px] text-muted-foreground/60 italic shrink-0">
              {badge}
            </span>
          )}
        </div>
        {sublabel && (
          <span className="text-[10px] text-muted-foreground/70 truncate leading-tight">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

export function VariablePicker({
  open,
  onClose,
  onSelect,
  flowVariables,
  globalVariables,
  crossFlowVariables,
  searchQuery,
  onSearchChange,
  position,
}: VariablePickerProps) {
  const [activeTab, setActiveTab] = useState("flow")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputElRef = useRef<HTMLInputElement | null>(null)

  // Build flat items list for keyboard nav
  const globalKeys = Object.keys(globalVariables)
  const hasCrossFlow = crossFlowVariables.length > 0

  const filterQuery = searchQuery.startsWith("global.")
    ? searchQuery.slice(7)
    : searchQuery.startsWith("flow.")
      ? searchQuery.slice(5)
      : searchQuery

  const flowItems = flowVariables
    .filter((v) => !filterQuery || v.name.toLowerCase().includes(filterQuery.toLowerCase()))
    .flatMap((v) => {
      const items = [{ ref: v.name, label: v.name, sublabel: v.sourceNodeLabel, badge: undefined as string | undefined }]
      if (v.hasTitleVariant) {
        items.push({ ref: `${v.name}_title`, label: `${v.name}_title`, sublabel: v.sourceNodeLabel, badge: "display text" })
      }
      return items
    })

  const globalItems = globalKeys
    .filter((k) => !filterQuery || k.toLowerCase().includes(filterQuery.toLowerCase()))
    .map((key) => ({ ref: `global.${key}`, label: key, sublabel: String(globalVariables[key]), badge: undefined as string | undefined }))

  const crossFlowItems = crossFlowVariables
    .filter((cf) => cf.variables.length > 0)
    .flatMap((cf) =>
      cf.variables
        .filter(
          (v) =>
            !filterQuery ||
            v.toLowerCase().includes(filterQuery.toLowerCase()) ||
            cf.flowName.toLowerCase().includes(filterQuery.toLowerCase())
        )
        .map((v) => ({ ref: `flow.${cf.flowSlug}.${v}`, label: v, sublabel: cf.flowName, badge: undefined as string | undefined }))
    )

  const currentItems = activeTab === "flow" ? flowItems : activeTab === "global" ? globalItems : crossFlowItems
  const colorClass = activeTab === "flow"
    ? "text-indigo-600 dark:text-indigo-400"
    : activeTab === "global"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-purple-600 dark:text-purple-400"

  // Handle search input changes: auto-switch tab on prefix + reset selection
  const handleSearchChange = (newQuery: string) => {
    onSearchChange?.(newQuery)
    setSelectedIndex(0)
    if (newQuery.startsWith("global.")) {
      setActiveTab("global")
    } else if (newQuery.startsWith("flow.")) {
      setActiveTab("cross-flow")
    }
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setSelectedIndex(0)
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, currentItems.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        if (currentItems.length > 0) {
          onSelect(currentItems[selectedIndex]?.ref || currentItems[0].ref)
        } else if (searchQuery.trim()) {
          // No matches — create a new variable from the search text
          const varName = searchQuery.trim().replace(/[^a-zA-Z0-9_.]/g, "_")
          if (varName) onSelect(varName)
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Tab") {
        e.preventDefault()
        const tabs = ["flow", ...(globalKeys.length > 0 ? ["global"] : []), ...(hasCrossFlow ? ["cross-flow"] : [])]
        const nextIdx = (tabs.indexOf(activeTab) + 1) % tabs.length
        handleTabChange(tabs[nextIdx])
      }
    }
    document.addEventListener("keydown", handler, true)
    return () => document.removeEventListener("keydown", handler, true)
  }, [open, currentItems, selectedIndex, onSelect, onClose, activeTab, globalKeys.length, hasCrossFlow, searchQuery])

  // Click outside → close picker
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={containerRef}
      className="fixed z-[9999] w-[240px] rounded-lg border border-border/60 bg-popover/95 backdrop-blur-sm shadow-xl shadow-black/10"
      style={{ top: position.top, left: Math.max(0, position.left) }}
      onMouseDown={(e) => {
        // Prevent blur on the editor, but allow clicks on the search input
        if (e.target !== searchInputElRef.current) {
          e.preventDefault()
        }
      }}
    >
      {/* Search input */}
      <div className="relative px-1.5 pt-1.5 pb-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          ref={(el) => {
            searchInputElRef.current = el
            // Defer focus to after React effects (blur handler needs pickerOpen=true first)
            if (el) setTimeout(() => el.focus(), 0)
          }}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search variables..."
          className="w-full pl-6 pr-2 py-1 text-[11px] rounded-md border border-border/40 bg-muted/30 text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-border/60 focus:bg-muted/50 transition-colors"
          onKeyDown={(e) => {
            // Let the document-level handler manage arrow keys, enter, escape, tab
            // but don't stop normal typing
            if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)) {
              return // propagates to document handler
            }
          }}
        />
      </div>

      {/* Compact tab bar */}
      <div className="flex items-center gap-0.5 px-1.5 pb-1">
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer",
            activeTab === "flow"
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          onMouseDown={(e) => { e.preventDefault(); handleTabChange("flow") }}
        >
          <Variable className="w-3 h-3" />
          Flow
        </button>
        <button
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer",
            activeTab === "global"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          onMouseDown={(e) => { e.preventDefault(); handleTabChange("global") }}
        >
          <Globe className="w-3 h-3" />
          Global
        </button>
        {hasCrossFlow && (
          <button
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer",
              activeTab === "cross-flow"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            onMouseDown={(e) => { e.preventDefault(); handleTabChange("cross-flow") }}
          >
            <GitFork className="w-3 h-3" />
            Flows
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-1.5 border-t border-border/40" />

      {/* Items list */}
      <div className="max-h-[160px] overflow-y-auto p-1 scrollbar-thin">
        {currentItems.length === 0 ? (
          searchQuery.trim() ? (
            <div
              className="flex items-center gap-2 px-2 py-2 cursor-pointer rounded-sm text-xs hover:bg-muted/40 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                const varName = searchQuery.trim().replace(/[^a-zA-Z0-9_.]/g, "_")
                if (varName) onSelect(varName)
              }}
            >
              <Plus className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">Create</span>
              <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{`{{${searchQuery.trim()}}}`}</span>
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground/60 text-center py-4">
              {activeTab === "flow" ? "No variables — type to create" : activeTab === "global" ? "No global variables" : "No cross-flow variables"}
            </div>
          )
        ) : (
          currentItems.map((item, i) => (
            <PickerItem
              key={item.ref}
              label={item.label}
              sublabel={item.sublabel}
              badge={item.badge}
              selected={i === selectedIndex}
              onSelect={() => onSelect(item.ref)}
              colorClass={colorClass}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="mx-1.5 border-t border-border/40" />
      <div className="flex items-center gap-2 px-2 py-1">
        <span className="text-[9px] text-muted-foreground/50">
          <kbd className="px-1 py-0.5 rounded bg-muted/50 font-mono text-[8px]">&uarr;&darr;</kbd> navigate
          <span className="mx-1">&middot;</span>
          <kbd className="px-1 py-0.5 rounded bg-muted/50 font-mono text-[8px]">&crarr;</kbd> select
          <span className="mx-1">&middot;</span>
          <kbd className="px-1 py-0.5 rounded bg-muted/50 font-mono text-[8px]">esc</kbd> close
        </span>
      </div>
    </div>
  )
}
