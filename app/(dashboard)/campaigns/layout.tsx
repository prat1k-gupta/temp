import { FeatureGate } from "@/components/feature-gate"

export default function CampaignsLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="campaigns">{children}</FeatureGate>
}
