"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCampaignRecipients } from "@/hooks/queries/use-campaigns"

export function RecipientTable({ campaignId }: { campaignId: string }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useCampaignRecipients(campaignId)

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading recipients...</div>
  }

  const allRecipients = data?.pages.flatMap((p) => p.recipients) ?? []

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Delivered</TableHead>
            <TableHead>Read</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allRecipients.map((r) => (
            <TableRow key={r.id} className="hover:bg-muted">
              <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.sent_at ? new Date(r.sent_at).toLocaleTimeString() : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString() : "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.read_at ? new Date(r.read_at).toLocaleTimeString() : "—"}
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-destructive">
                {r.error_message ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasNextPage && (
        <div className="flex justify-center mt-4">
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
