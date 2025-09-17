"use client"

import type { Node } from "@xyflow/react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Trash2,
  Plus,
  Settings,
  MessageCircle,
  MessageSquare,
  List,
  MessageSquareText,
  Play,
  GripVertical,
} from "lucide-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface PropertiesPanelProps {
  selectedNode: Node & {
    data : {
      buttons: any,
      options: any,
      label: string,
      question: string,
      comment: string,
    }
  } | null
  platform: "web" | "whatsapp" | "instagram"
  onNodeUpdate: (nodeId: string, data: any) => void
}

const PLATFORM_LIMITS = {
  web: { question: 500, button: 50 },
  whatsapp: { question: 160, button: 20 },
  instagram: { question: 100, button: 15 },
}

const NODE_ICONS = {
  start: Play,
  question: MessageCircle,
  quickReply: MessageSquare,
  whatsappList: List,
  comment: MessageSquareText,
}

const NODE_COLORS = {
  start: "bg-chart-2 text-white",
  question: "bg-accent text-accent-foreground",
  quickReply: "bg-chart-1 text-white",
  whatsappList: "bg-chart-4 text-white",
  comment: "bg-yellow-400 text-yellow-900",
}

function SortableButtonItem({
  button,
  index,
  onUpdate,
  onRemove,
  isOverLimit,
  limits,
}: {
  button: any
  index: number
  onUpdate: (index: number, text: string) => void
  onRemove: (index: number) => void
  isOverLimit: (text: string, type: "question" | "button") => boolean
  limits: any
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `button-${index}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/10 rounded"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <Input
          value={button.text || ""}
          onChange={(e) => onUpdate(index, e.target.value)}
          placeholder={`Button ${index + 1}`}
          className={`flex-1 ${isOverLimit(button.text || "", "button") ? "border-destructive" : ""}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex justify-between items-center ml-6">
        <span
          className={`text-xs ${
            isOverLimit(button.text || "", "button") ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {(button.text || "").length}/{limits.button} characters
        </span>
        {isOverLimit(button.text || "", "button") && (
          <Badge variant="destructive" className="text-xs">
            Too long
          </Badge>
        )}
      </div>
    </div>
  )
}

function SortableOptionItem({
  option,
  index,
  onUpdate,
  onRemove,
  isOverLimit,
  limits,
}: {
  option: any
  index: number
  onUpdate: (index: number, text: string) => void
  onRemove: (index: number) => void
  isOverLimit: (text: string, type: "question" | "button") => boolean
  limits: any
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `option-${index}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent/10 rounded"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium flex-shrink-0">
          {index + 1}
        </div>
        <Input
          value={option.text || ""}
          onChange={(e) => onUpdate(index, e.target.value)}
          placeholder={`Option ${index + 1}`}
          className={`flex-1 ${isOverLimit(option.text || "", "button") ? "border-destructive" : ""}`}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(index)}
          className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex justify-between items-center ml-12">
        <span
          className={`text-xs ${
            isOverLimit(option.text || "", "button") ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {(option.text || "").length}/{limits.button} characters
        </span>
        {isOverLimit(option.text || "", "button") && (
          <Badge variant="destructive" className="text-xs">
            Too long
          </Badge>
        )}
      </div>
    </div>
  )
}

export function PropertiesPanel({ selectedNode, platform, onNodeUpdate }: PropertiesPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  if (!selectedNode) {
    return null
  }

  const limits = PLATFORM_LIMITS[platform]
  const isOverLimit = (text: string, type: "question" | "button") => {
    return text.length > limits[type]
  }

  const NodeIcon = NODE_ICONS[selectedNode.type as keyof typeof NODE_ICONS] || Settings
  const nodeColor = NODE_COLORS[selectedNode.type as keyof typeof NODE_COLORS] || "bg-muted text-muted-foreground"

  const updateButton = (index: number, text: string) => {
    console.log("[v0] Updating button", index, "with text:", text)
    const buttons = [...(selectedNode.data.buttons || [])]
    buttons[index] = { ...(buttons[index] || {}), text }
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons })
  }

  const removeButton = (index: number) => {
    console.log("[v0] Removing button", index)
    const buttons = [...(selectedNode.data.buttons || [])]
    buttons.splice(index, 1)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons })
  }

  const addButton = () => {
    console.log("[v0] Adding new button")
    const buttons = [...(selectedNode.data.buttons || [])]
    buttons.push({ text: `Button ${buttons.length + 1}` })
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons })
  }

  const reorderButtons = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const buttons = [...(selectedNode.data.buttons || [])]
      const oldIndex = Number.parseInt(active.id.toString().split("-")[1])
      const newIndex = Number.parseInt(over.id.toString().split("-")[1])

      const reorderedButtons = arrayMove(buttons, oldIndex, newIndex)
      console.log("[v0] Reordering buttons from", oldIndex, "to", newIndex)
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, buttons: reorderedButtons })
    }
  }

  const updateOption = (index: number, text: string) => {
    console.log("[v0] Updating option", index, "with text:", text)
    const options = [...(selectedNode.data.options || [])]
    options[index] = { ...options[index], text }
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, options })
  }

  const removeOption = (index: number) => {
    console.log("[v0] Removing option", index)
    const options = [...(selectedNode.data.options || [])]
    options.splice(index, 1)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, options })
  }

  const addOption = () => {
    console.log("[v0] Adding new option")
    const options = [...(selectedNode.data.options || [])]
    options.push({ text: `Option ${options.length + 1}` })
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, options })
  }

  const reorderOptions = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const options = [...(selectedNode.data.options || [])]
      const oldIndex = Number.parseInt(active.id.toString().split("-")[1])
      const newIndex = Number.parseInt(over.id.toString().split("-")[1])

      const reorderedOptions = arrayMove(options, oldIndex, newIndex)
      console.log("[v0] Reordering options from", oldIndex, "to", newIndex)
      onNodeUpdate(selectedNode.id, { ...selectedNode.data, options: reorderedOptions })
    }
  }

  const getNodeTitle = () => {
    switch (selectedNode.type) {
      case "start":
        return "Start Node"
      case "question":
        return "Question Node"
      case "quickReply":
        return "Quick Reply Node"
      case "whatsappList":
        return "WhatsApp List Node"
      case "comment":
        return "Comment Node"
      default:
        return "Node Properties"
    }
  }

  const handleLabelChange = (value: string) => {
    console.log("[v0] Updating label:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, label: value })
  }

  const handleQuestionChange = (value: string) => {
    console.log("[v0] Updating question:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, question: value })
  }

  const handleCommentChange = (value: string) => {
    console.log("[v0] Updating comment:", value)
    onNodeUpdate(selectedNode.id, { ...selectedNode.data, comment: value })
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-lg ${nodeColor} flex items-center justify-center`}>
            <NodeIcon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">{getNodeTitle()}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {selectedNode.type === "comment" ? "NOTE" : platform.toUpperCase()}
              </Badge>
              <span className="text-xs text-muted-foreground">ID: {selectedNode.id}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Comment Node */}
          {selectedNode.type === "comment" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="comment-text" className="text-sm font-medium">
                  Comment Text
                </Label>
                <Textarea
                  id="comment-text"
                  value={selectedNode.data.comment || ""}
                  onChange={(e) => handleCommentChange(e.target.value)}
                  placeholder="Enter your comment..."
                  className="mt-2 min-h-[100px]"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Comments are for documentation and won't affect the chatbot flow.
                </p>
              </div>
            </div>
          )}

          {/* Interactive Nodes */}
          {(selectedNode.type === "question" ||
            selectedNode.type === "quickReply" ||
            selectedNode.type === "whatsappList") && (
            <>
              {/* Node Label */}
              <div>
                <Label htmlFor="node-label" className="text-sm font-medium">
                  Node Label
                </Label>
                <Input
                  id="node-label"
                  value={selectedNode.data.label || ""}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="Enter node label..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This label helps you identify the node in the flow.
                </p>
              </div>

              <Separator />

              {/* Question Text */}
              <div>
                <Label htmlFor="question-text" className="text-sm font-medium">
                  Question Text
                </Label>
                <Textarea
                  id="question-text"
                  value={selectedNode.data.question || ""}
                  onChange={(e) => handleQuestionChange(e.target.value)}
                  placeholder="Enter your question..."
                  className={`mt-2 min-h-[80px] ${
                    isOverLimit(selectedNode.data.question || "", "question") ? "border-destructive" : ""
                  }`}
                  rows={3}
                />
                <div className="flex justify-between items-center mt-2">
                  <span
                    className={`text-xs ${
                      isOverLimit(selectedNode.data.question || "", "question")
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {(selectedNode.data.question || "").length}/{limits.question} characters
                  </span>
                  {isOverLimit(selectedNode.data.question || "", "question") && (
                    <Badge variant="destructive" className="text-xs">
                      Limit exceeded
                    </Badge>
                  )}
                </div>
              </div>

              {/* Quick Reply Buttons */}
              {selectedNode.type === "quickReply" && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Buttons (Max 3)</Label>
                      {(selectedNode.data.buttons || []).length < 3 && (
                        <Button size="sm" variant="outline" onClick={addButton} className="h-7 px-2 bg-transparent">
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderButtons}>
                      <SortableContext
                        items={(selectedNode.data.buttons || []).map((_: any, index: number) => `button-${index}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {(selectedNode.data.buttons || []).map((button: any, index: number) => (
                            <SortableButtonItem
                              key={`button-${index}`}
                              button={button}
                              index={index}
                              onUpdate={updateButton}
                              onRemove={removeButton}
                              isOverLimit={isOverLimit}
                              limits={limits}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </>
              )}

              {/* WhatsApp List Options */}
              {selectedNode.type === "whatsappList" && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">Options (Max 10)</Label>
                      {(selectedNode.data.options || []).length < 10 && (
                        <Button size="sm" variant="outline" onClick={addOption} className="h-7 px-2 bg-transparent">
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderOptions}>
                      <SortableContext
                        items={(selectedNode.data.options || []).map((_: any, index: number) => `option-${index}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-3">
                          {(selectedNode.data.options || []).map((option: any, index: number) => (
                            <SortableOptionItem
                              key={`option-${index}`}
                              option={option}
                              index={index}
                              onUpdate={updateOption}
                              onRemove={removeOption}
                              isOverLimit={isOverLimit}
                              limits={limits}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                </>
              )}
            </>
          )}

          {/* Start Node */}
          {selectedNode.type === "start" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-chart-2 flex items-center justify-center">
                <Play className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-medium text-foreground mb-2">Flow Entry Point</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This is the starting point of your chatbot flow. It automatically begins the conversation and cannot be
                modified or deleted.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
