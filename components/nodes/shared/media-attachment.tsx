"use client"

import { useState, useCallback } from "react"
import { ImageIcon, VideoIcon, FileAudioIcon, FileTextIcon, XIcon, PaperclipIcon, ExternalLinkIcon } from "lucide-react"
import { MediaModal } from "./media-modal"
import type { MediaAttachment as MediaAttachmentType, MediaType } from "@/types"

const ICON_MAP: Record<MediaType, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: FileAudioIcon,
  document: FileTextIcon,
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    return pathname.split("/").pop() || "media"
  } catch {
    return "media"
  }
}

interface MediaAttachmentProps {
  media?: MediaAttachmentType
  selected: boolean
  disabledTypes?: MediaType[]
  onUpdate: (media: MediaAttachmentType | undefined) => void
}

export function MediaAttachment({ media, selected, disabledTypes = [], onUpdate }: MediaAttachmentProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Reset error when URL changes
  if (media && loadError && media.url !== loadError) {
    setLoadError(null)
  }

  if (media) {
    const Icon = ICON_MAP[media.type]
    const isVisual = media.type === "image" || media.type === "video"

    return (
      <>
        <div className="relative group rounded-md overflow-hidden border bg-muted/50 mb-2">
          {isVisual ? (
            <div className="relative w-full">
              {media.type === "image" ? (
                loadError !== null ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-muted-foreground">
                    <ImageIcon className="h-4 w-4 shrink-0" />
                    <span className="text-xs truncate">Failed to load image</span>
                  </div>
                ) : (
                  <img
                    src={media.url}
                    alt="Media preview"
                    className={`w-full ${selected ? "rounded-md" : "h-24 object-cover"}`}
                    onError={() => setLoadError(media.url)}
                  />
                )
              ) : (
                <video
                  src={media.url}
                  className={`w-full ${selected ? "rounded-md" : "h-24 object-cover"}`}
                  controls={selected}
                  muted
                  preload="metadata"
                />
              )}
            </div>
          ) : media.type === "audio" ? (
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{filenameFromUrl(media.url)}</span>
              </div>
              {selected && (
                <audio src={media.url} controls preload="metadata" className="w-full h-8" />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{filenameFromUrl(media.url)}</span>
            </div>
          )}
          {selected && (
            <div className="absolute top-1 right-1 flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                className="rounded-full bg-background/80 p-1 hover:bg-background cursor-pointer"
                title="Replace media"
              >
                <PaperclipIcon className="h-3 w-3" />
              </button>
              <a
                href={media.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full bg-background/80 p-1 hover:bg-background cursor-pointer"
                title="Open in new tab"
              >
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(undefined) }}
                className="rounded-full bg-background/80 p-1 hover:bg-background cursor-pointer"
                title="Remove media"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        <MediaModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          initialMedia={media}
          disabledTypes={disabledTypes}
          onSave={onUpdate}
        />
      </>
    )
  }

  if (!selected) return null

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer transition-colors w-full"
      >
        <PaperclipIcon className="h-3.5 w-3.5" />
        <span>Add media</span>
      </button>
      <MediaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        disabledTypes={disabledTypes}
        onSave={onUpdate}
      />
    </>
  )
}
