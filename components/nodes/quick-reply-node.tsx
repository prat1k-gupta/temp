"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Plus, Edit3, X } from "lucide-react"
import { useState, useEffect } from "react"
import { CHARACTER_LIMITS } from "@/constants/platform-limits"

const PLATFORM_LIMITS = CHARACTER_LIMITS

export function QuickReplyNode({ data, selected }: { data: any; selected?: boolean }) {
  const buttons = data.buttons || []
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingQuestion, setIsEditingQuestion] = useState(false)
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingQuestionValue, setEditingQuestionValue] = useState("")
  const [editingButtonValue, setEditingButtonValue] = useState("")

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
      if (editingLabelValue.length > limits.button) {
        return
      }
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
      if (editingQuestionValue.length > limits.question) {
        return
      }
      data.onNodeUpdate(data.id, { ...data, question: editingQuestionValue })
    }
    setIsEditingQuestion(false)
  }

  const cancelEditingQuestion = () => {
    setEditingQuestionValue(data.question || "")
    setIsEditingQuestion(false)
  }

  const startEditingButton = (index: number) => {
    setEditingButtonValue(buttons[index]?.text || "")
    setEditingButtonIndex(index)
  }

  const finishEditingButton = () => {
    if (editingButtonIndex !== null && data.onNodeUpdate) {
      const updatedButtons = [...buttons]
      updatedButtons[editingButtonIndex] = { ...updatedButtons[editingButtonIndex], text: editingButtonValue }
      console.log("[v0] Updating button", editingButtonIndex, "with text:", editingButtonValue)
      if (editingButtonValue.length > limits.button) {
        return
      }
      data.onNodeUpdate(data.id, { ...data, buttons: updatedButtons })
    } 
    setEditingButtonIndex(null)
  }

  const cancelEditingButton = () => {
    if (editingButtonIndex !== null) {
      setEditingButtonValue(buttons[editingButtonIndex]?.text || "")
    }
    setEditingButtonIndex(null)
  }

  const removeButton = (index: number) => {
    const updatedButtons = buttons.filter((_: any, i: number) => i !== index)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, buttons: updatedButtons })
    }
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[280px] max-w-[320px] bg-card border-border shadow-lg transition-all duration-200 hover:shadow-xl hover:border-accent/50 ${
          selected ? "ring-2 ring-accent/50" : ""
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-accent" />
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
                {data.label || "Quick Reply"}
                <Edit3 className="w-3 h-3 opacity-50" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-12">
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
              className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:bg-accent/10 p-2 rounded border border-transparent hover:border-accent/20 transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Enter your question..."}
            </div>
          )}

          <div className="space-y-2">
            {buttons.map((button: any, index: number) => (
              <div key={index} className="relative group">
                {editingButtonIndex === index ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Input
                        value={editingButtonValue}
                        onChange={(e) => setEditingButtonValue(e.target.value)}
                        onBlur={finishEditingButton}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishEditingButton()
                          if (e.key === "Escape") cancelEditingButton()
                        }}
                        className={`h-8 text-xs ${
                          isOverLimit(editingButtonValue, "button") ? "border-destructive" : ""
                        }`}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeButton(index)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs ${
                          isOverLimit(editingButtonValue, "button") ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {editingButtonValue.length}/{limits.button} characters
                      </span>
                      {isOverLimit(editingButtonValue, "button") && (
                        <Badge variant="destructive" className="text-xs">
                          Too long
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-8 bg-transparent hover:bg-accent/10 transition-colors cursor-pointer"
                    onClick={() => startEditingButton(index)}
                  >
                    {button.text || `Button ${index + 1}`}
                    <Edit3 className="w-3 h-3 opacity-50 ml-auto" />
                  </Button>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`button-${index}`}
                  className="w-3 h-3 bg-accent border-2 border-white opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-md"
                  style={{ right: "-6px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}

            {buttons.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs h-8 border-2 border-dashed border-muted-foreground/30 hover:border-accent transition-colors"
                onClick={data.onAddButton}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Button
              </Button>
            )}
          </div>
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
            id="next-step"
            className="w-4 h-4 bg-primary border-3 border-white opacity-100 hover:scale-110 transition-transform"
            style={{
              position: "absolute",
              bottom: "8px",
              right: "-8px",
              zIndex: 10,
            }}
          />
        </div>
      </Card>
    </div>
  )
}
