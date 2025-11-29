"use client"

import React, { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Download, Copy, Check, Eye, Upload, FileText } from "lucide-react"
import { toast } from "sonner"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"

interface ExportModalProps {
  flowData: {
    nodes: any[]
    edges: any[]
    platform: string
    timestamp: string
  }
  onImportFlow: (nodes: Node[], edges: Edge[], platform: Platform) => void
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ExportModal({ flowData, onImportFlow, children, open: controlledOpen, onOpenChange }: ExportModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = onOpenChange || setInternalOpen
  const [copied, setCopied] = useState(false)
  const [importJson, setImportJson] = useState("")
  const [importError, setImportError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const jsonString = JSON.stringify(flowData, null, 2)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString)
      setCopied(true)
      toast.success("JSON copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Failed to copy to clipboard")
    }
  }

  const handleDownload = () => {
    const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(jsonString)
    const exportFileDefaultName = `magic-flow-${flowData.platform}-${Date.now()}.json`

    const linkElement = document.createElement("a")
    linkElement.setAttribute("href", dataStr)
    linkElement.setAttribute("download", exportFileDefaultName)
    linkElement.click()
    
    toast.success("Flow exported successfully!")
  }

  const validateFlowData = (data: any): { isValid: boolean; error?: string } => {
    if (!data || typeof data !== 'object') {
      return { isValid: false, error: "Invalid JSON structure" }
    }

    if (!Array.isArray(data.nodes)) {
      return { isValid: false, error: "Missing or invalid 'nodes' array" }
    }

    if (!Array.isArray(data.edges)) {
      return { isValid: false, error: "Missing or invalid 'edges' array" }
    }

    if (!data.platform || typeof data.platform !== 'string') {
      return { isValid: false, error: "Missing or invalid 'platform' field" }
    }

    // Validate platform value
    const validPlatforms = ['web', 'whatsapp', 'instagram']
    if (!validPlatforms.includes(data.platform)) {
      return { isValid: false, error: `Invalid platform: ${data.platform}. Must be one of: ${validPlatforms.join(', ')}` }
    }

    // Basic node validation
    for (const node of data.nodes) {
      if (!node.id || !node.type || !node.position) {
        return { isValid: false, error: "Invalid node structure: missing required fields (id, type, position)" }
      }
    }

    // Basic edge validation
    for (const edge of data.edges) {
      if (!edge.id || !edge.source || !edge.target) {
        return { isValid: false, error: "Invalid edge structure: missing required fields (id, source, target)" }
      }
    }

    return { isValid: true }
  }

  const handleImportFromText = () => {
    setImportError("")
    
    if (!importJson.trim()) {
      setImportError("Please enter JSON data")
      return
    }

    try {
      const parsedData = JSON.parse(importJson)
      const validation = validateFlowData(parsedData)
      
      if (!validation.isValid) {
        setImportError(validation.error || "Invalid flow data")
        return
      }

      onImportFlow(parsedData.nodes, parsedData.edges, parsedData.platform as Platform)
      setImportJson("")
      setIsOpen(false)
      toast.success("Flow imported successfully!")
    } catch (error) {
      setImportError("Invalid JSON format")
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.json')) {
      setImportError("Please select a JSON file")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportJson(content)
      setImportError("")
    }
    reader.onerror = () => {
      setImportError("Failed to read file")
    }
    reader.readAsText(file)
  }

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && (
        <DialogTrigger asChild>
          {children}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Export & Import Flow Data
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="export" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="flex-1 flex flex-col gap-4 mt-4">
            {/* Flow Info */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Platform: {flowData.platform}</Badge>
              <Badge variant="outline">Nodes: {flowData.nodes.length}</Badge>
              <Badge variant="outline">Edges: {flowData.edges.length}</Badge>
              <Badge variant="outline">
                {new Date(flowData.timestamp).toLocaleString()}
              </Badge>
            </div>

            {/* JSON Content */}
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">JSON Data</label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="flex items-center gap-2"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
              
              <Textarea
                value={jsonString}
                readOnly
                className="flex-1 min-h-[300px] max-h-[400px] font-mono text-sm resize-none overflow-y-auto"
                placeholder="Flow data will appear here..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Close
              </Button>
              <Button onClick={handleDownload} className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download JSON
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="flex-1 flex flex-col gap-4 mt-4">
            <div className="flex-1 flex flex-col gap-4">
              {/* File Upload */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Upload JSON File</label>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={handleFileSelect}
                    className="flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Select File
                  </Button>
                </div>
              </div>

              {/* JSON Input */}
              <div className="flex-1 flex flex-col gap-2">
                <label className="text-sm font-medium">Or Paste JSON Data</label>
                <Textarea
                  value={importJson}
                  onChange={(e) => {
                    setImportJson(e.target.value)
                    setImportError("")
                  }}
                  className="flex-1 min-h-[300px] max-h-[400px] font-mono text-sm resize-none overflow-y-auto"
                  placeholder="Paste your flow JSON data here..."
                />
                {importError && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded border">
                    {importError}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleImportFromText} 
                  className="flex items-center gap-2"
                  disabled={!importJson.trim()}
                >
                  <Upload className="w-4 h-4" />
                  Import Flow
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
