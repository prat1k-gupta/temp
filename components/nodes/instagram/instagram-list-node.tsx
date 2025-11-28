"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Edit3, X } from "lucide-react"
import { InstagramIcon } from "@/components/platform-icons"
import { useState, useEffect } from "react"

const INSTAGRAM_LIMITS = {
  question: 100,
  button: 15,
}

export function InstagramListNode({ data, selected }: { data: any; selected?: boolean }) {
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

  const isOverLimit = (text: string, type: "question" | "button") => {
    return text.length > INSTAGRAM_LIMITS[type]
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

  const startEditingOption = (index: number) => {
    setEditingOptionValue(options[index]?.text || "")
    setEditingOptionIndex(index)
  }

  const finishEditingOption = () => {
    if (editingOptionIndex !== null && data.onNodeUpdate) {
      const updatedOptions = [...options]
      updatedOptions[editingOptionIndex] = { ...updatedOptions[editingOptionIndex], text: editingOptionValue }
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
        className={`min-w-[300px] max-w-[350px] bg-white border-purple-100 shadow-sm transition-all duration-200 hover:shadow-md hover:border-purple-200 ${
          selected ? "ring-1 ring-purple-300/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Instagram Icon - Inside header, left side */}
              <div className="w-5 h-5 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-md flex items-center justify-center flex-shrink-0">
                <InstagramIcon className="w-3 h-3 text-white" />
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
                  className="h-6 text-sm font-medium border-purple-200"
                  autoFocus
                />
              ) : (
                <div
                  className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-purple-50/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                  onClick={startEditingLabel}
                >
                  {data.label || "Instagram List"}
                  <Edit3 className="w-3 h-3 opacity-40" />
                </div>
              )}
            </div>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-purple-100 text-purple-700 border-purple-200">
              List
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-12 px-4">
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
                className={`text-sm min-h-[60px] resize-none border-purple-200 focus:border-purple-300 ${
                  isOverLimit(editingQuestionValue, "question") ? "border-red-300" : ""
                }`}
                placeholder="Choose an option:"
                autoFocus
              />
              <div className="flex justify-between items-center">
                <span
                  className={`text-xs ${
                    isOverLimit(editingQuestionValue, "question") ? "text-red-500" : "text-muted-foreground"
                  }`}
                >
                  {editingQuestionValue.length}/{INSTAGRAM_LIMITS.question}
                </span>
                {isOverLimit(editingQuestionValue, "question") && (
                  <Badge variant="destructive" className="text-xs h-5">
                    Too long
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:bg-purple-50/30 px-2 py-1.5 rounded border border-transparent hover:border-purple-100 transition-colors"
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
                    <div className="flex items-center gap-2 p-1.5 rounded border border-purple-200 bg-purple-50/20">
                      <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-medium flex-shrink-0">
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
                        className={`h-6 text-xs flex-1 border-purple-200 ${
                          isOverLimit(editingOptionValue, "button") ? "border-red-300" : ""
                        }`}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(index)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs ${isOverLimit(editingOptionValue, "button") ? "text-red-500" : "text-muted-foreground"}`}>
                        {editingOptionValue.length}/{INSTAGRAM_LIMITS.button}
                      </span>
                      {isOverLimit(editingOptionValue, "button") && (
                        <Badge variant="destructive" className="text-xs h-5">Too long</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 p-1.5 rounded border border-purple-100 bg-purple-50/20 text-xs hover:bg-purple-50/40 transition-colors cursor-pointer"
                    onClick={() => startEditingOption(index)}
                  >
                    <span className="w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-card-foreground">{option.text || `Option ${index + 1}`}</span>
                    <Edit3 className="w-3 h-3 opacity-40" />
                  </div>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${index}`}
                  className="w-2.5 h-2.5 bg-purple-400 border-2 border-background opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-sm"
                  style={{ right: "-5px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}

            {options.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs h-7 border border-dashed border-purple-200 hover:border-purple-300 hover:bg-purple-50/30 transition-colors text-muted-foreground"
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
          className="w-3 h-3 bg-purple-400 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium">Next</span>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          id="next-step"
          className="w-3 h-3 bg-purple-400 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          style={{
            position: "absolute",
            bottom: "-6px",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        />
      </Card>
    </div>
  )
}
