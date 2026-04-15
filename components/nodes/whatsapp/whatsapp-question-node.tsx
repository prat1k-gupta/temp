"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VariablePickerTextarea } from "@/components/variable-picker-textarea"
import { VariableHighlightText } from "@/components/variable-highlight-text"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit3, ArrowRight, X, Check } from "lucide-react"
import { WhatsAppIcon } from "@/components/platform-icons"
import { MediaAttachment } from "@/components/nodes/shared/media-attachment"
import { AIToolbar, AIButtonToolbar } from "@/components/ai"
import { useState, useEffect, useRef } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform, ChoiceData } from "@/types"
import { toast } from "sonner"
import { getCompactButtonItemClasses, getAddButtonFlexClasses, getDeleteButtonClasses } from "@/utils/button-styles"
import { StoreAsPill } from "@/components/nodes/core/store-as-pill"
import { slugify } from "@/utils/flow-variables"

export function WhatsAppQuestionNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingQuestion, setIsEditingQuestion] = useState(false)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingQuestionValue, setEditingQuestionValue] = useState("")
  const [manualChoices, setManualChoices] = useState<ChoiceData[]>(data.choices ?? [])
  const [editingButtonId, setEditingButtonId] = useState<string | null>(null)
  const [editingButtonText, setEditingButtonText] = useState("")
  const editingContainerRef = useRef<HTMLDivElement>(null)

  const platform = (data.platform || "whatsapp") as Platform
  const nodeType = "whatsappQuestion"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxLength = nodeLimits.question?.max ?? 250
  const maxButtons = nodeLimits.buttons?.max ?? 3
  const maxButtonTextLength = nodeLimits.buttons?.textMaxLength ?? 20

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

  const finishEditingQuestion = (e?: React.FocusEvent<HTMLTextAreaElement>) => {
    // Don't finish editing if focus is moving to an element within the editing container (like AI toolbar)
    if (e?.relatedTarget && editingContainerRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    const updates: Record<string, any> = { ...data, question: editingQuestionValue }
    // Auto-generate storeAs from question if still empty
    if (!data.storeAs && editingQuestionValue.trim()) {
      updates.storeAs = slugify(editingQuestionValue)
    }
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, updates)
    }
    setIsEditingQuestion(false)
  }

  const cancelEditingQuestion = () => {
    setEditingQuestionValue(data.question || "")
    setIsEditingQuestion(false)
  }

  // Manual button management
  const addManualButton = () => {
    if (manualChoices.length >= maxButtons) {
      toast.error(`Maximum ${maxButtons} buttons allowed`)
      return
    }
    const buttonId = `btn-${Date.now()}`
    const newChoice: ChoiceData = {
      id: buttonId,
      text: "",
      label: "",
      value: ""
    }
    const updated = [...manualChoices, newChoice]
    setManualChoices(updated)
    setEditingButtonId(buttonId)
    setEditingButtonText("")
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, choices: updated })
    }
  }

  const startEditingButton = (buttonId: string, currentText: string) => {
    setEditingButtonId(buttonId)
    setEditingButtonText(currentText)
  }

  const finishEditingButton = () => {
    if (!editingButtonId) return

    const updated = manualChoices.map(btn =>
      btn.id === editingButtonId
        ? { ...btn, text: editingButtonText, label: editingButtonText, value: editingButtonText.toLowerCase().replace(/\s+/g, '_') }
        : btn
    )
    setManualChoices(updated)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, choices: updated })
    }
    setEditingButtonId(null)
    setEditingButtonText("")
  }

  const deleteManualButton = (buttonId: string) => {
    const updated = manualChoices.filter(btn => btn.id !== buttonId)
    setManualChoices(updated)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, choices: updated })
    }
  }

  // Sync manual choices with data
  useEffect(() => {
    if (data.choices && JSON.stringify(data.choices) !== JSON.stringify(manualChoices)) {
      setManualChoices(data.choices)
    }
  }, [data.choices])

  const handleUpdateButtons = (newButtons: ChoiceData[]) => {
    const questionText = editingQuestionValue || data.question

    if (!questionText?.trim()) {
      toast.error('Please add a question first')
      return
    }

    // Convert buttons to choices shape for the unified field
    const formattedChoices: ChoiceData[] = newButtons.map(btn => ({
      text: btn.label || btn.text || "",
      id: btn.id,
      value: btn.value
    }))

    // Auto-convert to Quick Reply when buttons are generated
    if (data.onConvert) {
      data.onConvert(data.id, 'whatsappQuickReply', {
        ...data,
        question: questionText,
        choices: formattedChoices
      })
      toast.success('Converted to Quick Reply!', {
        description: `Added ${formattedChoices.length} button${formattedChoices.length > 1 ? 's' : ''}`
      })
    }
  }

  const handleConvertWithManualButtons = () => {
    const questionText = editingQuestionValue || data.question

    if (!questionText?.trim()) {
      toast.error('Please add a question first')
      return
    }

    if (manualChoices.length === 0) {
      toast.error('No buttons to convert')
      return
    }

    // Check if all manual choices have text
    const emptyChoices = manualChoices.filter(b => !b.text?.trim())
    if (emptyChoices.length > 0) {
      toast.error('Please fill in all button text')
      return
    }

    // Convert to Quick Reply node with manual choices
    if (data.onConvert) {
      data.onConvert(data.id, 'whatsappQuickReply', {
        ...data,
        question: questionText,
        choices: manualChoices.map(b => ({
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
        className={`min-w-[260px] max-w-[300px] bg-card border-green-100 dark:border-green-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 ${selected ? "ring-1 ring-green-300/50 dark:ring-green-600/50 shadow-md" : ""
          }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* WhatsApp Icon - Inside header, left side */}
            <div className="w-5 h-5 bg-green-500 rounded-md flex items-center justify-center flex-shrink-0">
              <WhatsAppIcon className="w-3 h-3 text-white" />
            </div>
            {isEditingLabel ? (
              <Input
                value={editingLabelValue}
                onChange={(e) => setEditingLabelValue(e.target.value)}
                onFocus={() => data.onSnapshot?.()}
                onBlur={() => { finishEditingLabel(); data.onResumeTracking?.() }}
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
                {data.label || "WhatsApp Question"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          <MediaAttachment
            media={data.media}
            selected={!!selected}
            onUpdate={(media) => {
              if (data.onNodeUpdate) {
                data.onNodeUpdate(data.id, { ...data, media })
              }
            }}
          />
          {isEditingQuestion ? (
            <div ref={editingContainerRef} className="space-y-2 group/question">
              <VariablePickerTextarea
                value={editingQuestionValue}
                onValueChange={setEditingQuestionValue}
                onFocus={() => data.onSnapshot?.()}
                onBlur={(e) => { finishEditingQuestion(e as any); data.onResumeTracking?.() }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingQuestion()
                  }
                  if (e.key === "Escape") cancelEditingQuestion()
                }}
                className={`text-sm min-h-[60px] resize-none border-green-200 focus:border-green-300 ${isOverLimit(editingQuestionValue) ? "border-red-300" : ""
                  }`}
                placeholder={nodeLimits.question?.placeholder || "Enter your question..."}
                autoFocus
                flowVariables={data.flowVariablesRich || []}
                excludeVariable={data.storeAs || undefined}
              />

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs ${isOverLimit(editingQuestionValue) ? "text-red-500" : "text-muted-foreground"
                      }`}
                  >
                    {editingQuestionValue.length}/{maxLength}
                  </span>
                  {isOverLimit(editingQuestionValue) && (
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
              className="text-sm text-muted-foreground line-clamp-3 cursor-pointer hover:bg-green-50/30 px-2 py-1.5 rounded border border-transparent hover:border-green-100 transition-colors"
              onClick={startEditingQuestion}
            >
              <VariableHighlightText
                text={data.question || "Enter your question..."}
                flowVariables={data.flowVariables || []}
              />
            </div>
          )}

          {/* Save Response As */}
          <div className="border-t border-border/40 pt-2">
            <StoreAsPill
                storeAs={data.storeAs || ""}
                onUpdate={(value) => {
                  if (data.onNodeUpdate) {
                    data.onNodeUpdate(data.id, { ...data, storeAs: value })
                  }
                }}
                flowVariables={data.flowVariables || []}
                suggestedName={data.question || data.label}
              />
          </div>

          {/* AI Button Generator */}
          {(data.question || editingQuestionValue) && manualChoices.length < maxButtons && (
            <AIButtonToolbar
              questionContext={editingQuestionValue || data.question}
              buttons={manualChoices.map((b: any) => ({ id: b.id || `btn-${Date.now()}`, label: b.text, value: b.value }))}
              onUpdateButtons={handleUpdateButtons}
              maxButtons={maxButtons}
              maxButtonLength={maxButtonTextLength}
              nodeType={nodeType}
              platform={platform}
            />
          )}

          {/* Manual Buttons Section */}
          {(
            <div className="space-y-2">
              {manualChoices.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    Buttons ({manualChoices.length}/{maxButtons})
                  </span>
                </div>
              )}

              {/* Manual Buttons List */}
              {manualChoices.map((button) => {
                const buttonId = button.id || ""
                return (
                  <div key={buttonId} className="flex items-center gap-1.5">
                    {editingButtonId === buttonId ? (
                      <div className="flex-1 flex items-center gap-1">
                        <Input
                          value={editingButtonText}
                          onChange={(e) => setEditingButtonText(e.target.value)}
                          onFocus={() => data.onSnapshot?.()}
                          onBlur={() => { finishEditingButton(); data.onResumeTracking?.() }}
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
                          className="h-7 w-7 p-0"
                        >
                          <Check className="w-3 h-3 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteManualButton(buttonId)}
                          className="h-7 w-7 p-0"
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
                {manualChoices.length < maxButtons && (
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
                    Add Button
                  </Button>
                )}

                {/* Convert with Manual Buttons */}
                {manualChoices.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleConvertWithManualButtons()
                    }}
                    className="flex-1 h-7 px-2 text-xs gap-1 bg-green-500 hover:bg-green-600"
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
          className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}
