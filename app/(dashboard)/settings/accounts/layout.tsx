import { FeatureGate } from "@/components/feature-gate"

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="accounts">{children}</FeatureGate>
}
