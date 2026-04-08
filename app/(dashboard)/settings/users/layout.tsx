import { FeatureGate } from "@/components/feature-gate"

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="users">{children}</FeatureGate>
}
