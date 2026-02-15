"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit3, X, Sparkles, Minimize2, Loader2 } from "lucide-react"
import { WhatsAppIcon } from "@/components/platform-icons"
import { AIToolbar, AIButtonToolbar } from "@/components/ai"
import { useAIButtonGenerator } from "@/hooks/use-node-ai"
import { useState, useEffect, useRef } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform, ButtonData } from "@/types"
import { toast } from "sonner"
import { getButtonItemClasses, getAddButtonClasses, getDeleteButtonClasses, getGhostButtonClasses } from "@/utils/button-styles"

export function WhatsAppQuickReplyNode({ data, selected }: { data: any; selected?: boolean }) {
  const buttons = data.buttons || []
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [isEditingQuestion, setIsEditingQuestion] = useState(false)
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState("")
  const [editingQuestionValue, setEditingQuestionValue] = useState("")
  const [editingButtonValue, setEditingButtonValue] = useState("")
  const editingContainerRef = useRef<HTMLDivElement>(null)
  const [improvingButtonIndex, setImprovingButtonIndex] = useState<number | null>(null)

  const platform = (data.platform || "whatsapp") as Platform
  const nodeType = "whatsappQuickReply"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxQuestionLength = nodeLimits.question?.max || 160
  const maxButtonLength = nodeLimits.buttons?.textMaxLength || 20
  const maxButtons = nodeLimits.buttons?.max || 10

  // AI hook for button generation and improvement
  const ai = useAIButtonGenerator(nodeType, platform)

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
    return type === "question" ? text.length > maxQuestionLength : text.length > maxButtonLength
  }

  const startEditingLabel = () => {
    setEditingLabelValue(data.label || "")
    setIsEditingLabel(true)
  }

  const finishEditingLabel = () => {
    if (data.onNodeUpdate) {
      if (editingLabelValue.length > maxButtonLength) {
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

  const finishEditingQuestion = (e?: React.FocusEvent<HTMLTextAreaElement>) => {
    // Don't finish editing if focus is moving to an element within the editing container (like AI toolbar)
    if (e?.relatedTarget && editingContainerRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    if (data.onNodeUpdate) {
      if (editingQuestionValue.length > maxQuestionLength) {
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
      if (editingButtonValue.length > maxButtonLength) {
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

  const handleUpdateButtons = (newButtons: ButtonData[]) => {
    const formattedButtons = newButtons.map(btn => ({
      text: btn.label,
      id: btn.id,
      value: btn.value
    }))
    
    // If we have more buttons than the Quick Reply limit, trigger conversion to List
    if (formattedButtons.length > maxButtons) {
      handleConvertToListWithButtons(formattedButtons)
    } else {
      if (data.onNodeUpdate) {
        data.onNodeUpdate(data.id, { ...data, buttons: formattedButtons })
      }
    }
  }

  const handleConvertToListWithButtons = (buttons: any[]) => {
    const questionText = editingQuestionValue || data.question

    if (!questionText?.trim()) {
      toast.error('Please add a question first')
      return
    }

    // Convert buttons to options
    const options = buttons.map((b: any) => ({
      id: b.id || `opt-${Date.now()}-${Math.random()}`,
      text: b.text || b.label,
      value: b.value || b.text?.toLowerCase().replace(/\s+/g, '_')
    }))

    // Convert to List node
    if (data.onConvert) {
      data.onConvert(data.id, 'whatsappList', { 
        ...data,
        question: questionText,
        options,
        buttons: undefined // Remove buttons field
      })
      toast.success('Upgraded to WhatsApp List!', {
        description: `Now you have ${options.length} options (was limited to 3 buttons)`
      })
    }
  }

  const handleImproveButton = async (index: number) => {
    const button = buttons[index]
    if (!button || !button.text?.trim()) {
      toast.error('Please add text to the button first')
      return
    }

    setImprovingButtonIndex(index)
    try {
      const result = await ai.improveCopy(button.text, 'button', {
        maxLength: maxButtonLength,
        context: {
          purpose: 'WhatsApp button label',
          flowContext: data.question || ''
        }
      })

      if (result) {
        const updatedButtons = [...buttons]
        updatedButtons[index] = {
          ...button,
          text: result.improvedText
        }
        if (data.onNodeUpdate) {
          data.onNodeUpdate(data.id, { ...data, buttons: updatedButtons })
        }
        toast.success('Button improved!', {
          description: result.improvements[0] || 'Label enhanced'
        })
      }
    } catch (error) {
      toast.error('Failed to improve button text')
    } finally {
      setImprovingButtonIndex(null)
    }
  }

  const handleShortenButton = async (index: number) => {
    const button = buttons[index]
    if (!button) return

    // Get context from other buttons
    const otherButtons = buttons
      .filter((_: any, i: number) => i !== index)
      .map((b: any) => b.text)
      .filter(Boolean)

    const result = await ai.shortenText(button.text, maxButtonLength, {
      context: {
        purpose: 'WhatsApp button label',
        flowContext: data.question || '',
        existingButtons: otherButtons
      }
    })

    if (result) {
      const updatedButtons = [...buttons]
      updatedButtons[index] = {
        ...button,
        text: result.shortenedText
      }
      if (data.onNodeUpdate) {
        data.onNodeUpdate(data.id, { ...data, buttons: updatedButtons })
      }
      // Also update the editing value if we're editing this button
      if (editingButtonIndex === index) {
        setEditingButtonValue(result.shortenedText)
      }
      toast.success('Button shortened!', {
        description: `Reduced to ${result.shortenedText.length} characters`
      })
    }
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[280px] max-w-[320px] bg-card border-green-100 dark:border-green-900 shadow-sm transition-all duration-200 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 ${
          selected ? "ring-1 ring-green-300/50 dark:ring-green-600/50 shadow-md" : ""
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
                {data.label || "Quick Reply"}
                <Edit3 className="w-3 h-3 opacity-40" />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2 pb-12 px-4">
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
                className={`text-sm min-h-[60px] resize-none border-green-200 focus:border-green-300 ${
                  isOverLimit(editingQuestionValue, "question") ? "border-red-300" : ""
                }`}
                placeholder="Enter your message..."
                autoFocus
              />
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
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
                <div className="opacity-0 group-hover/question:opacity-100 transition-opacity">
                  <AIToolbar
                    value={editingQuestionValue}
                    onChange={setEditingQuestionValue}
                    nodeType={nodeType}
                    platform={platform}
                    field="question"
                    maxLength={maxQuestionLength}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground line-clamp-2 cursor-pointer hover:bg-green-50/30 px-2 py-1.5 rounded border border-transparent hover:border-green-100 transition-colors"
              onClick={startEditingQuestion}
            >
              {data.question || "Choose an action..."}
            </div>
          )}

          {/* AI Button Generator */}
          {(data.question || editingQuestionValue) && buttons.length < 10 && (
            <AIButtonToolbar
              questionContext={editingQuestionValue || data.question}
              buttons={buttons.map((b: any) => ({ id: b.id || `btn-${Date.now()}`, label: b.text, value: b.value }))}
              onUpdateButtons={handleUpdateButtons}
              maxButtons={10} // Allow up to 10, will auto-convert to List if needed
              maxButtonLength={maxButtonLength}
              nodeType={nodeType}
              platform={platform}
            />
          )}

          <div className="space-y-1.5">
            {buttons.map((button: any, index: number) => (
              <div key={index} className="relative group">
                {editingButtonIndex === index ? (
                  <div className="space-y-2 group/button-edit">
                    <div className="flex items-center gap-1">
                      <Input
                        value={editingButtonValue}
                        onChange={(e) => setEditingButtonValue(e.target.value)}
                        onBlur={finishEditingButton}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishEditingButton()
                          if (e.key === "Escape") cancelEditingButton()
                        }}
                        className={`h-7 text-xs border-green-200 ${
                          isOverLimit(editingButtonValue, "button") ? "border-red-300" : ""
                        }`}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeButton(index)}
                        className={getDeleteButtonClasses()}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                      <span className={`text-xs ${isOverLimit(editingButtonValue, "button") ? "text-red-500" : "text-muted-foreground"}`}>
                        {editingButtonValue.length}/{maxButtonLength}
                      </span>
                      {isOverLimit(editingButtonValue, "button") && (
                        <Badge variant="destructive" className="text-xs h-5">Too long</Badge>
                        )}
                      </div>
                      {isOverLimit(editingButtonValue, "button") && (
                        <div className="opacity-0 group-hover/button-edit:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleShortenButton(index)
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                            disabled={ai.loading}
                            className={getGhostButtonClasses("h-5 px-1.5 text-xs gap-1 hover:bg-purple-50 dark:hover:bg-purple-900/20")}
                            title="Shorten with AI"
                          >
                            <Minimize2 className="w-3 h-3 text-purple-500" />
                            <span className="text-purple-600 dark:text-purple-400">Shorten</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className={`${getButtonItemClasses(platform)} group/btn`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-sparkle-container]')) {
                        return
                      }
                      startEditingButton(index)
                    }}
                  >
                    {button.text || `Button ${index + 1}`}
                    <div className="ml-auto flex items-center gap-1">
                      <div 
                        data-sparkle-container
                        className="flex items-center"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleImproveButton(index)
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                      >
                        {improvingButtonIndex === index ? (
                          <Loader2 className="w-3 h-3 text-primary animate-spin" />
                        ) : (
                          <Sparkles 
                            className="w-3 h-3 text-primary opacity-60 group-hover/btn:opacity-100 transition-opacity cursor-pointer hover:opacity-100" 
                          />
                        )}
                      </div>
                      <Edit3 className="w-3 h-3 opacity-40" />
                    </div>
                  </Button>
                )}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`button-${index}`}
                  className="w-2.5 h-2.5 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-all duration-200 rounded-full shadow-sm"
                  style={{ right: "-5px", top: "50%", transform: "translateY(-50%)" }}
                />
              </div>
            ))}
          </div>

          {buttons.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              className={getAddButtonClasses(platform)}
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
          className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            id="next-step"
            className="w-3 h-3 bg-green-500 border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}
