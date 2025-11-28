"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { ShopifyIcon } from "@/components/service-icons"
import type { Platform } from "@/types"

export function ShopifyNode({ data, selected }: { data: any; selected?: boolean }) {
  const platform = (data.platform || "web") as Platform

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
            <div className="w-5 h-5 bg-green-600 rounded-md flex items-center justify-center flex-shrink-0 p-1">
              <ShopifyIcon className="w-full h-full text-white" />
            </div>
            <h3 className="text-xs font-medium text-card-foreground flex-1">
              {data.label || "Shopify"}
            </h3>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2 pb-3 px-4">
          <p className="text-[10px] text-muted-foreground">
            {data.description || "Connect to Shopify store"}
          </p>
          <div className="text-[9px] text-muted-foreground italic">
            Configuration coming soon...
          </div>
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-green-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 bg-green-600 border-2 border-background opacity-100 hover:scale-110 transition-transform"
        />
      </Card>
    </div>
  )
}

