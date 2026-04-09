"use client"

import { useState, useMemo } from "react"
import { Send, FileIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useSendMedia } from "@/hooks/queries/use-messages"

interface MediaUploadPreviewProps {
  file: File
  contactId: string
  onClose: () => void
  onSent: () => void
}

function detectMediaType(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime.startsWith("audio/")) return "audio"
  return "document"
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaUploadPreview({ file, contactId, onClose, onSent }: MediaUploadPreviewProps) {
  const [caption, setCaption] = useState("")
  const { mutate: sendMedia, isPending } = useSendMedia(contactId)
  const mediaType = detectMediaType(file.type)
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])

  const handleSend = () => {
    sendMedia(
      { file, type: mediaType, caption: caption.trim() || undefined },
      {
        onSuccess: () => {
          URL.revokeObjectURL(previewUrl)
          onSent()
        },
      }
    )
  }

  const handleClose = () => {
    URL.revokeObjectURL(previewUrl)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {mediaType}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {mediaType === "image" && (
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-64 max-w-full rounded-lg object-contain"
            />
          )}

          {mediaType === "video" && (
            <video
              src={previewUrl}
              controls
              className="max-h-64 max-w-full rounded-lg"
            />
          )}

          {(mediaType === "document" || mediaType === "audio") && (
            <div className="flex items-center gap-3 rounded-lg border p-4 w-full">
              <FileIcon className="h-8 w-8 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
            </div>
          )}

          <Input
            placeholder="Add a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending} className="cursor-pointer">
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isPending} className="cursor-pointer">
            {isPending ? (
              <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
