import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { chatbotKeys } from "./use-chatbot"

/**
 * Fetch the bucketed variables a flow references / writes.
 * Backed by GET /api/campaigns/flow-variables/{id} on fs-whatsapp.
 *
 * - `needs_mapping` — variables the flow references via {{name}} but never
 *   writes; callers must supply values through `column_mapping` at broadcast
 *   create time or the recipient sees literal {{name}} (or Meta rejects a
 *   templateMessage with 131008).
 * - `internal_flow_variables` — variables the flow writes itself at runtime
 *   (button picks, text inputs, API responses); mapping these is a no-op
 *   because the producing step overwrites whatever the mapping injected.
 *
 * The endpoint lives under /api/campaigns (not /api/chatbot) so it inherits
 * the "campaigns" RBAC feature requirement — reading flow variables for a
 * broadcast doesn't need full chatbot-settings access. See the backend plan's
 * Task 6 Step 5 for the reasoning.
 */
export function useFlowVariables(flowId: string | undefined) {
  return useQuery({
    queryKey: [...chatbotKeys.flows(), flowId, "variables"],
    queryFn: () =>
      apiClient.get<{ needs_mapping: string[]; internal_flow_variables: string[] }>(
        `/api/campaigns/flow-variables/${flowId}`,
      ),
    enabled: Boolean(flowId),
    staleTime: 5 * 60 * 1000, // flow variables rarely change
  })
}
