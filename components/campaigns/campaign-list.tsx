"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Clock,
  FileText,
  GitBranch,
  MoreHorizontal,
  Play,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useCancelCampaign,
  useDeleteCampaign,
  useRetryFailedCampaign,
  useStartCampaign,
} from "@/hooks/queries/use-campaigns"
import { CampaignStatusBadge } from "./campaign-status-badge"
import type { Campaign } from "@/types/campaigns"

// Status groupings mirroring the fs-chat Vue parent — which transitions are
// valid on which statuses determines which actions get rendered in the row
// menu. Keeping this in one place avoids drift as we add/rename states.
const canStart = (s: Campaign["status"]) => s === "draft" || s === "scheduled" || s === "paused"
const canCancel = (s: Campaign["status"]) =>
  s === "processing" || s === "paused" || s === "scheduled" || s === "queued"
const canRetry = (c: Campaign) =>
  c.failed_count > 0 && (c.status === "completed" || c.status === "failed" || c.status === "paused")
const canDelete = (s: Campaign["status"]) => s !== "processing" && s !== "queued"

export function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter()
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null)

  const { mutate: startCampaign } = useStartCampaign()
  const { mutate: cancelCampaign } = useCancelCampaign()
  const { mutate: retryFailed, isPending: retrying } = useRetryFailedCampaign()
  const { mutate: deleteCampaign, isPending: deleting } = useDeleteCampaign()

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
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Type</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Progress</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Flow recipients</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Messages sent</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Messages delivered</th>
              <th className="text-right font-medium text-muted-foreground px-4 py-3">Messages failed</th>
              <th className="text-left font-medium text-muted-foreground px-4 py-3">Created</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const total = c.total_recipients || 0
              // Use recipients_completed (per-recipient) not sent_count (per-message) — for
              // flow broadcasts one recipient can trigger many sends, so sent_count exceeds
              // total_recipients and would push the bar past 100%.
              const done = c.recipients_completed ?? 0
              const progressPct = total ? Math.min(100, Math.round((done / total) * 100)) : 0
              return (
                <tr
                  key={c.id}
                  className="group border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/campaigns/${c.id}`)}
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                          c.flow_id ? "bg-primary/10" : "bg-muted",
                        )}
                      >
                        {c.flow_id ? (
                          <GitBranch className="h-4 w-4 text-primary" />
                        ) : (
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[280px]">{c.name}</p>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[280px]">
                          <span className="truncate">{c.account_name}</span>
                          {(c.flow_name || c.template_name) && (
                            <>
                              <span aria-hidden="true">|</span>
                              {c.flow_id ? (
                                <GitBranch className="h-3 w-3 shrink-0" />
                              ) : (
                                <FileText className="h-3 w-3 shrink-0" />
                              )}
                              <span className="truncate">
                                {c.flow_name ?? c.template_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {c.flow_id ? "Flow" : "Template"}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <CampaignStatusBadge status={c.status} />
                    {c.status === "scheduled" && c.scheduled_at && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 shrink-0" />
                        {new Date(c.scheduled_at).toLocaleString()}
                      </span>
                    )}
                  </td>

                  {/* Progress */}
                  <td className="px-4 py-3">
                    {total > 0 ? (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help">
                              <div className="h-1.5 w-24 rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    c.failed_count > 0 && c.status === "completed"
                                      ? "bg-destructive"
                                      : "bg-primary",
                                  )}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                                {progressPct}%
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            {done.toLocaleString()} of {total.toLocaleString()} recipients
                            completed. Progress counts recipients whose first message has
                            resolved — not per-message sends, since flow broadcasts can send
                            multiple messages per recipient.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Counters */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.total_recipients.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.sent_count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.delivered_count.toLocaleString()}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      c.failed_count > 0 && "text-destructive font-medium",
                    )}
                  >
                    {c.failed_count.toLocaleString()}
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 cursor-pointer transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {canStart(c.status) && (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => startCampaign(c.id)}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            {c.status === "paused" ? "Resume" : "Start"}
                          </DropdownMenuItem>
                        )}
                        {canRetry(c) && (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            disabled={retrying}
                            onClick={() => retryFailed(c.id)}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Retry failed ({c.failed_count})
                          </DropdownMenuItem>
                        )}
                        {canCancel(c.status) && (
                          <DropdownMenuItem
                            className="cursor-pointer"
                            onClick={() => cancelCampaign(c.id)}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel
                          </DropdownMenuItem>
                        )}
                        {(canStart(c.status) || canRetry(c) || canCancel(c.status)) && canDelete(c.status) && (
                          <DropdownMenuSeparator />
                        )}
                        {canDelete(c.status) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive cursor-pointer"
                            onClick={() => setPendingDelete(c)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation — AlertDialog per CLAUDE.md UI rules */}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{pendingDelete?.name}&rdquo; and its recipient
              history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              disabled={deleting}
              onClick={() => {
                if (pendingDelete) {
                  deleteCampaign(pendingDelete.id)
                  setPendingDelete(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
