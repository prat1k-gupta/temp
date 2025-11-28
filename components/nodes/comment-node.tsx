"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { MessageSquareText, Trash2, Edit3 } from "lucide-react"
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"

export function CommentNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(data.comment || "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentUser = "You" // In a real app, this would come from auth context
  const platform: Platform = data.platform || "web"
  const nodeLimits = getNodeLimits("comment", platform)
  const maxLength = nodeLimits.question?.max || 200

  useEffect(() => {
    if (!isEditing) {
      setEditValue(data.comment || "")
    }
  }, [data.comment, isEditing])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
      // Auto-resize on mount
      autoResizeTextarea()
    }
  }, [isEditing])

  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length <= maxLength) {
      setEditValue(value)
      // Auto-resize after state update
      setTimeout(autoResizeTextarea, 0)
    }
  }

  const handleSave = () => {
    console.log('[Comment Node] Saving comment:', editValue)
    console.log('[Comment Node] onUpdate function:', data.onUpdate)
    
    if (data.onUpdate) {
      const updates = {
        comment: editValue,
        editedBy: currentUser,
        editedAt: new Date().toISOString(),
      }
      console.log('[Comment Node] Calling onUpdate with:', updates)
      data.onUpdate(updates)
    } else {
      console.warn('[Comment Node] No onUpdate function provided')
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(data.comment || "")
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === "Escape") {
      handleCancel()
    }
  }

  return (
    <TooltipProvider>
      <div className="relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <Card
          className={`min-w-[180px] max-w-[250px] bg-yellow-50 border-yellow-200 shadow-lg transition-all duration-200 hover:shadow-xl ${
            selected ? "ring-2 ring-yellow-400" : ""
          } ${isEditing ? "ring-2 ring-blue-400" : ""}`}
        >
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <MessageSquareText className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="space-y-1">
                    <textarea
                      ref={textareaRef}
                      value={editValue}
                      onChange={handleTextareaChange}
                      onKeyDown={handleKeyDown}
                      className="w-full text-sm text-yellow-800 bg-transparent border-none outline-none resize-none min-h-[20px] max-h-[120px] placeholder-yellow-500 overflow-y-auto"
                      placeholder="Add your comment here..."
                      rows={1}
                    />
                    <div className="flex justify-between items-center text-xs text-yellow-600">
                      <span className="opacity-75">
                        {editValue.length}/{maxLength} characters
                      </span>
                      {editValue.length > maxLength * 0.8 && (
                        <span className="text-orange-500">
                          {maxLength - editValue.length} remaining
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p
                      className="text-sm text-yellow-800 whitespace-pre-wrap break-words cursor-text hover:bg-yellow-100 rounded px-1 py-0.5 transition-colors max-h-[100px] overflow-y-auto"
                      onClick={() => setIsEditing(true)}
                    >
                      {data.comment || "Add your comment here..."}
                    </p>
                    {data.comment && (data.createdBy || data.editedBy) && (
                      <div className="mt-1 text-xs text-yellow-600 opacity-75">
                        {data.editedBy ? <span>Edited by {data.editedBy}</span> : <span>By {data.createdBy}</span>}
                        {data.editedAt && (
                          <span className="ml-1">
                            •{" "}
                            {new Date(data.editedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {(isHovered || selected) && !isEditing && (
          <div className="absolute -top-2 -right-2 flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 w-6 p-0 rounded-full shadow-lg z-10 transition-all duration-200 bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit comment</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 w-6 p-0 rounded-full shadow-lg z-10 transition-all duration-200"
                  onClick={() => {
                    console.log('[Comment Node] Delete clicked, onDelete function:', data.onDelete)
                    data.onDelete?.()
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete comment</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {isEditing && (
          <div className="absolute -bottom-8 left-0 flex gap-1 bg-white rounded shadow-lg p-1 border z-20">
            <Button size="sm" variant="default" className="h-6 px-2 text-xs" onClick={handleSave}>
              Save
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs bg-transparent" onClick={handleCancel}>
              Cancel
            </Button>
            <span className="text-xs text-gray-500 self-center ml-1">Enter to save</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
