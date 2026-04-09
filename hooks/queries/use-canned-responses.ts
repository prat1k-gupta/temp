import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { cannedResponseKeys } from "./query-keys"
import type { CannedResponse } from "@/types/chat"

/**
 * Fetch active canned responses for the chat picker.
 * Backend returns { canned_responses: CannedResponse[] } after envelope unwrap.
 */
export function useCannedResponses() {
  return useQuery({
    queryKey: cannedResponseKeys.list(),
    queryFn: () =>
      apiClient.get<{ canned_responses: CannedResponse[] }>(
        "/api/canned-responses?active_only=true"
      ),
    staleTime: 5 * 60 * 1000,
  })
}
