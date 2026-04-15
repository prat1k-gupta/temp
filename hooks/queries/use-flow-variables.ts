import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { chatbotKeys } from "./use-chatbot"

/**
 * Fetch the set of {{variable}} names referenced anywhere in a flow's nodes.
 * Backed by GET /api/campaigns/flow-variables/{id} on fs-whatsapp.
 *
 * The endpoint lives under /api/campaigns (not /api/chatbot) so it inherits
 * the "campaigns" RBAC feature requirement — reading flow variables for a
 * broadcast doesn't need full chatbot-settings access. See the backend plan's
 * Task 6 Step 5 for the reasoning.
 */
export function useFlowVariables(flowId: string | undefined) {
  return useQuery({
    queryKey: [...chatbotKeys.flows(), flowId, "variables"],
    queryFn: () => apiClient.get<{ variables: string[] }>(`/api/campaigns/flow-variables/${flowId}`),
    enabled: Boolean(flowId),
    staleTime: 5 * 60 * 1000, // flow variables rarely change
  })
}
