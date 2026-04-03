"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { MediaAttachment, MediaType } from "@/types"
import { ImageIcon, VideoIcon, FileAudioIcon, FileTextIcon } from "lucide-react"

const MEDIA_OPTIONS: Array<{ value: MediaType; label: string; icon: typeof ImageIcon; sizeHint: string }> = [
  { value: "image", label: "Image", icon: ImageIcon, sizeHint: "JPEG, PNG — max 5 MB" },
  { value: "video", label: "Video", icon: VideoIcon, sizeHint: "MP4 — max 16 MB" },
  { value: "audio", label: "Audio", icon: FileAudioIcon, sizeHint: "MP3, OGG, AAC, AMR — max 16 MB" },
  { value: "document", label: "Document", icon: FileTextIcon, sizeHint: "PDF, DOC, XLS, PPT, TXT — max 100 MB" },
]

const EXTENSION_MAP: Record<MediaType, string[]> = {
  image: [".jpg", ".jpeg", ".png"],
  video: [".mp4"],
  audio: [".mp3", ".ogg", ".amr", ".aac"],
  document: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"],
}

interface MediaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMedia?: MediaAttachment
  disabledTypes?: MediaType[]
  onSave: (media: MediaAttachment) => void
}

export function MediaModal({ open, onOpenChange, initialMedia, disabledTypes = [], onSave }: MediaModalProps) {
  const [mediaType, setMediaType] = useState<MediaType>(initialMedia?.type ?? "image")
  const [url, setUrl] = useState(initialMedia?.url ?? "")
  const [error, setError] = useState("")

  const handleDismiss = () => {
    setMediaType(initialMedia?.type ?? "image")
    setUrl(initialMedia?.url ?? "")
    setError("")
    onOpenChange(false)
  }

  const validate = (): boolean => {
    if (!url.trim()) {
      setError("URL is required")
      return false
    }
    try {
      new URL(url)
    } catch {
      setError("Enter a valid URL")
      return false
    }
    const extensions = EXTENSION_MAP[mediaType]
    const urlLower = url.toLowerCase().split("?")[0]
    if (!extensions.some(ext => urlLower.endsWith(ext))) {
      setError(`URL must end with ${extensions.join(", ")}`)
      return false
    }
    setError("")
    return true
  }

  const handleSave = () => {
    if (validate()) {
      onSave({ type: mediaType, url: url.trim() })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleDismiss() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Media</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Media Type</Label>
            <RadioGroup value={mediaType} onValueChange={(v) => { setMediaType(v as MediaType); setError("") }}>
              {MEDIA_OPTIONS.map(opt => {
                const Icon = opt.icon
                const disabled = disabledTypes.includes(opt.value)
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted ${
                      mediaType === opt.value ? "border-primary bg-primary/5" : ""
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <RadioGroupItem value={opt.value} disabled={disabled} />
                    <Icon className="h-4 w-4 shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.sizeHint}</div>
                    </div>
                  </label>
                )
              })}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Public URL</Label>
            <Input
              placeholder="https://example.com/image.jpg"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError("") }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
