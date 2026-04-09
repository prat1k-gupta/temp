"use client"

import { useState, useCallback } from "react"
import { X, Phone, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useContact } from "@/hooks/queries/use-contacts"
import { useContactSessionData, useContactVariables } from "@/hooks/queries/use-contact-info"
import { SessionDataSection } from "./session-data-section"
import { ContactVariables } from "./contact-variables"
import { cn } from "@/lib/utils"

const MIN_WIDTH = 280
const MAX_WIDTH = 480

interface ContactInfoPanelProps {
  contactId: string
  onClose: () => void
}

export function ContactInfoPanel({ contactId, onClose }: ContactInfoPanelProps) {
  const [panelWidth, setPanelWidth] = useState(MAX_WIDTH)
  const [isResizing, setIsResizing] = useState(false)

  const { data: contact } = useContact(contactId)
  const { data: sessionData } = useContactSessionData(contactId)
  const { data: variablesData } = useContactVariables(contactId)

  const startResize = useCallback((e: React.MouseEvent) => {
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = panelWidth

    function onMouseMove(e: MouseEvent) {
      const delta = startX - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
      setPanelWidth(newWidth)
    }

    function onMouseUp() {
      setIsResizing(false)
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [panelWidth])

  if (!contact) return null

  const initials = (contact.name || contact.profile_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const sections = [...(sessionData?.panel_config?.sections ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  const variables = variablesData?.variables
  const contactTags = Array.isArray(contact.tags) ? contact.tags : []

  return (
    <div
      className="flex flex-col bg-card h-full relative border-l flex-shrink-0"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Resize Handle */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 z-10",
          isResizing && "bg-primary/30"
        )}
        onMouseDown={startResize}
      />

      {/* Header */}
      <div className="h-12 px-3 border-b flex items-center justify-between">
        <h3 className="font-medium text-sm">Contact Info</h3>
        <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          {/* Contact Card */}
          <div className="flex flex-col items-center text-center pb-4">
            {contact.avatar_url ? (
              <img src={contact.avatar_url} alt="" className="w-16 h-16 rounded-full mb-3" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-medium mb-3">
                {initials}
              </div>
            )}
            <h4 className="font-medium">{contact.name || contact.phone_number}</h4>
            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
              <Phone className="h-3 w-3" />
              <span>{contact.phone_number}</span>
            </div>
          </div>

          {/* Flow Badge */}
          {sessionData?.flow_name && (
            <div className="flex items-center gap-2 pt-4">
              <Badge variant="outline" className="text-xs">
                {sessionData.flow_name}
              </Badge>
            </div>
          )}

          {/* Dynamic Sections or Empty State */}
          {sections.length === 0 && !contactTags.length && !variables ? (
            <div className="text-center py-6 text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No data configured</p>
              <p className="text-xs mt-1">Configure panel display in the chatbot flow settings.</p>
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <SessionDataSection
                  key={section.id}
                  section={section}
                  sessionData={sessionData?.session_data ?? {}}
                />
              ))}
            </>
          )}

          {/* Tags */}
          {contactTags.length > 0 && (
            <div className="pt-4 border-t">
              <h5 className="py-2 text-sm font-medium">Tags</h5>
              <div className="flex flex-wrap gap-2">
                {contactTags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Variables */}
          {variables && <ContactVariables variables={variables} />}
        </div>
      </div>
    </div>
  )
}
