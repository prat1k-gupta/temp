import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

export function InfoBanner24hr({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-md border border-info/30 bg-info/5 p-3 text-sm",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
      <p className="text-muted-foreground">
        If your flow doesn&apos;t start with a template message, only contacts who&apos;ve
        messaged you in the last 24 hours will receive it. Add a template node at the start
        to reach everyone.
      </p>
    </div>
  )
}
