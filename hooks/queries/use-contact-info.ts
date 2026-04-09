import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { contactInfoKeys } from "./query-keys"
import type { SessionData, ContactVariable } from "@/types/chat"

export function useContactSessionData(contactId: string) {
  return useQuery({
    queryKey: contactInfoKeys.sessionData(contactId),
    queryFn: () =>
      apiClient.get<SessionData>(`/api/contacts/${contactId}/session-data`),
    enabled: !!contactId,
  })
}

export function useContactVariables(contactId: string) {
  return useQuery({
    queryKey: contactInfoKeys.variables(contactId),
    queryFn: () =>
      apiClient.get<{ variables: Record<string, ContactVariable[]> }>(
        `/api/contacts/${contactId}/variables`
      ),
    enabled: !!contactId,
  })
}
