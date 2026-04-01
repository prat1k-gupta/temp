"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Users, CheckCircle2 } from "lucide-react"
import type { Platform } from "@/types"

export function EventNode({ data, selected }: { data: any; selected?: boolean }) {
  const platform = (data.platform || "web") as Platform
  const vendor = data.vendor || {
    name: "Promoter App",
    type: "promoter",
    description: "Promoter app for brand promoters",
    features: ["Event management", "Promoter scheduling", "Real-time updates"]
  }
  const configuration = data.configuration || {
    eventTypes: ["in-store", "event"],
    bookingEnabled: true,
    remindersEnabled: true
  }

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
              <Calendar className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-xs font-medium text-card-foreground flex-1">
              {data.label || "Event"}
            </h3>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          <p className="text-[10px] text-muted-foreground">
            {data.description || "Book event or appointment"}
          </p>

          {/* Vendor Information */}
          <div className="space-y-2 pt-1 border-t border-border">
            <div className="flex items-center gap-2">
              <Users className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-medium text-card-foreground">{vendor.name}</span>
            </div>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              {vendor.description}
            </p>

            {/* Features */}
            {vendor.features && vendor.features.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {vendor.features.map((feature: string, index: number) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="text-[8px] h-4 px-1.5 bg-primary/5 dark:bg-primary/10 text-primary dark:text-primary/80 border-primary/20 dark:border-primary/30"
                  >
                    {feature}
                  </Badge>
                ))}
              </div>
            )}

            {/* Configuration */}
            <div className="space-y-1.5 pt-1">
              {configuration.bookingEnabled && (
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  <span>Booking enabled</span>
                </div>
              )}
              {configuration.remindersEnabled && (
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  <span>Reminders enabled</span>
                </div>
              )}
              {configuration.eventTypes && configuration.eventTypes.length > 0 && (
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  <span>Types: {configuration.eventTypes.join(", ")}</span>
                </div>
              )}
            </div>
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

