"use client"

import { useMemo, useState } from "react"
import { format, startOfDay } from "date-fns"
import { Calendar as CalendarIcon, Clock } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  /** Naive local-time string `YYYY-MM-DDTHH:mm` (matches datetime-local input). */
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /** Minute step for the minute select. Default 5. */
  minuteStep?: number
}

/**
 * Combined date + time picker that emits the same naive-local ISO string as
 * a native `<input type="datetime-local">`. Uses shadcn Calendar (popover)
 * for the date and three Select dropdowns for hour / minute / meridiem
 * (12-hour display). Calling code continues to convert via
 * `new Date(value).toISOString()` the same way.
 */
export function DateTimePicker({
  value,
  onChange,
  disabled,
  minuteStep = 5,
}: DateTimePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)

  // Parse `YYYY-MM-DDTHH:mm` → Date in local time. If value is empty or bad,
  // fall back to undefined so the calendar shows no selection.
  const parsed = useMemo(() => {
    if (!value) return undefined
    const d = new Date(value)
    return isNaN(d.getTime()) ? undefined : d
  }, [value])

  // 24-hour components from the stored Date.
  const hour24 = parsed ? parsed.getHours() : undefined
  const minute = parsed ? parsed.getMinutes() : undefined

  // Derive 12-hour display components.
  const meridiem: "AM" | "PM" | undefined =
    hour24 === undefined ? undefined : hour24 >= 12 ? "PM" : "AM"
  const hour12: number | undefined =
    hour24 === undefined ? undefined : hour24 % 12 === 0 ? 12 : hour24 % 12

  const hours12 = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1),
    [],
  )
  const minutes = useMemo(() => {
    const step = Math.max(1, minuteStep)
    return Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step)
  }, [minuteStep])

  const toLocalISO = (d: Date) => {
    // Match the datetime-local input format: YYYY-MM-DDTHH:mm (no seconds, no TZ).
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  /** Convert 12-hour {hour12, meridiem} back to a 0–23 hour. */
  const to24h = (h12: number, m: "AM" | "PM"): number => {
    if (m === "AM") return h12 === 12 ? 0 : h12
    return h12 === 12 ? 12 : h12 + 12
  }

  const updateDate = (next: Date | undefined) => {
    if (!next) {
      onChange("")
      setCalendarOpen(false)
      return
    }
    const base = new Date(next)
    if (parsed) {
      // Preserve existing time.
      base.setHours(parsed.getHours(), parsed.getMinutes(), 0, 0)
    } else {
      // Default to the next full hour.
      const now = new Date()
      base.setHours(now.getHours() + 1, 0, 0, 0)
    }
    onChange(toLocalISO(base))
    setCalendarOpen(false)
  }

  const updateHour12 = (h: string) => {
    const base = parsed ?? new Date()
    const next = new Date(base)
    const effectiveMeridiem = meridiem ?? "AM"
    next.setHours(to24h(Number(h), effectiveMeridiem), minute ?? 0, 0, 0)
    onChange(toLocalISO(next))
  }

  const updateMinute = (m: string) => {
    const base = parsed ?? new Date()
    const next = new Date(base)
    const effectiveHour12 = hour12 ?? 12
    const effectiveMeridiem = meridiem ?? "AM"
    next.setHours(to24h(effectiveHour12, effectiveMeridiem), Number(m), 0, 0)
    onChange(toLocalISO(next))
  }

  const updateMeridiem = (m: string) => {
    const base = parsed ?? new Date()
    const next = new Date(base)
    const effectiveHour12 = hour12 ?? 12
    next.setHours(to24h(effectiveHour12, m as "AM" | "PM"), minute ?? 0, 0, 0)
    onChange(toLocalISO(next))
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Date — uses plain <button> + buttonVariants() because PopoverTrigger
          asChild needs a ref-forwarding child and this project's shadcn Button
          doesn't forwardRef (see magic-flow/CLAUDE.md Learnings). */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger
          type="button"
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-start text-left font-normal cursor-pointer",
            !parsed && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {parsed ? format(parsed, "PPP") : "Pick a date"}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parsed}
            defaultMonth={parsed}
            onSelect={updateDate}
            disabled={(d) => d < startOfDay(new Date())}
          />
        </PopoverContent>
      </Popover>

      {/* Time */}
      <div className="flex items-center gap-1.5">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <Select
          value={hour12 !== undefined ? String(hour12) : undefined}
          onValueChange={updateHour12}
          disabled={disabled}
        >
          <SelectTrigger className="w-[72px] cursor-pointer">
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent>
            {hours12.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {String(h).padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">:</span>
        <Select
          value={minute !== undefined ? String(minute) : undefined}
          onValueChange={updateMinute}
          disabled={disabled}
        >
          <SelectTrigger className="w-[72px] cursor-pointer">
            <SelectValue placeholder="mm" />
          </SelectTrigger>
          <SelectContent>
            {minutes.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {String(m).padStart(2, "0")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={meridiem ?? undefined}
          onValueChange={updateMeridiem}
          disabled={disabled}
        >
          <SelectTrigger className="w-[76px] cursor-pointer">
            <SelectValue placeholder="AM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
