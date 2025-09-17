"use client"

import { memo, useState, useEffect } from "react"
import { BaseNode } from "../core/base-node"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, X, Edit2, Check, XIcon, Globe } from "lucide-react"
import { nodeRegistry } from "@/lib/node-registry"

interface FormField {
  id: string
  type: "text" | "email" | "number" | "textarea"
  label: string
  placeholder?: string
  required: boolean
}

interface WebFormNodeData {
  id: string
  title: string
  fields: FormField[]
  submitText: string
  onNodeUpdate: (id: string, updates: Partial<WebFormNodeData>) => void
  platform: string
}

export const WebFormNode = memo(({ data }: { data: WebFormNodeData }) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitleValue, setEditingTitleValue] = useState(data.title)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editingFieldValue, setEditingFieldValue] = useState("")

  const platform = nodeRegistry.getPlatform(data.platform)

  useEffect(() => {
    setEditingTitleValue(data.title)
  }, [data.title])

  const handleTitleSave = () => {
    data.onNodeUpdate(data.id, { title: editingTitleValue })
    setIsEditingTitle(false)
  }

  const handleTitleCancel = () => {
    setEditingTitleValue(data.title)
    setIsEditingTitle(false)
  }

  const addField = () => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      type: "text",
      label: "New Field",
      required: false,
    }
    data.onNodeUpdate(data.id, {
      fields: [...data.fields, newField],
    })
  }

  const removeField = (fieldId: string) => {
    data.onNodeUpdate(data.id, {
      fields: data.fields.filter((f) => f.id !== fieldId),
    })
  }

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    data.onNodeUpdate(data.id, {
      fields: data.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
    })
  }

  return (
    <BaseNode data={data}>
      <div className="min-w-[320px] max-w-[400px] p-4">
        {/* Web platform header with globe icon and blue branding */}
        <div className="flex items-center gap-2 mb-3 p-2 rounded-lg" style={{ backgroundColor: "#3b82f6" }}>
          <Globe className="w-4 h-4 text-white" />
          <span className="text-xs font-medium text-white">Web Form</span>
        </div>

        {/* Title */}
        <div className="mb-4">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                className="text-sm font-medium"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave()
                  if (e.key === "Escape") handleTitleCancel()
                }}
                autoFocus
              />
              <Button size="sm" variant="ghost" onClick={handleTitleSave}>
                <Check className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={handleTitleCancel}>
                <XIcon className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
              onClick={() => setIsEditingTitle(true)}
            >
              <h3 className="text-sm font-medium text-gray-900">{data.title}</h3>
              <Edit2 className="w-3 h-3 text-gray-400" />
            </div>
          )}
        </div>

        {/* Form Fields */}
        <div className="space-y-3 mb-4">
          {data.fields.map((field) => (
            <div key={field.id} className="group relative">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-gray-600">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeField(field.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {field.type === "textarea" ? (
                <textarea
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded resize-none"
                  rows={2}
                  disabled
                />
              ) : (
                <Input
                  type={field.type}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                  className="text-xs h-7"
                  disabled
                />
              )}
            </div>
          ))}
        </div>

        {/* Add Field Button */}
        <Button size="sm" variant="outline" onClick={addField} className="w-full mb-4 h-8 text-xs bg-transparent">
          <Plus className="w-3 h-3 mr-1" />
          Add Field
        </Button>

        {/* Submit Button Preview */}
        <Button className="w-full h-8 text-xs" style={{ backgroundColor: platform?.constraints.colors.primary }}>
          {data.submitText || "Submit"}
        </Button>
      </div>
    </BaseNode>
  )
})

WebFormNode.displayName = "WebFormNode"
