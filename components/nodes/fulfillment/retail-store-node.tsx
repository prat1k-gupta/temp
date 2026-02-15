"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Store, MapPin, CheckCircle2 } from "lucide-react"
import type { Platform } from "@/types"

export function RetailStoreNode({ data, selected }: { data: any; selected?: boolean }) {
  const platform = (data.platform || "web") as Platform
  const vendor = data.vendor || {
    name: "Retailer System",
    type: "retailer",
    description: "Retailer system for brand retail stores",
    features: ["Store locator", "Inventory check", "Store hours"]
  }
  const configuration = data.configuration || {
    storeLocatorEnabled: true,
    inventoryCheckEnabled: true,
    bookingEnabled: false
  }

  const getPlatformColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "border-blue-100 dark:border-blue-900"
      case "whatsapp":
        return "border-green-100 dark:border-green-900"
      case "instagram":
        return "border-pink-100 dark:border-pink-900"
    }
  }

  const getPlatformRing = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "ring-blue-300/50 dark:ring-blue-600/50"
      case "whatsapp":
        return "ring-green-300/50 dark:ring-green-600/50"
      case "instagram":
        return "ring-pink-300/50 dark:ring-pink-600/50"
    }
  }

  return (
    <div className="relative">
      <Card
        className={`min-w-[260px] max-w-[300px] bg-card ${getPlatformColor(platform)} transition-all ${
          selected ? `ring-1 ${getPlatformRing(platform)}` : ""
        }`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-[#052762] rounded-md flex items-center justify-center flex-shrink-0">
              <Store className="w-3 h-3 text-white" />
            </div>
            <h3 className="text-xs font-medium text-card-foreground flex-1">
              {data.label || "Retail Store"}
            </h3>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          <p className="text-[10px] text-muted-foreground">
            {data.description || "Find nearby stores"}
          </p>

          {/* Vendor Information */}
          <div className="space-y-2 pt-1 border-t border-border">
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3 text-[#2872F4]" />
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
                    className="text-[8px] h-4 px-1.5 bg-blue-50 dark:bg-blue-950/20 text-[#052762] dark:text-blue-300 border-blue-200 dark:border-blue-800"
                  >
                    {feature}
                  </Badge>
                ))}
              </div>
            )}

            {/* Configuration */}
            <div className="space-y-1.5 pt-1">
              {configuration.storeLocatorEnabled && (
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span>Store locator enabled</span>
                </div>
              )}
              {configuration.inventoryCheckEnabled && (
                <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  <span>Inventory check enabled</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-[#052762] border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground font-medium mr-2">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-[#052762] border-2 border-background opacity-100 hover:scale-110 transition-transform"
          />
        </div>
      </Card>
    </div>
  )
}

