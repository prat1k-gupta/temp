import { FeatureGate } from "@/components/feature-gate"

export default function TeamsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="teams">{children}</FeatureGate>
}
