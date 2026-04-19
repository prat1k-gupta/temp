"use client"

import { useEffect, useRef, useState } from "react"
import { useFormContext } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2, Plus, Loader2 } from "lucide-react"
import {
  FREESTAND_CLAIMANT_ALLOWED_COLUMNS,
  type FreestandClaimantColumn,
} from "@/types/campaigns"

interface Props {
  onAudienceIdChange: (id: string) => void
  previewCount: number | null
  previewError: string | null
  previewLoading?: boolean
}

/**
 * Form section for the freestand-claimant audience source. Renders:
 *   1. A UUID-validated input for audience_id
 *   2. A repeatable column-mapping editor (flow variable name → claimant column dropdown)
 */
export function FreestandClaimantAudienceFields({
  onAudienceIdChange,
  previewCount,
  previewError,
  previewLoading = false,
}: Props) {
  // NOTE: shadcn Input (components/ui/input.tsx) is not forwardRef, so
  // `{...register("audience_config.audience_id")}` drops the ref and RHF
  // never tracks the value. Use controlled pattern (watch + setValue) instead.
  const {
    setValue,
    watch,
    formState: { errors },
  } = useFormContext()
  const audienceId = watch("audience_config.audience_id") as string | undefined

  // Stash the latest callback in a ref so the effect below only reacts to
  // audienceId changes — parents typically pass an inline arrow (a new
  // reference per render) which, if depended on directly, would fire the
  // preview on every parent re-render in an infinite loop.
  const onAudienceIdChangeRef = useRef(onAudienceIdChange)
  useEffect(() => {
    onAudienceIdChangeRef.current = onAudienceIdChange
  }, [onAudienceIdChange])

  // Remember the last UUID we fired for, so we don't re-fire when the parent
  // re-renders for an unrelated reason (e.g. preview state updating).
  const lastFiredRef = useRef<string | null>(null)

  useEffect(() => {
    if (!audienceId || !isUUID(audienceId)) return
    if (lastFiredRef.current === audienceId) return
    const h = setTimeout(() => {
      lastFiredRef.current = audienceId
      onAudienceIdChangeRef.current(audienceId)
    }, 500)
    return () => clearTimeout(h)
  }, [audienceId])

  const [rows, setRows] = useState<
    Array<{ flowVar: string; column: FreestandClaimantColumn | "" }>
  >([{ flowVar: "", column: "" }])

  useEffect(() => {
    const mapping: Record<string, FreestandClaimantColumn> = {}
    for (const r of rows) {
      if (r.flowVar && r.column) mapping[r.flowVar] = r.column
    }
    setValue("audience_config.column_mapping", mapping, { shouldValidate: false })
  }, [rows, setValue])

  const audienceIdError = (errors?.audience_config as { audience_id?: { message?: string } } | undefined)
    ?.audience_id?.message as string | undefined

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="audience_id">Audience ID</Label>
        <Input
          id="audience_id"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={audienceId ?? ""}
          onChange={(e) =>
            setValue("audience_config.audience_id", e.target.value, {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
        {audienceIdError && (
          <p className="text-destructive text-sm mt-1">{audienceIdError}</p>
        )}
        {/* Preview state, in priority order:
              1. Loading (user just pasted a UUID, waiting for go-backend count)
              2. Error (404/403/network from go-backend)
              3. Count (success)
              Only one of these renders at a time. */}
        {previewLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Counting claimants…
          </p>
        ) : previewError ? (
          <p className="text-warning text-sm mt-1">
            Could not preview audience: {previewError}. You can still create the
            campaign; the error will show on the detail page if materialization
            fails.
          </p>
        ) : previewCount !== null ? (
          <p className="text-sm text-muted-foreground mt-1">
            {previewCount.toLocaleString()} claimants
          </p>
        ) : null}
      </div>

      <div>
        <Label>Column mapping (optional)</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Map claimant columns to flow/template variables. Phone is always the
          send identifier.
        </p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="flow variable (e.g. customer_name)"
                value={row.flowVar}
                onChange={(e) =>
                  setRows((r) =>
                    r.map((x, j) => (j === i ? { ...x, flowVar: e.target.value } : x)),
                  )
                }
                className="flex-1"
              />
              <span className="text-muted-foreground">←</span>
              <Select
                value={row.column}
                onValueChange={(v) =>
                  setRows((r) =>
                    r.map((x, j) =>
                      j === i ? { ...x, column: v as FreestandClaimantColumn } : x,
                    ),
                  )
                }
              >
                <SelectTrigger className="flex-1 cursor-pointer">
                  <SelectValue placeholder="claimant column" />
                </SelectTrigger>
                <SelectContent>
                  {FREESTAND_CLAIMANT_ALLOWED_COLUMNS.map((c) => (
                    <SelectItem key={c} value={c} className="cursor-pointer">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                disabled={rows.length === 1}
                className="cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((r) => [...r, { flowVar: "", column: "" }])
            }
            className="cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add mapping
          </Button>
        </div>
      </div>
    </div>
  )
}

function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}
