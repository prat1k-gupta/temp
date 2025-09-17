"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { List, Plus, Edit3, X } from "lucide-react"
import { useState, useEffect } from "react"

const PLATFORM_LIMITS = {
  web: { question: 500, button: 50 },
  whatsapp: { question: 160, button: 20 },
  instagram: { question: 100, button: 15 },
}

export function WhatsAppListNode({ data, selected }: { data: any; selected?: boolean }) {
  const options = data.options || []
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingQuestion, setIsEditingQuestion] = useState(false)
  const [editingOptionIndex, setEditingOptionIndex] = useState<number | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingQuestionValue, setEditingQuestionValue] = useState("")
  const [editingOptionValue, setEditingOptionValue] = useState("")

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

  const startEditingOption = (index: number) => {
    setEditingOptionValue(options[index]?.text || "")
    setEditingOptionIndex(index)
  }

  const finishEditingOption = () => {
    if (editingOptionIndex !== null && data.onNodeUpdate) {
      const updatedOptions = [...options]
      updatedOptions[editingOptionIndex] = { ...updatedOptions[editingOptionIndex], text: editingOptionValue }
      console.log("[v0] Updating option", editingOptionIndex, "with text:", editingOptionValue)
      data.onNodeUpdate(data.id, { ...data, options: updatedOptions })
    }
    setEditingOptionIndex(null)
  }

  const cancelEditingOption = () => {
    if (editingOptionIndex !== null) {
      setEditingOptionValue(options[editingOptionIndex]?.text || "")
    }
    setEditingOptionIndex(null)
  }

  const removeOption = (index: number) => {
    const updatedOptions = options.filter((_: any, i: number) => i !== index)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, options: updatedOptions })
    }
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[300px] max-w-[350px] bg-card border-border shadow-lg transition-all duration-200 hover:shadow-xl hover:border-accent/50 ${
          selected ? "ring-2 ring-accent/50" : ""
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="w-4 h-4 text-accent" />
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
                  {data.label || "WhatsApp List"}
                  <Edit3 className="w-3 h-3 opacity-50" />
                </div>
              )}
            </div>
            <Badge variant="secondary" className="text-xs">
              WA
            </Badge>
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
                placeholder="Choose an option:"
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
              {data.question || "Choose an option:"}
            </div>
          )}

          <div className="space-y-1">
            {options.map((option: any, index: number) => (
              <div key={index} className="relative group">
                {editingOptionIndex === index ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30">
                      <span className="w-4 h-4 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">
                        {index + 1}
                      </span>
                      <Input
                        value={editingOptionValue}
                        onChange={(e) => setEditingOptionValue(e.target.value)}
                        onBlur={finishEditingOption}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishEditingOption()
                          if (e.key === "Escape") cancelEditingOption()
                        }}
                        className={`h-6 text-xs flex-1 ${
                          isOverLimit(editingOptionValue, "button") ? "border-destructive" : ""
                        }`}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(index)}
                        className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs ${
                          isOverLimit(editingOptionValue, "button") ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {editingOptionValue.length}/{limits.button} characters
                      </span>
                      {isOverLimit(editingOptionValue, "button") && (
                        <Badge variant="destructive" className="text-xs">
                          Too long
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => startEditingOption(index)}
                  >
                    <span className="w-4 h-4 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="flex-1">{option.text || `Option ${index + 1}`}</span>
                    <Edit3 className="w-3 h-3 opacity-50" />
                  </div>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${index}`}
                  className="w-3 h-3 bg-accent border-2 border-white opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-md"
                  style={{ right: "-6px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}

            {options.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs h-8 border-2 border-dashed border-muted-foreground/30 hover:border-accent transition-colors"
                onClick={data.onAddOption}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Option
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
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          id="next-step"
          className="w-4 h-4 bg-primary border-3 border-white opacity-100 hover:scale-110 transition-transform"
          style={{
            position: "absolute",
            bottom: "-8px",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
      </Card>
    </div>
  )
}
