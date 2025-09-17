"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { MessageSquareText, Trash2, Edit3 } from "lucide-react"

export function CommentNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(data.comment || "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentUser = "You" // In a real app, this would come from auth context

  useEffect(() => {
    if (!isEditing) {
      setEditValue(data.comment || "")
    }
  }, [data.comment, isEditing])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    if (data.onUpdate) {
      data.onUpdate({
        comment: editValue,
        editedBy: currentUser,
        editedAt: new Date().toISOString(),
      })
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
                  <textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={handleSave}
                    className="w-full text-sm text-yellow-800 bg-transparent border-none outline-none resize-none min-h-[20px] placeholder-yellow-500"
                    placeholder="Add your comment here..."
                    rows={Math.max(1, editValue.split("\n").length)}
                  />
                ) : (
                  <div>
                    <p
                      className="text-sm text-yellow-800 whitespace-pre-wrap break-words cursor-text hover:bg-yellow-100 rounded px-1 py-0.5 transition-colors"
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
                  onClick={() => data.onDelete?.()}
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
