import { useQuery } from "@tanstack/react-query"
import { getChatbotFlows, getGlobalVariables, type ChatbotFlow } from "@/lib/whatsapp-api"

export const chatbotKeys = {
  all: ["chatbot"] as const,
  flows: () => [...chatbotKeys.all, "flows"] as const,
  globalVariables: () => [...chatbotKeys.all, "globalVariables"] as const,
} as const

/**
 * Fetch published chatbot flows (runtime flows from fs-whatsapp).
 * Used by: flow-setup-modal, start-node, variable-picker-textarea
 */
export function useChatbotFlows() {
  return useQuery<ChatbotFlow[]>({
    queryKey: chatbotKeys.flows(),
    queryFn: async () => {
      const result = await getChatbotFlows()
      return result.flows
    },
  })
}

/**
 * Fetch global variables from chatbot settings.
 * Used by: properties-panel, variable-picker-textarea
 */
export function useGlobalVariables() {
  return useQuery<Record<string, string>>({
    queryKey: chatbotKeys.globalVariables(),
    queryFn: async () => {
      const result = await getGlobalVariables()
      return result.globalVariables
    },
  })
}
