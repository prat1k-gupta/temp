"use client"

import { useState, useCallback, useRef } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useContacts } from "@/hooks/queries/use-contacts"
import { ContactListItem } from "./contact-list-item"
import { ContactListFilters } from "./contact-list-filters"
import { ContactListSkeleton } from "./contact-list-skeleton"
import type { Contact } from "@/types/chat"

interface ContactListProps {
  activeContactId: string | null
  onSelectContact: (contactId: string) => void
}

export function ContactList({ activeContactId, onSelectContact }: ContactListProps) {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [channel, setChannel] = useState<"whatsapp" | "instagram" | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Debounce search
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }, [])

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useContacts({
    search: debouncedSearch || undefined,
    channel,
  })

  // Load more on scroll to bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasNextPage || isFetchingNextPage) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const contacts: Contact[] = data?.pages.flatMap((p) => p.contacts) ?? []

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <ContactListFilters channel={channel} onChannelChange={setChannel} />

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <ContactListSkeleton />
        ) : contacts.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No conversations yet
          </div>
        ) : (
          <>
            {contacts.map((contact) => (
              <ContactListItem
                key={contact.id}
                contact={contact}
                isActive={contact.id === activeContactId}
                onClick={() => onSelectContact(contact.id)}
              />
            ))}
            {isFetchingNextPage && <ContactListSkeleton />}
          </>
        )}
      </div>
    </div>
  )
}
