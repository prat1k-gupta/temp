"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Layers, Sparkles, Variable, MessageSquare, HelpCircle, ListChecks, GitBranch, Brain } from "lucide-react"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import type { Platform } from "@/types"

function getNodeTypeIcon(type: string) {
  switch (type) {
    case "whatsappQuestion":
    case "webQuestion":
    case "instagramQuestion":
      return { icon: HelpCircle, color: "text-green-500" }
    case "whatsappQuickReply":
    case "webQuickReply":
    case "instagramQuickReply":
      return { icon: ListChecks, color: "text-blue-500" }
    case "whatsappMessage":
    case "instagramDM":
      return { icon: MessageSquare, color: "text-sky-500" }
    case "condition":
      return { icon: GitBranch, color: "text-amber-500" }
    default:
      return { icon: MessageSquare, color: "text-muted-foreground" }
  }
}

export function FlowTemplateNode({ data, selected }: { data: any; selected?: boolean }) {
  const platform = (data.platform || "whatsapp") as Platform
  const templateName = data.templateName || data.label || "Template"
  const internalNodes: any[] = data.internalNodes || []
  const nodeCount = data.nodeCount || internalNodes.length || 0

  // Collect all storeAs variables
  const storeAsVars = internalNodes
    .map((n: any) => n.data?.storeAs)
    .filter(Boolean) as string[]

  // Preview nodes (skip start, show up to 3)
  const previewNodes = internalNodes
    .filter((n: any) => n.type !== "start")
    .slice(0, 3)
  const hiddenCount = internalNodes.filter((n: any) => n.type !== "start").length - previewNodes.length

  const description = data.description || data.aiMetadata?.description
  const aiMetadata = data.aiMetadata

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card border-indigo-100 dark:border-indigo-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 ${
          selected ? "ring-1 ring-indigo-300/50 dark:ring-indigo-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-indigo-500 rounded-md flex items-center justify-center flex-shrink-0">
              <Layers className="w-3 h-3 text-white" />
            </div>
            <span className="font-medium text-card-foreground text-sm flex-1 truncate">
              {templateName}
            </span>
            {platform === "whatsapp" && <WhatsAppIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
            {platform === "web" && <WebIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
            {platform === "instagram" && <InstagramIcon className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />}
            <Badge
              variant="secondary"
              className="text-[8px] h-4 px-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
            >
              {nodeCount} node{nodeCount !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2 pb-8 px-4">
          {/* Description */}
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2 px-1">{description}</p>
          )}

          {/* Internal nodes preview */}
          {previewNodes.length > 0 ? (
            <div className="space-y-1">
              {previewNodes.map((node: any, i: number) => {
                const { icon: Icon, color } = getNodeTypeIcon(node.type)
                const label = node.data?.question || node.data?.label || node.type
                return (
                  <div
                    key={node.id || i}
                    className="flex items-center gap-2 px-2 py-1 rounded border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 transition-colors"
                  >
                    <Icon className={`w-3 h-3 ${color} flex-shrink-0`} />
                    <span className="text-xs text-muted-foreground truncate">{label}</span>
                  </div>
                )
              })}
              {hiddenCount > 0 && (
                <span className="text-[10px] text-muted-foreground pl-7">+{hiddenCount} more</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground px-2 py-1.5 border border-dashed border-border rounded">
              Empty template
            </div>
          )}

          {/* Variables */}
          {storeAsVars.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t border-border/40 pt-2">
              {storeAsVars.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800"
                >
                  <Variable className="w-2.5 h-2.5 text-indigo-500" />
                  <span className="text-[9px] font-mono text-indigo-700 dark:text-indigo-300">{v}</span>
                </span>
              ))}
            </div>
          )}

          {/* AI hint */}
          {aiMetadata?.whenToUse && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-purple-100 dark:border-purple-900/30">
              <Brain className="w-3 h-3 text-purple-400 flex-shrink-0" />
              <span className="text-[9px] text-purple-600 dark:text-purple-300 truncate">{aiMetadata.whenToUse}</span>
            </div>
          )}

          {/* Hint */}
          <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-1 pt-1">
            <Sparkles className="w-2.5 h-2.5" />
            Double-click to edit
          </p>
        </CardContent>

        {/* Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-indigo-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-indigo-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}
