import { FeatureGate } from "@/components/feature-gate"

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="chatbot-settings">{children}</FeatureGate>
}
