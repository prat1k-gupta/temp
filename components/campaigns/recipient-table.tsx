"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useCampaignRecipients } from "@/hooks/queries/use-campaigns"
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
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useCampaignRecipients(campaignId)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading recipients...</div>
  }

  const allRecipients = data?.pages.flatMap((p) => p.recipients) ?? []

  if (allRecipients.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No recipients yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Sent</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Delivered</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Read</th>
            </tr>
          </thead>
          <tbody>
            {allRecipients.map((r) => (
              <tr
                key={r.id}
                className="group border-b last:border-b-0 hover:bg-muted/30 transition-colors align-top"
              >
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
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="cursor-pointer"
          >
            {isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  )
}
