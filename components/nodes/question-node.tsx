"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { MessageCircle, Plus, Edit3 } from "lucide-react"
import { useState, useEffect } from "react"

const PLATFORM_LIMITS = {
  web: { question: 500, button: 50 },
  whatsapp: { question: 160, button: 20 },
  instagram: { question: 100, button: 15 },
}

export function QuestionNode({ data, selected }: { data: any; selected?: boolean }) {
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

  const platform = data.platform || "web"
  const limits = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS]

  const isOverLimit = (text: string, type: "question" | "button") => {
    return text.length > limits[type]
  }

  const startEditingLabel = () => {
    setEditingLabelValue(data.label || "")
    setIsEditingLabel(true)
  }

  const finishEditingLabel = () => {
    if (data.onNodeUpdate) {
      console.log("[v0] Updating label:", editingLabelValue)
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
      console.log("[v0] Updating question:", editingQuestionValue)
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
        className={`min-w-[260px] max-w-[300px] bg-card border-border shadow-lg transition-all duration-200 hover:shadow-xl hover:border-accent/50 ${
          selected ? "ring-2 ring-accent/50" : ""
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-accent" />
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") cancelEditingLabel()
                }}
                className="h-6 text-sm font-medium"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-accent/10 px-1 py-0.5 rounded flex items-center gap-1"
                onClick={startEditingLabel}
              >
                {data.label || "Question"}
                <Edit3 className="w-3 h-3 opacity-50" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-8">
          {isEditingQuestion ? (
            <div className="space-y-2">
              <Textarea
                value={editingQuestionValue}
                onChange={(e) => setEditingQuestionValue(e.target.value)}
                onBlur={finishEditingQuestion}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingQuestion()
                  }
                  if (e.key === "Escape") cancelEditingQuestion()
                }}
                className={`text-sm min-h-[60px] resize-none ${
                  isOverLimit(editingQuestionValue, "question") ? "border-destructive" : ""
                }`}
                placeholder="Enter your question..."
                autoFocus
              />
              <div className="flex justify-between items-center">
                <span
                  className={`text-xs ${
                    isOverLimit(editingQuestionValue, "question") ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {editingQuestionValue.length}/{limits.question} characters
                </span>
                {isOverLimit(editingQuestionValue, "question") && (
                  <Badge variant="destructive" className="text-xs">
                    Too long
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-3 cursor-pointer hover:bg-accent/10 p-2 rounded border border-transparent hover:border-accent/20 transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Enter your question..."}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs h-8 border-2 border-dashed border-muted-foreground/30 hover:border-accent transition-colors"
            onClick={data.onAddButton}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Button
          </Button>
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-4 h-4 bg-accent border-3 border-white opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Next Step</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-4 h-4 bg-accent border-3 border-white opacity-100 hover:scale-110 transition-transform relative"
            style={{ position: "relative", transform: "none", right: "auto", top: "auto" }}
          />
        </div>
      </Card>
    </div>
  )
}
