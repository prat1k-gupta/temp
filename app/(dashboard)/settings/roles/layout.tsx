import { FeatureGate } from "@/components/feature-gate"

export default function RolesLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="users">{children}</FeatureGate>
}
