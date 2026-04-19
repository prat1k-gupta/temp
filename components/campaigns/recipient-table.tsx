"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RECIPIENTS_PAGE_SIZE,
  useCampaignRecipients,
  type RecipientStatusFilter,
} from "@/hooks/queries/use-campaigns"
import type { CampaignRecipient } from "@/types/campaigns"

// Mirror the campaign status badge palette but scoped to per-recipient statuses
// so success states read green and failures read destructive.
const STATUS_STYLES: Record<CampaignRecipient["status"], string> = {
  pending:   "bg-muted text-muted-foreground",
  sent:      "bg-primary/10 text-primary",
  delivered: "bg-success/10 text-success",
  read:      "bg-info/10 text-info",
  failed:    "bg-destructive/10 text-destructive",
}

function formatTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString()
}

export function RecipientTable({ campaignId }: { campaignId: string }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<RecipientStatusFilter>("all")
  // searchInput is the debounced typing buffer; searchApplied is what actually
  // hits the backend. Keeps us from firing a query on every keystroke.
  const [searchInput, setSearchInput] = useState("")
  const [searchApplied, setSearchApplied] = useState("")
  useEffect(() => {
    const h = setTimeout(() => setSearchApplied(searchInput.trim()), 350)
    return () => clearTimeout(h)
  }, [searchInput])

  // Reset to page 1 whenever a filter changes — otherwise clicking "failed"
  // while on page 12 would leave you on page 12 of a 1-page result set.
  useEffect(() => {
    setPage(1)
  }, [status, searchApplied])

  const { data, isLoading, isFetching } = useCampaignRecipients(
    campaignId,
    page,
    RECIPIENTS_PAGE_SIZE,
    status,
    searchApplied,
  )

  const recipients = data?.recipients ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / RECIPIENTS_PAGE_SIZE))
  const filtersActive = status !== "all" || searchApplied !== ""

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading recipients...</div>
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * RECIPIENTS_PAGE_SIZE + 1
  const rangeEnd = Math.min(page * RECIPIENTS_PAGE_SIZE, total)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as RecipientStatusFilter)}>
          <SelectTrigger className="sm:w-48 cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="cursor-pointer">All statuses</SelectItem>
            <SelectItem value="pending" className="cursor-pointer">Pending</SelectItem>
            <SelectItem value="sent" className="cursor-pointer">Sent</SelectItem>
            <SelectItem value="delivered" className="cursor-pointer">Delivered</SelectItem>
            <SelectItem value="read" className="cursor-pointer">Read</SelectItem>
            <SelectItem value="failed" className="cursor-pointer">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {total === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filtersActive ? "No recipients match the current filters." : "No recipients yet."}
        </div>
      ) : (
      <>
      <div className="rounded-lg border">
        {/* Fixed-height scroll region keeps the table from eating the whole viewport
            on large campaigns. Header stays sticky so columns remain labeled while
            the body scrolls. max-h chosen to fit ~10 rows at default density. */}
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/30 backdrop-blur">
              <tr className="border-b">
                <th className="text-left font-medium text-muted-foreground px-4 py-3 w-16">S.No.</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Phone</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Sent</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Delivered</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Read</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r, i) => (
                <tr
                  key={r.id}
                  className="group border-b last:border-b-0 hover:bg-muted/30 transition-colors align-top"
                >
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {((page - 1) * RECIPIENTS_PAGE_SIZE + i + 1).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {r.recipient_name || <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                    {r.phone_number}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        STATUS_STYLES[r.status] ?? STATUS_STYLES.pending,
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          r.status === "failed"
                            ? "bg-destructive"
                            : r.status === "sent"
                              ? "bg-primary"
                              : r.status === "delivered"
                                ? "bg-success"
                                : r.status === "read"
                                  ? "bg-info"
                                  : "bg-muted-foreground",
                        )}
                      />
                      {r.status}
                    </span>
                    {r.status === "failed" && r.error_message && (
                      <p
                        className="mt-1.5 text-xs text-destructive/80 max-w-md break-words"
                        title={r.error_message}
                      >
                        {r.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(r.sent_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(r.delivered_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatTime(r.read_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground tabular-nums">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()}
          {isFetching && " · refreshing…"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            Page {page} of {totalPages.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            className="cursor-pointer"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
