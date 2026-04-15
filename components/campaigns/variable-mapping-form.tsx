"use client"

import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VariableMappingFormProps {
  /** Variable names that need values (e.g. ["customer_name", "city"]) */
  variables: string[]
  /** Available source columns (e.g. ["name", "city", "pincode"] from SC) */
  availableColumns: string[]
  /** Current mapping: variable name → column name */
  value: Record<string, string>
  /** Called when mapping changes */
  onChange: (next: Record<string, string>) => void
}

const DONT_MAP = "__dont_map__"

export function VariableMappingForm({
  variables,
  availableColumns,
  value,
  onChange,
}: VariableMappingFormProps) {
  const sortedVars = useMemo(() => [...variables].sort(), [variables])

  const handleChange = (variable: string, column: string) => {
    const next = { ...value }
    if (column === DONT_MAP) {
      delete next[variable]
    } else {
      next[variable] = column
    }
    onChange(next)
  }

  if (variables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This template/flow has no variables that need mapping.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-medium">Map variables to audience columns</Label>
      <div className="grid gap-2">
        {sortedVars.map((variable) => (
          <div key={variable} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <code className="text-sm font-mono px-2 py-1 rounded bg-muted">
              {`{{${variable}}}`}
            </code>
            <span className="text-muted-foreground text-sm">→</span>
            <Select
              value={value[variable] ?? DONT_MAP}
              onValueChange={(col) => handleChange(variable, col)}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Pick a column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DONT_MAP} className="cursor-pointer">
                  Don&apos;t map
                </SelectItem>
                {availableColumns.map((col) => (
                  <SelectItem key={col} value={col} className="cursor-pointer">
                    {col}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  )
}
