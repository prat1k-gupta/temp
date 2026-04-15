"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { usePreviewAudience } from "@/hooks/queries/use-campaigns"
import { Loader2, Users } from "lucide-react"
import type { AudiencePreview } from "@/types/campaigns"

interface Props {
  value: string // the audience_id
  onChange: (audienceId: string) => void
  onPreviewLoaded: (preview: AudiencePreview) => void
}

export function AudiencePickerSamplingCentral({ value, onChange, onPreviewLoaded }: Props) {
  const [localId, setLocalId] = useState(value)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const previewMutation = usePreviewAudience()

  const handleFetch = () => {
    const trimmed = localId.trim()
    if (!trimmed) return
    previewMutation.mutate(
      { source: "sampling-central", audience_id: trimmed },
      {
        onSuccess: (p) => {
          setPreview(p)
          onPreviewLoaded(p)
          onChange(trimmed)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="sc-audience-id">Sampling Central audience ID</Label>
        <div className="flex gap-2">
          <Input
            id="sc-audience-id"
            placeholder="sc-audience-abc123"
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleFetch()
              }
            }}
          />
          <Button
            type="button"
            onClick={handleFetch}
            disabled={!localId.trim() || previewMutation.isPending}
            className="cursor-pointer"
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
          </Button>
        </div>
      </div>

      {previewMutation.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(previewMutation.error as Error).message || "Failed to fetch audience"}
        </div>
      )}

      {preview && (
        <div className="rounded-md border bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{preview.name ?? "Audience"}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {preview.total_count.toLocaleString()} contacts
            {preview.audience_type && <> · {preview.audience_type}</>}
          </div>
          {preview.available_columns.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Available columns: {preview.available_columns.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
