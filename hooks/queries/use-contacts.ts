import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { contactKeys } from "./query-keys"
import type { Contact, ContactsResponse } from "@/types/chat"

const PAGE_SIZE = 20

interface UseContactsOptions {
  search?: string
  channel?: "whatsapp" | "instagram" | null
}

export function useContacts(options: UseContactsOptions = {}) {
  const { search, channel } = options

  return useInfiniteQuery({
    queryKey: contactKeys.list({ search, channel: channel ?? undefined }),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams()
      params.set("page", String(pageParam))
      params.set("limit", String(PAGE_SIZE))
      if (search) params.set("search", search)
      if (channel) params.set("channel", channel)

      return apiClient.get<ContactsResponse>(`/api/contacts?${params}`)
    },
    getNextPageParam: (lastPage) =>
      lastPage.contacts.length === PAGE_SIZE ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  })
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: contactKeys.detail(id!),
    queryFn: () => apiClient.get<Contact>(`/api/contacts/${id}`),
    enabled: !!id,
  })
}
