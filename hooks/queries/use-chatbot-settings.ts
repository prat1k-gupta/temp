import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { chatbotSettingsKeys } from "./query-keys"

export interface ChatbotSettings {
  global_variables: Record<string, string>
  cancel_keywords: string[]
  inactivity_timeout: number
  welcome_message: string
}

export function useChatbotSettings() {
  return useQuery<ChatbotSettings>({
    queryKey: chatbotSettingsKeys.detail(),
    queryFn: () => apiClient.get<ChatbotSettings>("/api/chatbot/settings"),
  })
}

export function useUpdateChatbotSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ChatbotSettings>) =>
      apiClient.put("/api/chatbot/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatbotSettingsKeys.detail() })
    },
  })
}
