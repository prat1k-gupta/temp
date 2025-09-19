"use client"

import React, { useState, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { 
  Camera, 
  Download, 
  Copy, 
  Check, 
  Image, 
  Code,
  Settings,
  Palette
} from "lucide-react"
import { toast } from "sonner"
import { 
  captureFlowScreenshot, 
  downloadScreenshot, 
  copyScreenshotToClipboard,
  type ScreenshotFormat,
  type ScreenshotOptions 
} from "@/utils/screenshot-utils"

interface ScreenshotModalProps {
  children: React.ReactNode
  flowElementRef: React.RefObject<HTMLElement>
}

export function ScreenshotModal({ children, flowElementRef }: ScreenshotModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [screenshotResult, setScreenshotResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  
  // Screenshot options
  const [format, setFormat] = useState<ScreenshotFormat>("png")
  const [quality, setQuality] = useState([0.9])
  const [pixelRatio, setPixelRatio] = useState([2])
  const [includeBackground, setIncludeBackground] = useState(true)
  const [backgroundColor, setBackgroundColor] = useState("#ffffff")

  const formatOptions = [
    { value: "png" as ScreenshotFormat, label: "PNG", icon: Image, description: "High quality raster image" },
    { value: "svg" as ScreenshotFormat, label: "SVG", icon: Code, description: "Scalable vector graphics" },
  ]

  const handleCapture = async () => {
    if (!flowElementRef.current) {
      toast.error("Flow element not found")
      return
    }

    setIsCapturing(true)
    try {
      const options: ScreenshotOptions = {
        format,
        quality: quality[0],
        pixelRatio: pixelRatio[0],
        backgroundColor,
        includeBackground,
      }

      const result = await captureFlowScreenshot(flowElementRef.current, options)
      setScreenshotResult(result)
      toast.success("Screenshot captured successfully!")
    } catch (error) {
      console.error("Screenshot capture failed:", error)
      toast.error(`Failed to capture screenshot: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsCapturing(false)
    }
  }

  const handleDownload = () => {
    if (!screenshotResult) return

    try {
      downloadScreenshot(screenshotResult)
      toast.success("Screenshot downloaded successfully!")
    } catch (error) {
      console.error("Download failed:", error)
      toast.error("Failed to download screenshot")
    }
  }

  const handleCopy = async () => {
    if (!screenshotResult) return

    try {
      await copyScreenshotToClipboard(screenshotResult)
      setCopied(true)
      toast.success("Screenshot copied to clipboard!")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Copy failed:", error)
      toast.error("Failed to copy to clipboard")
    }
  }

  const resetScreenshot = () => {
    setScreenshotResult(null)
    setCopied(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open)
      if (!open) {
        resetScreenshot()
      }
    }}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="min-w-[60vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Capture Flow Screenshot
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex gap-8 overflow-hidden">
          {/* Settings Panel */}
          <div className="w-96 flex flex-col gap-4 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">Format</Label>
                <div className="space-y-2">
                  {formatOptions.map((option) => {
                    const Icon = option.icon
                    return (
                      <div
                        key={option.value}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          format === option.value
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        onClick={() => setFormat(option.value)}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          <span className="font-medium">{option.label}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{option.description}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  <Label className="text-sm font-medium">Settings</Label>
                </div>

                {format === "png" && (
                  <div>
                    <Label className="text-sm">Quality: {Math.round(quality[0] * 100)}%</Label>
                    <Slider
                      value={quality}
                      onValueChange={setQuality}
                      max={1}
                      min={0.1}
                      step={0.1}
                      className="mt-2"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-sm">Pixel Ratio: {pixelRatio[0]}x</Label>
                  <Slider
                    value={pixelRatio}
                    onValueChange={setPixelRatio}
                    max={4}
                    min={1}
                    step={1}
                    className="mt-2"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Include Background</Label>
                  <Switch
                    checked={includeBackground}
                    onCheckedChange={setIncludeBackground}
                  />
                </div>

                {includeBackground && (
                  <div>
                    <Label className="text-sm flex items-center gap-2">
                      <Palette className="w-4 h-4" />
                      Background Color
                    </Label>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="w-8 h-8 rounded border"
                      />
                      <input
                        type="text"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border rounded"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                onClick={handleCapture}
                disabled={isCapturing}
                className="w-full flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {isCapturing ? "Capturing..." : "Capture Screenshot"}
              </Button>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="flex-1 flex flex-col gap-4">
            {screenshotResult ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{screenshotResult.format.toUpperCase()}</Badge>
                    <Badge variant="outline">
                      {screenshotResult.size.width} × {screenshotResult.size.height}
                    </Badge>
                  </div>
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

                <div className="flex-1 border rounded-lg overflow-hidden bg-gray-50">
                  <img
                    src={screenshotResult.dataUrl}
                    alt="Flow Screenshot"
                    className="w-full h-full object-contain"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center text-gray-500">
                  <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Configure settings and click "Capture Screenshot" to preview</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
          {screenshotResult && (
            <Button onClick={handleDownload} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download {screenshotResult.format.toUpperCase()}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
