import { FeatureGate } from "@/components/feature-gate"

export default function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="api-keys">{children}</FeatureGate>
}
