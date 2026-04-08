import { FeatureGate } from "@/components/feature-gate"

export default function FlowTemplatesLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="flows">{children}</FeatureGate>
}
