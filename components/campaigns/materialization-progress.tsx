"use client"

import { useEffect, useState } from "react"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Campaign } from "@/types/campaigns"

interface Props {
  campaign: Campaign
}

/**
 * Renders the materialization progress bar for freestand-claimant broadcasts.
 * Returns null unless campaign.status === "materializing". The parent decides
 * whether to render; this component renders defensively-safely regardless.
 */
export function MaterializationProgress({ campaign }: Props) {
  // Re-render every second so the ETA countdown is smooth instead of only
  // advancing when a WS progress event arrives (events come ~1-2s apart, but
  // the user sees a ticking clock in between).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (campaign.status !== "materializing") return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [campaign.status])

  if (campaign.status !== "materializing") return null

  // Treat null AND undefined as "not yet known" — the backend may omit the
  // field entirely rather than serialize null, especially before the first
  // WS progress event lands.
  const total = typeof campaign.audience_total === "number" ? campaign.audience_total : null
  const done = typeof campaign.materialized_count === "number" ? campaign.materialized_count : 0
  const pctRaw = total && total > 0 ? (done / total) * 100 : 0
  // Clamp 0..100: dynamic-audience drift can push `done` above the first-page `total`.
  const pct = Math.max(0, Math.min(100, pctRaw))

  const label =
    total === null
      ? "Materializing — counting recipients..."
      : `Materializing recipients — ${done.toLocaleString()} of ${total.toLocaleString()}`

  // Compute ETA. We have two timestamps:
  //   - created_at: when the goroutine spawned
  //   - updated_at: last time the goroutine wrote a progress row
  //
  // If `now - updated_at` is large, the goroutine has stalled (maybe crashed,
  // maybe deadlocked). Showing a rate extrapolated from created_at would
  // produce a growing, misleading ETA (3/s, 2/s, 1/s...). Instead, we flag
  // progress as stalled and let the server-side staleness janitor (5 min)
  // flip the campaign to failed — the UI will then re-render without this
  // component entirely.
  const STALE_THRESHOLD_MS = 90_000 // 90s — generous vs. go-backend per-page latency
  let etaLine: string | null = null
  let stalled = false
  if (total !== null && total > 0 && done > 0 && campaign.updated_at) {
    const sinceUpdateMs = now - new Date(campaign.updated_at).getTime()
    stalled = sinceUpdateMs > STALE_THRESHOLD_MS
    if (!stalled) {
      const elapsedMs = now - new Date(campaign.created_at).getTime()
      const elapsedSec = elapsedMs / 1000
      if (elapsedSec > 3) {
        const rate = done / elapsedSec // rows per second, averaged over run
        const remaining = Math.max(0, total - done)
        const etaSec = rate > 0 ? remaining / rate : 0
        if (etaSec >= 1) {
          etaLine = `~${formatDuration(etaSec)} remaining (${Math.round(rate)}/s)`
        }
      }
    }
  }

  return (
    <Alert className={stalled ? "border-warning/50" : "border-primary/50"}>
      <AlertTitle>{label}</AlertTitle>
      <AlertDescription>
        <Progress value={pct} className="mt-2" />
        <div className="flex items-center justify-between gap-3 mt-2">
          <p className="text-xs text-muted-foreground">
            {stalled
              ? "No progress in 90s. The server will mark this campaign as failed shortly if it doesn't recover."
              : "The campaign will be ready to start once recipients finish loading."}
          </p>
          {etaLine && (
            <p className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {etaLine}
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

// formatDuration renders a seconds count as "Xm Ys" or "Ys" for small values.
// Keeps things short and readable inline next to the progress bar.
function formatDuration(sec: number): string {
  const rounded = Math.round(sec)
  if (rounded < 60) return `${rounded}s`
  const totalMin = Math.floor(rounded / 60)
  const s = rounded % 60
  if (totalMin < 60) {
    return s === 0 ? `${totalMin}m` : `${totalMin}m ${s}s`
  }
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
