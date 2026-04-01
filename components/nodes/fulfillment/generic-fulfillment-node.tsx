"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Package, Calendar, Store } from "lucide-react"
import type { Platform } from "@/types"

const fulfillmentIcons: Record<string, any> = {
  homeDelivery: Package,
  event: Calendar,
  retailStore: Store,
}

export function GenericFulfillmentNode({ data, selected, type }: { data: any; selected?: boolean; type?: string }) {
  const platform = (data.platform || "web") as Platform
  const fulfillmentType = type || data.type || "homeDelivery"
  const IconComponent = fulfillmentIcons[fulfillmentType] || Package

  const platformBorder = "border-platform-accent/20 dark:border-platform-accent/30"
  const platformRing = "ring-platform-accent/30"

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card ${platformBorder} transition-all ${
          selected ? `ring-1 ${platformRing}` : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
              <IconComponent className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-xs font-medium text-card-foreground flex-1">
              {data.label || "Fulfillment"}
            </h3>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2 pb-3 px-4">
          <p className="text-[10px] text-muted-foreground">
            {data.description || "Service fulfillment"}
          </p>
          <div className="text-[9px] text-muted-foreground italic">
            Configuration coming soon...
          </div>
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-primary border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-primary border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}

