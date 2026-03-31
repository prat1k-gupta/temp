import { useQuery } from "@tanstack/react-query"
import { getAllFlows, getFlow, type FlowMetadata, type FlowData } from "@/utils/flow-storage"
import { flowKeys } from "./query-keys"

/**
 * Fetch all flows (list view).
 */
export function useFlows() {
  return useQuery<FlowMetadata[]>({
    queryKey: flowKeys.lists(),
    queryFn: getAllFlows,
  })
}

/**
 * Fetch a single flow by ID.
 * Disabled when id is "new" or empty.
 */
export function useFlow(id: string) {
  return useQuery<FlowData | null>({
    queryKey: flowKeys.detail(id),
    queryFn: () => getFlow(id),
    enabled: !!id && id !== "new",
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
