"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Download, Copy, Check, Eye } from "lucide-react"
import { toast } from "sonner"

interface ExportModalProps {
  flowData: {
    nodes: any[]
    edges: any[]
    platform: string
    timestamp: string
  }
  children: React.ReactNode
}

export function ExportModal({ flowData, children }: ExportModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Export Flow Data
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col gap-4">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
