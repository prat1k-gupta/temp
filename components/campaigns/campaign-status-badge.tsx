import { Badge } from "@/components/ui/badge"
import type { CampaignStatus } from "@/types/campaigns"
import { cn } from "@/lib/utils"

// Note: "processing" (not "running") matches the backend enum at
// fs-whatsapp/internal/models/constants.go:143-151.
const STATUS_STYLES: Record<CampaignStatus, string> = {
  draft:         "bg-muted text-muted-foreground",
  materializing: "bg-primary/10 text-primary",
  scheduled:     "bg-info/10 text-info",
  queued:        "bg-info/10 text-info",
  processing:    "bg-primary/10 text-primary",
  paused:        "bg-warning/10 text-warning",
  completed:     "bg-success/10 text-success",
  cancelled:     "bg-muted text-muted-foreground",
  failed:        "bg-destructive/10 text-destructive",
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
      {status}
    </Badge>
  )
}
