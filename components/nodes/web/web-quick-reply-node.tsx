"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit3, X, Globe } from "lucide-react"
import { useState, useEffect } from "react"
import { CHARACTER_LIMITS } from "@/constants/platform-limits"

const PLATFORM_LIMITS = CHARACTER_LIMITS

export function WebQuickReplyNode({ data, selected }: { data: any; selected?: boolean }) {
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
        className={`min-w-[280px] max-w-[320px] bg-white border-blue-100 shadow-sm transition-all duration-200 hover:shadow-md hover:border-blue-200 ${
          selected ? "ring-1 ring-blue-300/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* Web Icon - Inside header, left side */}
            <div className="w-5 h-5 bg-blue-500 rounded-md flex items-center justify-center flex-shrink-0">
              <Globe className="w-3 h-3 text-white" />
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
                className="font-medium text-gray-700 text-sm cursor-pointer hover:bg-blue-50/50 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                onClick={startEditingLabel}
              >
                {data.label || "Quick Reply"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2 pb-12 px-4">
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
                className={`text-sm min-h-[60px] resize-none border-blue-200 focus:border-blue-300 ${
                  isOverLimit(editingQuestionValue, "question") ? "border-red-300" : ""
                }`}
                placeholder="Enter your message..."
                autoFocus
              />
              <div className="flex justify-between items-center">
                <span
                  className={`text-xs ${
                    isOverLimit(editingQuestionValue, "question") ? "text-red-500" : "text-gray-400"
                  }`}
                >
                  {editingQuestionValue.length}/{limits.question}
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
              className="text-sm text-gray-600 line-clamp-2 cursor-pointer hover:bg-blue-50/30 px-2 py-1.5 rounded border border-transparent hover:border-blue-100 transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Choose an action..."}
            </div>
          )}

          <div className="space-y-1.5">
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
                        className={`h-7 text-xs border-blue-200 ${
                          isOverLimit(editingButtonValue, "button") ? "border-red-300" : ""
                        }`}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeButton(index)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-xs ${isOverLimit(editingButtonValue, "button") ? "text-red-500" : "text-gray-400"}`}>
                        {editingButtonValue.length}/{limits.button}
                      </span>
                      {isOverLimit(editingButtonValue, "button") && (
                        <Badge variant="destructive" className="text-xs h-5">Too long</Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs h-7 bg-blue-50/40 border-blue-100 hover:bg-blue-50 hover:border-blue-200 text-gray-700 transition-colors cursor-pointer"
                    onClick={() => startEditingButton(index)}
                  >
                    {button.text || `Button ${index + 1}`}
                    <Edit3 className="w-3 h-3 opacity-40 ml-auto" />
                  </Button>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`button-${index}`}
                  className="w-2.5 h-2.5 bg-blue-500 border-2 border-white opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-sm"
                  style={{ right: "-5px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}
          </div>

          {buttons.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs h-7 border border-dashed border-blue-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors text-gray-600"
              onClick={data.onAddButton}
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Button
            </Button>
          )}
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-blue-500 border-2 border-white opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 font-medium">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            id="next-step"
            className="w-3 h-3 bg-blue-500 border-2 border-white opacity-100 hover:scale-110 transition-transform"
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

