import { FeatureGate } from "@/components/feature-gate"

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="templates">{children}</FeatureGate>
}
