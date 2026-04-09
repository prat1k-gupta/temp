"use client"

import { useState } from "react"
import { Search, Loader2, MessageSquareText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useCannedResponses } from "@/hooks/queries/use-canned-responses"
import { apiClient } from "@/lib/api-client"
import type { Contact, CannedResponse } from "@/types/chat"

const CATEGORY_LABELS: Record<string, string> = {
  greeting: "Greetings",
  support: "Support",
  sales: "Sales",
  closing: "Closing",
  general: "General",
}

interface CannedResponsePickerProps {
  contact: Contact
  externalOpen: boolean
  externalSearch: string
  onSelect: (content: string) => void
  onClose: () => void
}

export function CannedResponsePicker({
  contact,
  externalOpen,
  externalSearch,
  onSelect,
  onClose,
}: CannedResponsePickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const { data, isLoading } = useCannedResponses()

  const isOpen = externalOpen || internalOpen

  // Use external search when externally triggered, internal search when opened via button
  const activeSearch = externalOpen ? externalSearch : searchQuery

  const responses = data?.canned_responses ?? []
  const query = activeSearch.toLowerCase()
  const filtered = query
    ? responses.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.content.toLowerCase().includes(query) ||
          (r.shortcut && r.shortcut.toLowerCase().includes(query))
      )
    : responses

  // Group by category
  const grouped: Record<string, CannedResponse[]> = {}
  for (const r of filtered) {
    const cat = r.category || "general"
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(r)
  }

  function replacePlaceholders(content: string): string {
    return content
      .replace(/\{\{contact_name\}\}/gi, contact.profile_name || contact.name || "there")
      .replace(/\{\{phone_number\}\}/gi, contact.phone_number || "")
  }

  function selectResponse(response: CannedResponse) {
    const content = replacePlaceholders(response.content)
    onSelect(content)
    apiClient.post(`/api/canned-responses/${response.id}/use`, {}).catch(() => {})
    handleClose()
  }

  function handleClose() {
    setInternalOpen(false)
    setSearchQuery("")
    onClose()
  }

  function handleOpenChange(open: boolean) {
    setInternalOpen(open)
    if (!open) handleClose()
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors flex-shrink-0 cursor-pointer"
          title="Canned Responses"
        >
          <MessageSquareText className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search responses..."
              className="pl-8 h-9"
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No canned responses found
            </div>
          ) : (
            <div className="p-2">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </div>
                  {items.map((response) => (
                    <button
                      key={response.id}
                      onClick={() => selectResponse(response)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-muted transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{response.name}</span>
                        {response.shortcut && (
                          <span className="text-xs font-mono text-muted-foreground">
                            /{response.shortcut}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {response.content}
                      </p>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
