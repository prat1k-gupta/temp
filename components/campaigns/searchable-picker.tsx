"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface SearchablePickerOption {
  value: string
  label: string
  description?: string
}

interface SearchablePickerProps {
  options: SearchablePickerOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
}

export function SearchablePicker({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  emptyMessage = "No results found.",
  disabled,
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  // Uses plain <button> + buttonVariants() instead of <Button> because
  // shadcn's Button component doesn't forwardRef in this project's version
  // (see magic-flow/CLAUDE.md Learnings) — PopoverTrigger asChild needs a
  // ref forwarded from its child, and <Button> silently drops the ref which
  // breaks click handling.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between font-normal cursor-pointer",
          !value && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-(--radix-popover-trigger-width) min-w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className="cursor-pointer hover:bg-muted"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
