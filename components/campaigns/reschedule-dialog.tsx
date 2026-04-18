"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CalendarClock, Loader2, AlertCircle } from "lucide-react"
import { useRescheduleCampaign } from "@/hooks/queries/use-campaigns"
import { DateTimePicker } from "./datetime-picker"

interface RescheduleDialogProps {
  campaignId: string
  currentScheduledAt?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RescheduleDialog({
  campaignId,
  currentScheduledAt,
  open,
  onOpenChange,
}: RescheduleDialogProps) {
  const [localTime, setLocalTime] = useState("")
  const [error, setError] = useState<string | null>(null)
  const reschedule = useRescheduleCampaign()

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Single close handler so Cancel/ESC/backdrop/X all clear state uniformly.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setLocalTime("")
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = async () => {
    setError(null)
    if (!localTime) {
      setError("Pick a date and time")
      return
    }
    const d = new Date(localTime)
    if (isNaN(d.getTime())) {
      setError("Invalid date")
      return
    }
    if (d.getTime() < Date.now() + 60_000) {
      setError("Schedule at least 1 minute in the future")
      return
    }
    try {
      await reschedule.mutateAsync({
        id: campaignId,
        scheduled_at: d.toISOString(),
      })
      handleOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reschedule")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <CalendarClock className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <DialogTitle>Reschedule campaign</DialogTitle>
              <DialogDescription className="mt-0.5">
                Pick a new send time.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {currentScheduledAt && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Currently scheduled for{" "}
              <span className="font-medium text-foreground">
                {new Date(currentScheduledAt).toLocaleString()}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label>New scheduled time</Label>
            <DateTimePicker value={localTime} onChange={setLocalTime} />
            <p className="text-xs text-muted-foreground">
              Your timezone:{" "}
              <span className="font-medium text-foreground">{tz}</span>
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={reschedule.isPending}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={reschedule.isPending}
            className="cursor-pointer"
          >
            {reschedule.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {reschedule.isPending ? "Rescheduling…" : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
