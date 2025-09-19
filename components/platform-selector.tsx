"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface PlatformSelectorProps {
  platform: "web" | "whatsapp" | "instagram"
  onPlatformChange: (platform: "web" | "whatsapp" | "instagram") => void
}

export function PlatformSelector({ platform, onPlatformChange }: PlatformSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Platform:</span>
      <Select value={platform} onValueChange={onPlatformChange}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="web">Web</SelectItem>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
          <SelectItem value="instagram">Instagram</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
