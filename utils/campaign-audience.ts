import type { AudienceSource } from "@/types/campaigns"

// Structured description of an audience — split source label from filter
// chips so callers can render each as its own badge. The list view
// (space-constrained) collapses this into a string via formatAudienceSummary;
// the detail view renders chips directly.
export interface AudienceFilterChip {
  label: string
  value: string
}
export interface AudienceDescription {
  sourceLabel: string
  chips: AudienceFilterChip[]
}

export function describeAudience(
  source: AudienceSource | string | undefined,
  config: Record<string, unknown> | null | undefined,
): AudienceDescription {
  if (!source) return { sourceLabel: "Unknown", chips: [] }

  if (source === "csv") return { sourceLabel: "CSV upload", chips: [] }

  if (source === "freestand-claimant") {
    const audienceId = typeof config?.audience_id === "string" ? config.audience_id : ""
    const chips: AudienceFilterChip[] = audienceId
      ? [{ label: "audience", value: audienceId }]
      : []
    return { sourceLabel: "Freestand claimant", chips }
  }

  if (source === "contacts") {
    const chips: AudienceFilterChip[] = []
    if (config) {
      const filter = config.filter as { type?: string; values?: unknown[] } | undefined
      if (filter?.type && Array.isArray(filter.values) && filter.values.length > 0) {
        chips.push({
          label: filter.type,
          value: filter.values.map(String).join(", "),
        })
      }
      const search = typeof config.search === "string" ? config.search.trim() : ""
      if (search) chips.push({ label: "search", value: search })
      const channel = typeof config.channel === "string" ? config.channel.trim() : ""
      if (channel) chips.push({ label: "channel", value: channel })
    }
    return {
      sourceLabel: "Contacts",
      chips: chips.length > 0 ? chips : [{ label: "scope", value: "all" }],
    }
  }

  return { sourceLabel: source, chips: [] }
}

// Collapse to a one-liner for dense tables. Long values get truncated and
// multi-value filters summarised as "first +N".
export function formatAudienceSummary(
  source: AudienceSource | string | undefined,
  config: Record<string, unknown> | null | undefined,
): string {
  if (!source) return "Unknown"

  if (source === "csv") return "CSV upload"

  if (source === "freestand-claimant") {
    const audienceId = typeof config?.audience_id === "string" ? config.audience_id : ""
    return audienceId
      ? `Claimant audience ${audienceId.slice(0, 8)}…`
      : "Claimant audience"
  }

  if (source === "contacts") {
    if (!config) return "All contacts"
    const parts: string[] = []
    const filter = config.filter as { type?: string; values?: unknown[] } | undefined
    if (filter?.type && Array.isArray(filter.values) && filter.values.length > 0) {
      const label = filter.type === "tag" ? "Tag" : filter.type
      const first = String(filter.values[0])
      const shown = first.length > 30 ? first.slice(0, 27) + "…" : first
      const more = filter.values.length > 1 ? ` +${filter.values.length - 1}` : ""
      parts.push(`${label}: ${shown}${more}`)
    }
    const search = typeof config.search === "string" ? config.search.trim() : ""
    if (search) parts.push(`Search: '${search}'`)
    const channel = typeof config.channel === "string" ? config.channel.trim() : ""
    if (channel) parts.push(`Channel: ${channel}`)
    return parts.length > 0 ? parts.join(" · ") : "All contacts"
  }

  return source
}
