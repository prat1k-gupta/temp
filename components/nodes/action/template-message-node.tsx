"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { FileText, Edit3, ExternalLink, Phone, Copy } from "lucide-react"
import { VariableHighlightText } from "@/components/variable-highlight-text"
import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"

const CATEGORY_COLORS: Record<string, string> = {
  MARKETING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  UTILITY: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  AUTHENTICATION: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
}

const BUTTON_ICONS: Record<string, typeof ExternalLink> = {
  url: ExternalLink,
  phone_number: Phone,
  copy_code: Copy,
}

export function TemplateMessageNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const templateName = data.templateName || ""
  const displayName = data.displayName || ""
  const category = data.category || ""
  const bodyPreview = data.bodyPreview || ""
  const buttons: Array<{ id?: string; type: string; text: string; url?: string }> = data.buttons || []
  const paramCount = data.parameterMappings?.length || 0

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "Template Message")
    }
  }, [data.label, isEditingLabel])

  const finishEditingLabel = () => {
    if (editingLabelValue.trim() && data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue.trim() })
    }
    setIsEditingLabel(false)
  }

  return (
    <div className="relative">
      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-[#075e54] border-2 border-background opacity-100 hover:scale-110 transition-transform"
      />

      <Card
        className={`min-w-[260px] max-w-[300px] bg-card border-teal-100 dark:border-teal-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-teal-200 dark:hover:border-teal-800 ${
          selected ? "ring-1 ring-teal-300/50 dark:ring-teal-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-1 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#075e54] rounded-md flex items-center justify-center flex-shrink-0">
              <FileText className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") setIsEditingLabel(false)
                }}
                className="h-6 text-sm font-medium border-teal-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-950/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors flex-1"
                onClick={() => {
                  setEditingLabelValue(data.label || "Template Message")
                  setIsEditingLabel(true)
                }}
              >
                {data.label || "Template Message"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-1.5 pb-3 px-4">
          {/* Display name + template name */}
          {templateName ? (
            <div>
              {displayName && (
                <div className="text-[11px] font-semibold text-card-foreground leading-tight">{displayName}</div>
              )}
              <div className="text-[9px] text-muted-foreground font-mono leading-tight">{templateName}</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic">No template selected</div>
          )}

          {/* Badges */}
          {(category || paramCount > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {category && (
                <Badge className={`text-[9px] px-1.5 py-0 h-4 font-medium ${CATEGORY_COLORS[category] || "bg-gray-100 text-gray-700"}`}>
                  {category}
                </Badge>
              )}
              {data.language && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                  {data.language}
                </Badge>
              )}
              {paramCount > 0 && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                  {paramCount} param{paramCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}

          {/* Full body */}
          {bodyPreview && (
            <div className="bg-muted/40 rounded p-2 max-h-[100px] scroll-minimal">
              <VariableHighlightText
                text={bodyPreview}
                className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed"
              />
            </div>
          )}

          {/* Buttons — rendered in template creation order, handles only on quick_reply */}
          {buttons.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-dashed border-teal-200 dark:border-teal-800">
              {buttons.map((btn, idx) => {
                if (btn.type === "quick_reply") {
                  return (
                    <div key={idx} className="relative group flex items-center">
                      <div className="flex-1 text-[10px] text-[#00a884] font-medium bg-[#00a884]/5 border border-[#00a884]/20 rounded px-2 py-1.5 text-center">
                        {btn.text}
                      </div>
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={btn.id || `btn-${idx}`}
                        className="w-2.5 h-2.5 bg-[#00a884] border-2 border-background opacity-100 hover:scale-125 transition-transform"
                        style={{ right: "-17px", top: "50%", transform: "translateY(-50%)", position: "absolute" }}
                      />
                    </div>
                  )
                }
                const Icon = BUTTON_ICONS[btn.type] || ExternalLink
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-center gap-1.5 text-[10px] text-[#00a884] font-medium border border-[#00a884]/20 rounded px-2 py-1"
                  >
                    <Icon className="w-3 h-3" />
                    {btn.text}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>

        {/* Next handle (synchronous follow-up) */}
        <div className="px-4 pb-3 flex items-center justify-end gap-1.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-muted-foreground font-medium cursor-help border-b border-dotted border-muted-foreground/50">Sync Next</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p>Sends a follow-up message immediately after buttons, before waiting for user input. Connect to a Message node.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Handle
            type="source"
            position={Position.Right}
            id="sync-next"
            className="w-3 h-3 bg-[#075e54] border-2 border-background opacity-100 hover:scale-110 transition-transform"
            style={{ position: "relative", right: "auto", top: "auto", transform: "none" }}
          />
        </div>
      </Card>
    </div>
  )
}
