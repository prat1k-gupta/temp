import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { filterKeys } from "./query-keys"
import type { ContactFilter, ContactsResponse } from "@/types/chat"

const PAGE_SIZE = 20

export function useContactTags(search: string = "") {
  return useQuery({
    queryKey: [...filterKeys.tags(), search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      return apiClient.get<{ tags: string[] }>(`/api/contacts/tags?${params}`)
    },
    staleTime: 60 * 1000,
  })
}

export function useContactVariables(flowSlug: string, search: string = "") {
  return useQuery({
    queryKey: [...filterKeys.variables(flowSlug), search],
    queryFn: () => {
      const params = new URLSearchParams({ flow_slug: flowSlug, sort: "recent" })
      if (search) params.set("search", search)
      return apiClient.get<{ variables: string[] }>(`/api/contacts/variables?${params}`)
    },
    enabled: !!flowSlug,
    staleTime: 60 * 1000,
  })
}

/**
 * Convert a ContactFilter tree to API format (camelCase → snake_case for flow_slug).
 */
function toApiFilter(f: ContactFilter): Record<string, unknown> {
  if (f.logic && f.filters) {
    return { logic: f.logic, filters: f.filters.map(toApiFilter) }
  }
  const { flowName, flowSlug, ...rest } = f
  return { ...rest, ...(flowSlug ? { flow_slug: flowSlug } : {}) }
}

export function useFilteredContacts(
  rootFilter: ContactFilter,
  options: { search?: string; channel?: string | null }
) {
  const { search, channel } = options
  const hasFilters = (rootFilter.filters ?? []).length > 0

  return useInfiniteQuery({
    queryKey: filterKeys.contacts({ rootFilter, search, channel }),
    queryFn: async ({ pageParam = 1 }) => {
      return apiClient.fetch<ContactsResponse>("/api/contacts/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filter: toApiFilter(rootFilter),
          search: search || "",
          channel: channel || "",
          page: pageParam,
          limit: PAGE_SIZE,
          sort: "last_message_at",
        }),
      })
    },
    getNextPageParam: (lastPage) =>
      lastPage.contacts.length === PAGE_SIZE ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: hasFilters,
  })
}
