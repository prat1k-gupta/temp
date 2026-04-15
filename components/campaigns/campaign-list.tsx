import Link from "next/link"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CampaignStatusBadge } from "./campaign-status-badge"
import type { Campaign } from "@/types/campaigns"
import { formatDistanceToNow } from "date-fns"
import { FileText, GitBranch } from "lucide-react"

export function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-muted-foreground">No campaigns yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Click &ldquo;New Campaign&rdquo; to send your first broadcast.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Recipients</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Delivered</TableHead>
            <TableHead className="text-right">Read</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.map((c) => (
            <TableRow key={c.id} className="cursor-pointer hover:bg-muted">
              <TableCell className="font-medium">
                <Link href={`/campaigns/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {c.flow_id ? (
                    <>
                      <GitBranch className="h-3.5 w-3.5" /> Flow
                    </>
                  ) : (
                    <>
                      <FileText className="h-3.5 w-3.5" /> Template
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <CampaignStatusBadge status={c.status} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.total_recipients.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{c.sent_count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{c.delivered_count.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{c.read_count.toLocaleString()}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
