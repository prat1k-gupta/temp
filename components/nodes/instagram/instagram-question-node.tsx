"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit3, Wand2, ArrowRight, X, Check } from "lucide-react"
import { InstagramIcon } from "@/components/platform-icons"
import { AIToolbar, AIButtonToolbar } from "@/components/ai"
import { getNodeLimits } from "@/constants"
import { useState, useEffect, useRef } from "react"
import type { Platform, ButtonData } from "@/types"
import { toast } from "sonner"
import { getCompactButtonItemClasses, getAddButtonFlexClasses, getDeleteButtonClasses, getGhostButtonClasses } from "@/utils/button-styles"

const INSTAGRAM_LIMITS = {
  question: 100,
  button: 15,
}

export function InstagramQuestionNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingQuestion, setIsEditingQuestion] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingQuestionValue, setEditingQuestionValue] = useState("")
  const [manualButtons, setManualButtons] = useState<ButtonData[]>(data.buttons || [])
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null)
  const [editingButtonText, setEditingButtonText] = useState("")
  const editingContainerRef = useRef<HTMLDivElement>(null)

  const platform = (data.platform || "instagram") as Platform
  const nodeType = "instagramQuestion"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxLength = nodeLimits.question?.max || INSTAGRAM_LIMITS.question
  const maxButtons = nodeLimits.buttons?.max || 10

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
    return type === "question" ? text.length > maxLength : text.length > INSTAGRAM_LIMITS.button
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

  const finishEditingQuestion = (e?: React.FocusEvent<HTMLTextAreaElement>) => {
    // Don't finish editing if focus is moving to an element within the editing container (like AI toolbar)
    if (e?.relatedTarget && editingContainerRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, question: editingQuestionValue })
    }
    setIsEditingQuestion(false)
  }

  const cancelEditingQuestion = () => {
    setEditingQuestionValue(data.question || "")
    setIsEditingQuestion(false)
  }

  // Manual button management
  const addManualButton = () => {
    if (manualButtons.length >= maxButtons) {
      toast.error(`Maximum ${maxButtons} buttons allowed`)
      return
    }
    const buttonId = `btn-${Date.now()}`
    const newButton: ButtonData = {
      id: buttonId,
      text: "",
      label: "",
      value: ""
    }
    const updated = [...manualButtons, newButton]
    setManualButtons(updated)
    setEditingButtonId(buttonId)
    setEditingButtonText("")
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, buttons: updated })
    }
  }

  const startEditingButton = (buttonId: string, currentText: string) => {
    setEditingButtonId(buttonId)
    setEditingButtonText(currentText)
  }

  const finishEditingButton = () => {
    if (!editingButtonId) return
    
    const updated = manualButtons.map(btn => 
      btn.id === editingButtonId 
        ? { ...btn, text: editingButtonText, label: editingButtonText, value: editingButtonText.toLowerCase().replace(/\s+/g, '_') }
        : btn
    )
    setManualButtons(updated)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, buttons: updated })
    }
    setEditingButtonId(null)
    setEditingButtonText("")
  }

  const deleteManualButton = (buttonId: string) => {
    const updated = manualButtons.filter(btn => btn.id !== buttonId)
    setManualButtons(updated)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, buttons: updated })
    }
  }

  // Sync manual buttons with data
  useEffect(() => {
    if (data.buttons && JSON.stringify(data.buttons) !== JSON.stringify(manualButtons)) {
      setManualButtons(data.buttons)
    }
  }, [data.buttons])

  const handleUpdateButtons = (newButtons: ButtonData[]) => {
    const questionText = editingQuestionValue || data.question

    if (!questionText?.trim()) {
      toast.error('Please add a question first')
      return
    }

    // Convert buttons to proper format
    const formattedButtons = newButtons.map(btn => ({
      text: btn.label || btn.text,
      id: btn.id,
      value: btn.value
    }))

    // Auto-convert to Quick Reply when buttons are generated
    if (data.onConvert) {
      data.onConvert(data.id, 'instagramQuickReply', { 
        ...data,
        question: questionText,
        buttons: formattedButtons
      })
      toast.success('Converted to Quick Reply!', {
        description: `Added ${formattedButtons.length} button${formattedButtons.length > 1 ? 's' : ''}`
      })
    }
  }

  const handleConvertWithManualButtons = () => {
    const questionText = editingQuestionValue || data.question

    if (!questionText?.trim()) {
      toast.error('Please add a question first')
      return
    }

    if (manualButtons.length === 0) {
      toast.error('No buttons to convert')
      return
    }

    // Check if all manual buttons have text
    const emptyButtons = manualButtons.filter(b => !b.text?.trim())
    if (emptyButtons.length > 0) {
      toast.error('Please fill in all button text')
      return
    }

    // Convert to Quick Reply node with manual buttons
    if (data.onConvert) {
      data.onConvert(data.id, 'instagramQuickReply', { 
        ...data,
        question: questionText,
        buttons: manualButtons.map(b => ({
          text: b.text,
          id: b.id,
          value: b.value
        }))
      })
      toast.success('Converted to Quick Reply!')
    }
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card border-pink-100 dark:border-pink-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-pink-200 dark:hover:border-pink-800 ${
          selected ? "ring-1 ring-pink-300/50 dark:ring-pink-600/50 shadow-md" : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
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
                className="h-6 text-sm font-medium border-pink-200 dark:border-pink-800"
                autoFocus
              />
            ) : (
              <div
                className="font-medium text-card-foreground text-sm cursor-pointer hover:bg-pink-50/50 dark:hover:bg-pink-900/20 px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors"
                onClick={startEditingLabel}
              >
                {data.label || "Instagram Question"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          {isEditingQuestion ? (
            <div ref={editingContainerRef} className="space-y-2 group/question">
              <Textarea
                value={editingQuestionValue}
                onChange={(e) => setEditingQuestionValue(e.target.value)}
                onBlur={(e) => finishEditingQuestion(e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingQuestion()
                  }
                  if (e.key === "Escape") cancelEditingQuestion()
                }}
                className={`text-sm min-h-[60px] resize-none border-pink-200 dark:border-pink-800 focus:border-pink-300 dark:focus:border-pink-700 ${
                  isOverLimit(editingQuestionValue, "question") ? "border-red-300" : ""
                }`}
                placeholder="Enter your question..."
                autoFocus
              />
              
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                <span
                  className={`text-xs ${
                    isOverLimit(editingQuestionValue, "question") ? "text-red-500" : "text-muted-foreground"
                  }`}
                >
                    {editingQuestionValue.length}/{maxLength}
                </span>
                {isOverLimit(editingQuestionValue, "question") && (
                  <Badge variant="destructive" className="text-xs h-5">
                    Too long
                  </Badge>
                )}
                </div>
                <div className="opacity-0 group-hover/question:opacity-100 transition-opacity">
                  <AIToolbar
                    value={editingQuestionValue}
                    onChange={setEditingQuestionValue}
                    nodeType={nodeType}
                    platform={platform}
                    field="question"
                    maxLength={maxLength}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-3 cursor-pointer hover:bg-pink-50/30 dark:hover:bg-pink-900/10 px-2 py-1.5 rounded border border-transparent hover:border-pink-100 dark:hover:border-pink-800 transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Enter your question..."}
            </div>
          )}

          {/* AI Button Generator */}
          {(data.question || editingQuestionValue) && manualButtons.length < 10 && (
            <AIButtonToolbar
              questionContext={editingQuestionValue || data.question}
              buttons={manualButtons.map((b: any) => ({ id: b.id || `btn-${Date.now()}`, label: b.text, value: b.value }))}
              onUpdateButtons={handleUpdateButtons}
              maxButtons={10}
              maxButtonLength={INSTAGRAM_LIMITS.button}
              nodeType={nodeType}
              platform={platform}
            />
          )}

          {/* Manual Buttons Section */}
          {(
            <div className="space-y-2">
              {manualButtons.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-pink-600 dark:text-pink-400">
                    Buttons ({manualButtons.length}/{maxButtons})
                  </span>
                </div>
              )}
              
              {/* Manual Buttons List */}
              {manualButtons.map((button) => {
                const buttonId = button.id || ""
                return (
                <div key={buttonId} className="flex items-center gap-1.5">
                  {editingButtonId === buttonId ? (
                    <div className="flex-1 flex items-center gap-1">
                      <Input
                        value={editingButtonText}
                        onChange={(e) => setEditingButtonText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            finishEditingButton()
                          } else if (e.key === "Escape") {
                            setEditingButtonId(null)
                            setEditingButtonText("")
                          }
                        }}
                        placeholder="Button text"
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => finishEditingButton()}
                        className={getGhostButtonClasses("h-7 w-7 p-0")}
                      >
                        <Check className="w-3 h-3 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteManualButton(buttonId)}
                        className={getDeleteButtonClasses()}
                      >
                        <X className="w-3 h-3 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditingButton(buttonId, button.text || "")}
                        className={getCompactButtonItemClasses(platform)}
                      >
                        {button.text || "Empty button"}
                      </Button>
                      <Button
            variant="ghost"
            size="sm"
                        onClick={() => deleteManualButton(buttonId)}
                        className={getDeleteButtonClasses()}
                      >
                        <X className="w-3 h-3 text-muted-foreground hover:text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              )
              })}

              {/* Action Buttons Row */}
              <div className="flex gap-1.5">
                {/* Add Manual Button */}
                {manualButtons.length < maxButtons && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      addManualButton()
                    }}
                    className={getAddButtonFlexClasses(platform)}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Button</span>
                  </Button>
                )}

                {/* Convert with Manual Buttons */}
                {manualButtons.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleConvertWithManualButtons()
                    }}
                    className="flex-1 h-7 px-2 text-xs gap-1 bg-pink-500 hover:bg-pink-600 text-white cursor-pointer"
                  >
                    <ArrowRight className="w-3 h-3" />
                    <span>Convert</span>
                  </Button>
                )}
              </div>
            </div>
          )}

        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-purple-400 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-pink-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}
