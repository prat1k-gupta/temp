"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { List, Plus, Edit3, X } from "lucide-react"
import { WhatsAppIcon } from "@/components/platform-icons"
import { useState, useEffect } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"
import { getAddButtonClasses, getDeleteButtonSmallClasses } from "@/utils/button-styles"

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

  const platform = (data.platform || "whatsapp") as Platform
  const nodeType = "whatsappInteractiveList"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxQuestionLength = nodeLimits.question?.max || 160
  const maxOptionLength = nodeLimits.options?.textMaxLength || 20
  const maxOptions = nodeLimits.options?.max || 10

  const isOverLimit = (text: string, type: "question" | "option") => {
    return type === "question" ? text.length > maxQuestionLength : text.length > maxOptionLength
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
        className={`min-w-[300px] max-w-[350px] bg-card border-green-100 dark:border-green-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 ${
          selected ? "ring-1 ring-green-300/50 dark:ring-green-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* WhatsApp Icon - Inside header, left side */}
              <div className="w-5 h-5 bg-green-500 rounded-md flex items-center justify-center flex-shrink-0">
                <WhatsAppIcon className="w-3 h-3 text-white" />
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
                  className="h-6 text-sm font-medium border-green-200"
                  autoFocus
                />
              ) : (
                <div
                  className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-green-50/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                  onClick={startEditingLabel}
                >
                  {data.label || "WhatsApp List"}
                  <Edit3 className="w-3 h-3 opacity-40" />
                </div>
              )}
            </div>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-green-100 text-green-700 border-green-200">
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
                className={`text-sm min-h-[60px] resize-none border-green-200 focus:border-green-300 ${
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
                  {editingQuestionValue.length}/{maxQuestionLength}
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
              className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:bg-green-50/30 px-2 py-1.5 rounded border border-transparent hover:border-green-100 transition-colors"
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
                    <div className="flex items-center gap-2 p-1.5 rounded border border-green-200 bg-green-50/20">
                      <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-medium flex-shrink-0">
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
                        className={`h-6 text-xs flex-1 border-green-200 ${
                          isOverLimit(editingOptionValue, "option") ? "border-red-300" : ""
                        }`}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOption(index)}
                        className={getDeleteButtonSmallClasses()}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs ${isOverLimit(editingOptionValue, "option") ? "text-red-500" : "text-muted-foreground"}`}>
                        {editingOptionValue.length}/{maxOptionLength}
                      </span>
                      {isOverLimit(editingOptionValue, "option") && (
                        <Badge variant="destructive" className="text-xs h-5">Too long</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 p-1.5 rounded border border-green-100 bg-green-50/20 text-xs hover:bg-green-50/40 transition-colors cursor-pointer"
                    onClick={() => startEditingOption(index)}
                  >
                    <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px] font-medium">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-card-foreground">{option.text || `Option ${index + 1}`}</span>
                    <Edit3 className="w-3 h-3 opacity-40" />
                  </div>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={option.id || `option-${index}`}
                  className="w-2.5 h-2.5 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-sm"
                  style={{ right: "-5px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}

            {options.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                className={getAddButtonClasses(platform)}
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
          className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          id="next-step"
          className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />
      </Card>
    </div>
  )
}
