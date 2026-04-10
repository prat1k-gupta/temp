"use client"

import { useState, useCallback } from "react"
import { Filter, X, ChevronRight, Search, Check, Plus, Trash2, Tag, GitBranch, Variable } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useContactTags, useContactVariables } from "@/hooks/queries/use-contact-filters"
import { useChatbotFlows } from "@/hooks/queries"
import { cn } from "@/lib/utils"
import type { ContactFilter } from "@/types/chat"

// --- Cascader step types ---
type CascaderStep =
  | { type: "root" }
  | { type: "tag_op" }
  | { type: "tag_select"; op: string }
  | { type: "flow_op" }
  | { type: "flow_select"; op: string }
  | { type: "var_flow" }
  | { type: "var_name"; flowSlug: string; flowName: string }
  | { type: "var_op"; flowSlug: string; flowName: string; name: string }
  | { type: "var_value"; flowSlug: string; flowName: string; name: string; op: string }

// --- Tree helpers ---
export function countLeaves(f: ContactFilter): number {
  if (f.logic && f.filters) return f.filters.reduce((sum, c) => sum + countLeaves(c), 0)
  return f.type ? 1 : 0
}

// --- Main hook ---
interface ContactFilterUIProps {
  rootFilter: ContactFilter
  onRootFilterChange: (f: ContactFilter) => void
}

export function useContactFilterUI({ rootFilter, onRootFilterChange }: ContactFilterUIProps) {
  const [cascaderOpen, setCascaderOpen] = useState(false)
  const [cascaderStep, setCascaderStep] = useState<CascaderStep>({ type: "root" })
  const [cascaderSearch, setCascaderSearch] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [targetGroupIndex, setTargetGroupIndex] = useState<number | null>(null)

  const resetCascader = useCallback(() => {
    setCascaderStep({ type: "root" })
    setCascaderSearch("")
    setSelectedTags([])
  }, [])

  const openCascaderForGroup = useCallback((groupIndex: number) => {
    setTargetGroupIndex(groupIndex)
    setCascaderOpen(true)
    resetCascader()
  }, [resetCascader])

  const addFilter = useCallback((filter: ContactFilter) => {
    const groups = [...(rootFilter.filters ?? [])]
    if (targetGroupIndex !== null && targetGroupIndex < groups.length) {
      const group = groups[targetGroupIndex]
      groups[targetGroupIndex] = { ...group, filters: [...(group.filters ?? []), filter] }
    }
    onRootFilterChange({ ...rootFilter, filters: groups })
    setCascaderOpen(false)
    resetCascader()
  }, [rootFilter, targetGroupIndex, onRootFilterChange, resetCascader])

  const applyTagFilter = useCallback((op: string) => {
    if (selectedTags.length === 0) return
    addFilter({ type: "tag", op, values: selectedTags })
    setSelectedTags([])
  }, [selectedTags, addFilter])

  const totalFilters = countLeaves(rootFilter)
  const hasFilters = totalFilters > 0

  return {
    filterButton: (
      <Popover open={cascaderOpen} onOpenChange={(o) => { setCascaderOpen(o); if (!o) resetCascader() }}>
        <PopoverTrigger asChild>
          <button
            onClick={() => {
              // If no groups, create one first
              if ((rootFilter.filters ?? []).length === 0) {
                onRootFilterChange({ ...rootFilter, filters: [{ logic: "and", filters: [] }] })
                setTargetGroupIndex(0)
              } else {
                setTargetGroupIndex(0)
              }
            }}
            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 h-9 text-xs font-medium hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
          >
            <Filter className="h-3.5 w-3.5" />
            {totalFilters > 0 && (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{totalFilters}</Badge>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="w-auto p-0">
          <MultiColumnCascader
            step={cascaderStep} setStep={setCascaderStep}
            search={cascaderSearch} setSearch={setCascaderSearch}
            selectedTags={selectedTags} setSelectedTags={setSelectedTags}
            onAddFilter={addFilter} onApplyTagFilter={applyTagFilter}
          />
        </PopoverContent>
      </Popover>
    ),

    filterTree: hasFilters ? (
      <div className="px-3 pb-2 space-y-2">
        {/* Top-level logic */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Match</span>
          <button
            onClick={() => onRootFilterChange({
              ...rootFilter,
              logic: rootFilter.logic === "and" ? "or" : "and"
            })}
            className="text-xs text-primary font-medium hover:underline cursor-pointer"
          >
            {rootFilter.logic === "and" ? "all" : "any"}
          </button>
          <span className="text-xs text-muted-foreground">of the following</span>
        </div>

        {/* Groups */}
        {(rootFilter.filters ?? []).map((group, groupIndex) => (
          <FilterGroupCard
            key={groupIndex}
            group={group}
            groupIndex={groupIndex}
            totalGroups={(rootFilter.filters ?? []).length}
            onGroupChange={(updated) => {
              const groups = [...(rootFilter.filters ?? [])]
              groups[groupIndex] = updated
              onRootFilterChange({ ...rootFilter, filters: groups })
            }}
            onGroupRemove={() => {
              const groups = (rootFilter.filters ?? []).filter((_, i) => i !== groupIndex)
              onRootFilterChange({ ...rootFilter, filters: groups })
            }}
            onAddCondition={() => openCascaderForGroup(groupIndex)}
          />
        ))}

        {/* Add Group + Clear */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newGroup: ContactFilter = { logic: "and", filters: [] }
              onRootFilterChange({ ...rootFilter, filters: [...(rootFilter.filters ?? []), newGroup] })
            }}
            className="text-xs h-7 cursor-pointer flex-1"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Group
          </Button>
          <button
            onClick={() => onRootFilterChange({ logic: "and", filters: [] })}
            className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Clear all
          </button>
        </div>
      </div>
    ) : null,
  }
}

// --- Group card (matches condition node pattern) ---
function FilterGroupCard({
  group, groupIndex, totalGroups, onGroupChange, onGroupRemove, onAddCondition,
}: {
  group: ContactFilter
  groupIndex: number
  totalGroups: number
  onGroupChange: (g: ContactFilter) => void
  onGroupRemove: () => void
  onAddCondition: () => void
}) {
  const rules = (group.filters ?? []).filter((f) => f.type)

  return (
    <div className="space-y-2 p-2.5 bg-muted/10 rounded-lg border border-border">
      {/* Group header */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Group {groupIndex + 1}</Label>
        {totalGroups > 1 && (
          <button onClick={onGroupRemove} className="h-5 w-5 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive rounded cursor-pointer">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Group logic toggle */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">Match</span>
        <div className="flex gap-0.5">
          <button
            onClick={() => onGroupChange({ ...group, logic: "and" })}
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium rounded cursor-pointer transition-colors",
              (group.logic === "and" || !group.logic)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            ALL
          </button>
          <button
            onClick={() => onGroupChange({ ...group, logic: "or" })}
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium rounded cursor-pointer transition-colors",
              group.logic === "or"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            ANY
          </button>
        </div>
        <span className="text-[10px] text-muted-foreground">of these</span>
      </div>

      {/* Rules */}
      <div className="space-y-1">
        {rules.map((rule, ruleIndex) => (
          <div
            key={ruleIndex}
            className="flex items-center gap-1.5 px-2 py-1.5 bg-background rounded-md border border-border group"
          >
            <span className="text-[11px] flex-1 truncate">
              <RuleLabel filter={rule} />
            </span>
            <button
              onClick={() => {
                const newFilters = (group.filters ?? []).filter((_, i) => i !== ruleIndex)
                onGroupChange({ ...group, filters: newFilters })
              }}
              className="h-4 w-4 flex items-center justify-center hover:bg-destructive/10 hover:text-destructive rounded cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add condition */}
      <button
        onClick={onAddCondition}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[10px] text-primary border border-dashed border-primary/30 rounded-md hover:bg-primary/5 cursor-pointer transition-colors"
      >
        <Plus className="h-3 w-3" />
        Add Condition
      </button>
    </div>
  )
}

// --- Rule label ---
function RuleLabel({ filter }: { filter: ContactFilter }) {
  switch (filter.type) {
    case "tag":
      return (
        <>
          <Tag className="inline h-3 w-3 text-muted-foreground mr-1" />
          <span className="font-medium">{filter.op === "is" ? "is" : "is not"}</span>
          {" "}
          <span className="text-muted-foreground">{(filter.values ?? []).join(", ")}</span>
        </>
      )
    case "flow": {
      const ops: Record<string, string> = { active: "active", any: "any", never: "never" }
      return (
        <>
          <GitBranch className="inline h-3 w-3 text-muted-foreground mr-1" />
          <span className="font-medium">{ops[filter.op ?? ""] ?? filter.op}</span>
          {" "}
          <span className="text-muted-foreground">{filter.flowName ?? filter.flowSlug}</span>
        </>
      )
    }
    case "variable":
      return (
        <>
          <Variable className="inline h-3 w-3 text-muted-foreground mr-1" />
          <span className="font-medium">{filter.name}</span>
          {" "}
          <span className="text-muted-foreground">{filter.op}</span>
          {filter.value && <> <span className="font-medium">{filter.value}</span></>}
        </>
      )
    default:
      return null
  }
}

// --- Multi-column cascader (unchanged) ---
function MultiColumnCascader({
  step, setStep, search, setSearch, selectedTags, setSelectedTags, onAddFilter, onApplyTagFilter,
}: {
  step: CascaderStep; setStep: (s: CascaderStep) => void
  search: string; setSearch: (s: string) => void
  selectedTags: string[]; setSelectedTags: (t: string[]) => void
  onAddFilter: (f: ContactFilter) => void; onApplyTagFilter: (op: string) => void
}) {
  const activeType = step.type === "root" ? null
    : step.type.startsWith("tag") ? "Tag"
    : step.type.startsWith("flow") ? "Flow"
    : "Variable"

  const col1 = (
    <CascaderColumn>
      <CascaderList items={[
        { label: "Tag", icon: <Tag className="h-3.5 w-3.5 text-muted-foreground" />, active: activeType === "Tag", onClick: () => { setStep({ type: "tag_op" }); setSearch(""); setSelectedTags([]) } },
        { label: "Flow", icon: <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />, active: activeType === "Flow", onClick: () => { setStep({ type: "flow_op" }); setSearch("") } },
        { label: "Variable", icon: <Variable className="h-3.5 w-3.5 text-muted-foreground" />, active: activeType === "Variable", onClick: () => { setStep({ type: "var_flow" }); setSearch("") } },
      ]} />
    </CascaderColumn>
  )

  const columns: React.ReactNode[] = [col1]

  if (step.type === "tag_op" || step.type === "tag_select") {
    const activeOp = step.type === "tag_select" ? step.op : null
    columns.push(
      <CascaderColumn key="tag_op">
        <CascaderList items={[
          { label: "is", active: activeOp === "is", onClick: () => { setStep({ type: "tag_select", op: "is" }); setSearch("") } },
          { label: "is not", active: activeOp === "is_not", onClick: () => { setStep({ type: "tag_select", op: "is_not" }); setSearch("") } },
        ]} />
      </CascaderColumn>
    )
  }
  if (step.type === "tag_select") {
    columns.push(
      <CascaderColumn key="tag_select" wide>
        <TagSelector search={search} setSearch={setSearch} selectedTags={selectedTags} setSelectedTags={setSelectedTags} onApply={() => onApplyTagFilter(step.op)} />
      </CascaderColumn>
    )
  }

  if (step.type === "flow_op" || step.type === "flow_select") {
    const activeOp = step.type === "flow_select" ? step.op : null
    columns.push(
      <CascaderColumn key="flow_op">
        <CascaderList items={[
          { label: "active", desc: "in flow now", active: activeOp === "active", onClick: () => { setStep({ type: "flow_select", op: "active" }); setSearch("") } },
          { label: "any", desc: "ran this flow", active: activeOp === "any", onClick: () => { setStep({ type: "flow_select", op: "any" }); setSearch("") } },
          { label: "never", desc: "never ran", active: activeOp === "never", onClick: () => { setStep({ type: "flow_select", op: "never" }); setSearch("") } },
        ]} />
      </CascaderColumn>
    )
  }
  if (step.type === "flow_select") {
    columns.push(
      <CascaderColumn key="flow_select" wide>
        <FlowSelector search={search} setSearch={setSearch} onSelect={(slug, name) => onAddFilter({ type: "flow", op: step.op, flowSlug: slug, flowName: name })} />
      </CascaderColumn>
    )
  }

  if (step.type === "var_flow" || step.type === "var_name" || step.type === "var_op" || step.type === "var_value") {
    columns.push(
      <CascaderColumn key="var_flow" wide>
        <FlowSelector search={step.type === "var_flow" ? search : ""} setSearch={setSearch} onSelect={(slug, name) => { setStep({ type: "var_name", flowSlug: slug, flowName: name }); setSearch("") }} />
      </CascaderColumn>
    )
  }
  if (step.type === "var_name" || step.type === "var_op" || step.type === "var_value") {
    const s = step as { flowSlug: string; flowName: string }
    columns.push(
      <CascaderColumn key="var_name">
        <VariableNameSelector flowSlug={s.flowSlug} search={step.type === "var_name" ? search : ""} setSearch={setSearch} onSelect={(name) => { setStep({ type: "var_op", flowSlug: s.flowSlug, flowName: s.flowName, name }); setSearch("") }} />
      </CascaderColumn>
    )
  }
  if (step.type === "var_op" || step.type === "var_value") {
    const s = step as { flowSlug: string; flowName: string; name: string }
    const activeVarOp = step.type === "var_value" ? step.op : null
    columns.push(
      <CascaderColumn key="var_op">
        <CascaderList items={[
          { label: "is", active: activeVarOp === "is", onClick: () => setStep({ type: "var_value", flowSlug: s.flowSlug, flowName: s.flowName, name: s.name, op: "is" }) },
          { label: "is not", active: activeVarOp === "is_not", onClick: () => setStep({ type: "var_value", flowSlug: s.flowSlug, flowName: s.flowName, name: s.name, op: "is_not" }) },
          { label: "has any value", onClick: () => onAddFilter({ type: "variable", op: "has_any_value", flowSlug: s.flowSlug, flowName: s.flowName, name: s.name }) },
          { label: "contains", active: activeVarOp === "contains", onClick: () => setStep({ type: "var_value", flowSlug: s.flowSlug, flowName: s.flowName, name: s.name, op: "contains" }) },
          { label: "is unknown", onClick: () => onAddFilter({ type: "variable", op: "is_unknown", flowSlug: s.flowSlug, flowName: s.flowName, name: s.name }) },
        ]} />
      </CascaderColumn>
    )
  }
  if (step.type === "var_value") {
    columns.push(
      <CascaderColumn key="var_value">
        <ValueInput onApply={(value) => onAddFilter({ type: "variable", op: step.op, flowSlug: step.flowSlug, flowName: step.flowName, name: step.name, value })} />
      </CascaderColumn>
    )
  }

  return <div className="flex max-h-[280px]">{columns}</div>
}

// --- Shared sub-components ---
function CascaderColumn({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={cn("border-r last:border-r-0 flex flex-col overflow-hidden", wide ? "w-[200px]" : "w-[150px]")}>{children}</div>
}

function CascaderList({ items }: { items: { label: string; desc?: string; icon?: React.ReactNode; active?: boolean; onClick: () => void }[] }) {
  return (
    <div className="py-1">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          className={cn(
            "w-full flex items-center justify-between gap-1 px-3 hover:bg-muted cursor-pointer",
            item.desc ? "py-1.5" : "py-2",
            item.active && "bg-muted font-medium"
          )}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
            <span className="min-w-0 text-left">
              <span className="text-sm truncate block">{item.label}</span>
              {item.desc && <span className="text-[10px] text-muted-foreground block">{item.desc}</span>}
            </span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        </button>
      ))}
    </div>
  )
}

function TagSelector({ search, setSearch, selectedTags, setSelectedTags, onApply }: {
  search: string; setSearch: (s: string) => void
  selectedTags: string[]; setSelectedTags: (t: string[]) => void; onApply: () => void
}) {
  const { data, isLoading } = useContactTags(search)
  const tags = data?.tags ?? []
  const toggle = (tag: string) => setSelectedTags(selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag])

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tags..." className="pl-7 h-8 text-xs" onKeyDown={(e) => e.stopPropagation()} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        : tags.length === 0 ? <div className="p-4 text-center text-xs text-muted-foreground">No tags found</div>
        : <div className="py-1">{tags.map((tag) => (
            <button key={tag} onClick={() => toggle(tag)} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer">
              <div className={cn("h-4 w-4 rounded border flex items-center justify-center flex-shrink-0", selectedTags.includes(tag) && "bg-primary border-primary")}>
                {selectedTags.includes(tag) && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="truncate">{tag}</span>
            </button>
          ))}</div>}
      </div>
      {selectedTags.length > 0 && (
        <div className="p-2 border-t flex-shrink-0">
          <Button size="sm" className="w-full h-7 text-xs cursor-pointer" onClick={onApply}>Apply ({selectedTags.length})</Button>
        </div>
      )}
    </div>
  )
}

function FlowSelector({ search, setSearch, onSelect }: {
  search: string; setSearch: (s: string) => void; onSelect: (slug: string, name: string) => void
}) {
  const { data, isLoading } = useChatbotFlows()
  const flows = data ?? []
  const filtered = search ? flows.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()) || f.flowSlug?.toLowerCase().includes(search.toLowerCase())) : flows

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search flows..." className="pl-7 h-8 text-xs" onKeyDown={(e) => e.stopPropagation()} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        : filtered.length === 0 ? <div className="p-4 text-center text-xs text-muted-foreground">No flows found</div>
        : <div className="py-1">{filtered.map((flow) => (
            <button key={flow.id} onClick={() => onSelect(flow.flowSlug, flow.name)} className="w-full text-left px-3 py-2 hover:bg-muted cursor-pointer overflow-hidden">
              <div className="text-sm truncate">{flow.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{flow.flowSlug}</div>
            </button>
          ))}</div>}
      </div>
    </div>
  )
}

function VariableNameSelector({ flowSlug, search, setSearch, onSelect }: {
  flowSlug: string; search: string; setSearch: (s: string) => void; onSelect: (name: string) => void
}) {
  const { data, isLoading } = useContactVariables(flowSlug, search)
  const variables = data?.variables ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search variables..." className="pl-7 h-8 text-xs" onKeyDown={(e) => e.stopPropagation()} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        : variables.length === 0 ? <div className="p-4 text-center text-xs text-muted-foreground">No variables found</div>
        : <div className="py-1">{variables.map((v) => (
            <button key={v} onClick={() => onSelect(v)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer break-all line-clamp-2" title={v}>{v}</button>
          ))}</div>}
      </div>
    </div>
  )
}

function ValueInput({ onApply }: { onApply: (value: string) => void }) {
  const [value, setValue] = useState("")
  return (
    <div className="p-3">
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Enter value..." className="h-8 text-sm mb-2"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && value.trim()) onApply(value.trim()) }} autoFocus />
      <Button size="sm" className="w-full h-7 text-xs cursor-pointer" disabled={!value.trim()} onClick={() => onApply(value.trim())}>Apply</Button>
    </div>
  )
}
