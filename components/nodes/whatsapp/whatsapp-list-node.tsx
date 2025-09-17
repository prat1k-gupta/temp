"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { List, Plus, Edit3, X } from "lucide-react"
import { useState, useEffect } from "react"

const WHATSAPP_LIMITS = {
  question: 160,
  button: 20,
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

  const isOverLimit = (text: string, type: "question" | "button") => {
    return text.length > WHATSAPP_LIMITS[type]
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
      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center z-10 shadow-lg">
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
        </svg>
      </div>

      <Card
        className={`min-w-[300px] max-w-[350px] bg-card border-green-200 shadow-lg transition-all duration-200 hover:shadow-xl hover:border-green-400 ${
          selected ? "ring-2 ring-green-400" : ""
        }`}
      >
        <CardHeader className="pb-2 bg-green-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <List className="w-4 h-4 text-green-600" />
              {isEditingLabel ? (
                <Input
                  value={editingLabelValue}
                  onChange={(e) => setEditingLabelValue(e.target.value)}
                  onBlur={finishEditingLabel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishEditingLabel()
                    if (e.key === "Escape") cancelEditingLabel()
                  }}
                  className="h-6 text-sm font-medium bg-white border-green-300 focus:border-green-500"
                  autoFocus
                />
              ) : (
                <div
                  className="font-medium text-green-800 text-sm cursor-pointer hover:bg-green-100 px-1 py-0.5 rounded flex items-center gap-1"
                  onClick={startEditingLabel}
                >
                  {data.label || "WhatsApp List"}
                  <Edit3 className="w-3 h-3 opacity-50" />
                </div>
              )}
            </div>
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
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
                className={`text-sm min-h-[60px] resize-none bg-white border-green-300 focus:border-green-500 ${
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
                  {editingQuestionValue.length}/{WHATSAPP_LIMITS.question} characters
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
              className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:bg-green-50 p-2 rounded border border-green-200 hover:border-green-300 transition-colors"
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
                    <div className="flex items-center gap-2 p-2 rounded border border-green-200 bg-green-50">
                      <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
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
                        className={`h-6 text-xs flex-1 bg-white border-green-300 focus:border-green-500 ${
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
                        {editingOptionValue.length}/{WHATSAPP_LIMITS.button} characters
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
                    className="flex items-center gap-2 p-2 rounded border border-green-200 bg-green-50 text-xs hover:bg-green-100 transition-colors cursor-pointer"
                    onClick={() => startEditingOption(index)}
                  >
                    <span className="w-4 h-4 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="flex-1 text-green-800">{option.text || `Option ${index + 1}`}</span>
                    <Edit3 className="w-3 h-3 opacity-50" />
                  </div>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`option-${index}`}
                  className="w-3 h-3 bg-green-500 border-2 border-white opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-md"
                  style={{ right: "-6px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}

            {options.length < 10 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs h-8 border-2 border-dashed border-green-300 hover:border-green-500 hover:bg-green-50 transition-colors"
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
          className="w-4 h-4 bg-green-500 border-3 border-white opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="text-xs text-green-600 font-medium">Next Step</span>
        </div>
        <Handle
          type="source"
          position={Position.Bottom}
          id="next-step"
          className="w-4 h-4 bg-green-500 border-3 border-white opacity-100 hover:scale-110 transition-transform"
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
