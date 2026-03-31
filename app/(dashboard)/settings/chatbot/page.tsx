"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Loader2, Trash2, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { useChatbotSettings, useUpdateChatbotSettings } from "@/hooks/queries"

interface VariableRow {
  key: string
  value: string
}

export default function ChatbotSettingsPage() {
  const { data: settings, isLoading } = useChatbotSettings()
  const updateSettings = useUpdateChatbotSettings()

  const [variables, setVariables] = useState<VariableRow[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [newKeyword, setNewKeyword] = useState("")

  useEffect(() => {
    if (settings) {
      const vars = Object.entries(settings.global_variables ?? {}).map(([key, value]) => ({
        key,
        value,
      }))
      setVariables(vars)
      setKeywords(settings.cancel_keywords ?? [])
    }
  }, [settings])

  function addVariable() {
    setVariables((prev) => [...prev, { key: "", value: "" }])
  }

  function updateVariable(index: number, field: "key" | "value", val: string) {
    setVariables((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: val } : row))
    )
  }

  function removeVariable(index: number) {
    setVariables((prev) => prev.filter((_, i) => i !== index))
  }

  function saveVariables() {
    const global_variables: Record<string, string> = {}
    for (const row of variables) {
      if (row.key.trim()) {
        global_variables[row.key.trim()] = row.value
      }
    }
    updateSettings.mutate(
      { global_variables },
      {
        onSuccess: () => toast.success("Global variables saved"),
        onError: (err) => toast.error(err.message || "Failed to save variables"),
      }
    )
  }

  function addKeyword() {
    const trimmed = newKeyword.trim()
    if (!trimmed || keywords.includes(trimmed)) return
    setKeywords((prev) => [...prev, trimmed])
    setNewKeyword("")
  }

  function removeKeyword(keyword: string) {
    setKeywords((prev) => prev.filter((k) => k !== keyword))
  }

  function saveKeywords() {
    updateSettings.mutate(
      { cancel_keywords: keywords },
      {
        onSuccess: () => toast.success("Cancel keywords saved"),
        onError: (err) => toast.error(err.message || "Failed to save keywords"),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Chatbot Settings</h1>
        <p className="text-sm text-muted-foreground">Configure global chatbot behaviour</p>
      </div>

      {/* Global Variables */}
      <Card>
        <CardHeader>
          <CardTitle>Global Variables</CardTitle>
          <CardDescription>
            Key-value pairs available across all flows as variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {variables.length === 0 && (
            <p className="text-sm text-muted-foreground">No variables yet. Add one below.</p>
          )}
          <div className="space-y-2">
            {variables.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Key"
                  value={row.key}
                  onChange={(e) => updateVariable(index, "key", e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => updateVariable(index, "value", e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="cursor-pointer text-destructive hover:text-destructive shrink-0"
                  onClick={() => removeVariable(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={addVariable}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Variable
            </Button>
            <Button
              size="sm"
              className="cursor-pointer"
              disabled={updateSettings.isPending}
              onClick={saveVariables}
            >
              {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cancel Keywords */}
      <Card>
        <CardHeader>
          <CardTitle>Cancel Keywords</CardTitle>
          <CardDescription>
            Messages that cancel and reset an active chatbot session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {keywords.length === 0 && (
            <p className="text-sm text-muted-foreground">No keywords yet. Add one below.</p>
          )}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary" className="flex items-center gap-1 pr-1">
                  {keyword}
                  <button
                    type="button"
                    className="cursor-pointer ml-1 rounded-sm hover:bg-muted"
                    onClick={() => removeKeyword(keyword)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. stop, cancel, quit"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addKeyword()
                }
              }}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={addKeyword}
            >
              Add
            </Button>
            <Button
              size="sm"
              className="cursor-pointer"
              disabled={updateSettings.isPending}
              onClick={saveKeywords}
            >
              {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
