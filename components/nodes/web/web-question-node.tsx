"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit3 } from "lucide-react"
import { WebIcon } from "@/components/platform-icons"
import { AIToolbar } from "@/components/ai/ai-toolbar"
import { useState, useEffect } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"

export function WebQuestionNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingQuestion, setIsEditingQuestion] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingQuestionValue, setEditingQuestionValue] = useState("")

  useEffect(() => {
    if (!isEditingLabel) {
      setEditingLabelValue(data.label || "")
    }
  }, [data.label, isEditingLabel])

  useEffect(() => {
    if (!isEditingQuestion) {
      setEditingQuestionValue(data.question || "")
    }
  }, [data.question, isEditingQuestion])

  const platform = (data.platform || "web") as Platform
  const nodeType = "webQuestion"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxLength = nodeLimits.question?.max || 500

  const isOverLimit = (text: string) => {
    return text.length > maxLength
  }

  const startEditingLabel = () => {
    setEditingLabelValue(data.label || "")
    setIsEditingLabel(true)
  }

  const finishEditingLabel = () => {
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, label: editingLabelValue })
    }
    setIsEditingLabel(false)
  }

  const cancelEditingLabel = () => {
    setEditingLabelValue(data.label || "")
    setIsEditingLabel(false)
  }

  const startEditingQuestion = () => {
    setEditingQuestionValue(data.question || "")
    setIsEditingQuestion(true)
  }

  const finishEditingQuestion = () => {
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, question: editingQuestionValue })
    }
    setIsEditingQuestion(false)
  }

  const cancelEditingQuestion = () => {
    setEditingQuestionValue(data.question || "")
    setIsEditingQuestion(false)
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card border-blue-100 dark:border-blue-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 ${
          selected ? "ring-1 ring-blue-300/50 dark:ring-blue-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* Web Icon - Inside header, left side */}
            <div className="w-5 h-5 bg-blue-500 rounded-md flex items-center justify-center flex-shrink-0">
              <WebIcon className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") cancelEditingLabel()
                }}
                className="h-6 text-sm font-medium border-blue-200"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-accent/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                onClick={startEditingLabel}
              >
                {data.label || "Web Message"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          {isEditingQuestion ? (
            <div className="space-y-2">
              <Textarea
                value={editingQuestionValue}
                onChange={(e) => setEditingQuestionValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingQuestion()
                  }
                  if (e.key === "Escape") cancelEditingQuestion()
                }}
                className={`text-sm min-h-[60px] resize-none border-blue-200 focus:border-blue-300 ${
                  isOverLimit(editingQuestionValue) ? "border-red-300" : ""
                }`}
                placeholder={nodeLimits.question?.placeholder || "Enter your message..."}
                autoFocus
              />
              
              {/* AI Toolbar - Add AI-powered text improvement */}
              <AIToolbar
                value={editingQuestionValue}
                onChange={(newValue) => {
                  setEditingQuestionValue(newValue)
                  if (data.onNodeUpdate) {
                    data.onNodeUpdate(data.id, { ...data, question: newValue })
                  }
                }}
                nodeType={nodeType}
                platform={platform}
                field="question"
                maxLength={maxLength}
                className="border-t border-border pt-2"
              />
              
              {isOverLimit(editingQuestionValue) && (
                <Badge variant="destructive" className="text-xs h-5">
                  Too long - use AI to shorten
                </Badge>
              )}
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-3 cursor-pointer hover:bg-accent/30 px-2 py-1.5 rounded border border-transparent hover:border-accent transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Enter your message..."}
            </div>
          )}

          {selected && <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs h-7 border border-dashed border-border hover:border-accent hover:bg-accent/30 transition-colors text-muted-foreground"
            onClick={data.onAddButton}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Button
          </Button>}
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-blue-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-blue-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}

