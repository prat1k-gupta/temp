"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Plus, Edit3, X } from "lucide-react"
import { useState, useEffect } from "react"

const INSTAGRAM_LIMITS = {
  question: 100,
  button: 15,
}

export function InstagramQuickReplyNode({ data, selected }: { data: any; selected?: boolean }) {
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

  const startEditingButton = (index: number) => {
    setEditingButtonValue(buttons[index]?.text || "")
    setEditingButtonIndex(index)
  }

  const finishEditingButton = () => {
    if (editingButtonIndex !== null && data.onNodeUpdate) {
      const updatedButtons = [...buttons]
      updatedButtons[editingButtonIndex] = { ...updatedButtons[editingButtonIndex], text: editingButtonValue }
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
      <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-full flex items-center justify-center z-10 shadow-lg">
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      </div>

      <Card
        className={`min-w-[280px] max-w-[320px] bg-card border-pink-200 shadow-lg transition-all duration-200 hover:shadow-xl hover:border-pink-400 ${
          selected ? "ring-2 ring-pink-400" : ""
        }`}
      >
        <CardHeader className="pb-2 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-pink-600" />
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onBlur={finishEditingLabel}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditingLabel()
                  if (e.key === "Escape") cancelEditingLabel()
                }}
                className="h-6 text-sm font-medium bg-white border-pink-300 focus:border-pink-500"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-pink-800 text-sm cursor-pointer hover:bg-pink-100 px-1 py-0.5 rounded flex items-center gap-1"
                onClick={startEditingLabel}
              >
                {data.label || "Instagram Quick Reply"}
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
                className={`text-sm min-h-[60px] resize-none bg-white border-pink-300 focus:border-pink-500 ${
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
                  {editingQuestionValue.length}/{INSTAGRAM_LIMITS.question} characters
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
              className="text-sm text-muted-foreground p-2 bg-gradient-to-r from-purple-50 to-pink-50 rounded border border-pink-200 cursor-pointer hover:from-purple-100 hover:to-pink-100 hover:border-pink-300 transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Choose an action..."}
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
                        className={`h-8 text-xs bg-white border-pink-300 focus:border-pink-500 ${
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
                        {editingButtonValue.length}/{INSTAGRAM_LIMITS.button} characters
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
                    className="w-full justify-start text-xs h-8 bg-gradient-to-r from-purple-100 to-pink-100 border-pink-200 hover:from-purple-150 hover:to-pink-150 hover:border-pink-300 text-pink-800 transition-colors cursor-pointer"
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
                  className="w-3 h-3 bg-pink-500 border-2 border-white opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-md"
                  style={{ right: "-6px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}
          </div>

          {buttons.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-xs h-8 border-2 border-dashed border-pink-300 hover:border-pink-500 hover:bg-pink-50 transition-colors"
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
          className="w-4 h-4 bg-pink-500 border-3 border-white opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-2 flex items-center gap-2">
          <span className="text-xs text-pink-600 font-medium">Next Step</span>
          <Handle
            type="source"
            position={Position.Right}
            id="next-step"
            className="w-4 h-4 bg-pink-500 border-3 border-white opacity-100 hover:scale-110 transition-transform"
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
