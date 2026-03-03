"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Send, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Loader2, Variable, GitBranch, RefreshCw, Unlink } from "lucide-react"
import { toast } from "sonner"
import type { Node, Edge } from "@xyflow/react"
import { convertToFsWhatsApp, type FsWhatsAppFlow } from "@/utils/whatsapp-converter"
import { collectFlowVariables } from "@/utils/flow-variables"

interface WhatsAppPublishPanelProps {
  nodes: Node[]
  edges: Edge[]
  flowName: string
  flowDescription?: string
  triggerIds?: string[]
  triggerKeywords?: string[]
  publishedFlowId?: string
  onPublished?: (flowId: string) => void
  onDisconnect?: () => void
}

type PublishStatus = "idle" | "publishing" | "success" | "error"

export function WhatsAppPublishPanel({ nodes, edges, flowName, flowDescription, triggerIds, triggerKeywords, publishedFlowId, onPublished, onDisconnect }: WhatsAppPublishPanelProps) {
  const [showJson, setShowJson] = useState(false)
  const [publishStatus, setPublishStatus] = useState<PublishStatus>("idle")
  const [publishError, setPublishError] = useState("")

  const isUpdate = !!publishedFlowId

  const converted = useMemo(
    () => convertToFsWhatsApp(nodes, edges, flowName, flowDescription, triggerIds, triggerKeywords),
    [nodes, edges, flowName, flowDescription, triggerIds, triggerKeywords]
  )

  const jsonString = useMemo(() => JSON.stringify(converted, null, 2), [converted])

  const variables = useMemo(() => collectFlowVariables(nodes), [nodes])

  const warnings = useMemo(() => {
    const w: string[] = []
    // Check for storable nodes missing storeAs
    const storableTypes = new Set([
      "whatsappQuestion", "question", "whatsappQuickReply", "quickReply",
      "whatsappInteractiveList", "interactiveList",
    ])
    for (const node of nodes) {
      if (storableTypes.has(node.type || "")) {
        const data = node.data as Record<string, any>
        if (!data.storeAs) {
          w.push(`"${data.label || node.type}" has no "Save response as" variable`)
        }
      }
    }
    // Check for unconnected nodes (no incoming edges)
    const targetIds = new Set(edges.map((e) => e.target))
    for (const node of nodes) {
      if (node.type === "start" || node.type === "comment") continue
      if (!targetIds.has(node.id)) {
        const data = node.data as Record<string, any>
        w.push(`"${data.label || node.type}" is not connected to any other node`)
      }
    }
    return w
  }, [nodes, edges])

  const handlePublish = async () => {
    setPublishStatus("publishing")
    setPublishError("")
    try {
      const response = await fetch("/api/whatsapp/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...converted,
          publishedFlowId: publishedFlowId || undefined,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Publish failed (${response.status})`)
      }
      const result = await response.json()
      setPublishStatus("success")

      // Store the flow ID for future updates
      if (result.flowId && onPublished) {
        onPublished(result.flowId)
      }

      toast.success(result.updated ? "Flow updated on WhatsApp!" : "Flow published to WhatsApp!", {
        description: result.flowId ? `Flow ID: ${result.flowId}` : undefined,
      })
    } catch (err: any) {
      setPublishStatus("error")
      setPublishError(err.message || "Failed to publish")
      toast.error("Failed to publish flow", { description: err.message })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Published flow ID */}
      {isUpdate && publishedFlowId && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
          <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Linked to published flow</p>
            <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 font-mono truncate">{publishedFlowId}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisconnect?.()}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-red-600"
          >
            <Unlink className="w-3 h-3 mr-1" />
            Disconnect
          </Button>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          {converted.steps.length} steps
        </Badge>
        <Badge variant="outline" className="flex items-center gap-1">
          <Variable className="w-3 h-3" />
          {variables.length} variables
        </Badge>
        {warnings.length > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1.5">
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Warnings</span>
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* JSON preview (collapsible) */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowJson(!showJson)}
          className="flex items-center gap-1 text-xs text-muted-foreground"
        >
          {showJson ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showJson ? "Hide" : "Show"} JSON Preview
        </Button>
        {showJson && (
          <Textarea
            value={jsonString}
            readOnly
            className="mt-2 min-h-[200px] max-h-[300px] font-mono text-xs resize-none overflow-y-auto"
          />
        )}
      </div>

      {/* Publish status */}
      {publishStatus === "success" && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700 dark:text-green-400">
            Flow {isUpdate ? "updated" : "published"} successfully!
          </span>
        </div>
      )}

      {publishStatus === "error" && publishError && (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-400">{publishError}</span>
          </div>
          {isUpdate && publishError.includes("404") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDisconnect?.()}
              className="self-start text-xs text-red-600 border-red-200 hover:bg-red-50"
            >
              <Unlink className="w-3 h-3 mr-1" />
              Disconnect and publish as new
            </Button>
          )}
        </div>
      )}

      {/* Publish button */}
      <div className="flex justify-end pt-2 border-t">
        <Button
          onClick={handlePublish}
          disabled={publishStatus === "publishing" || converted.steps.length === 0}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          {publishStatus === "publishing" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isUpdate ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {publishStatus === "publishing"
            ? (isUpdate ? "Updating..." : "Publishing...")
            : (isUpdate ? "Update on WhatsApp" : "Publish to WhatsApp")}
        </Button>
      </div>
    </div>
  )
}
