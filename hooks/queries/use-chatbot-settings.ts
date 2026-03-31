import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { chatbotSettingsKeys } from "./query-keys"

export interface ChatbotSettings {
  enabled: boolean
  greeting_message: string
  fallback_message: string
  session_timeout_minutes: number
  cancel_keywords: string[]
  global_variables: Record<string, string>
}

export function useChatbotSettings() {
  return useQuery<ChatbotSettings>({
    queryKey: chatbotSettingsKeys.detail(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/chatbot/settings")
      return data?.settings || data || {}
    },
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
