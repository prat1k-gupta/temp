import type React from "react"
import { memo } from "react"
import { Handle, Position } from "reactflow"
import type { Platform } from "@/types"
import { getPlatformConfig } from "@/lib/platform-config"

export interface BaseNodeData {
  id: string
  platform: Platform
  onNodeUpdate: (nodeId: string, updates: any) => void
  [key: string]: any
}

export interface BaseNodeProps {
  data: BaseNodeData
  children: React.ReactNode
}

export const BaseNode = memo(({ data, children }: BaseNodeProps) => {
  const platformConfig = getPlatformConfig(data.platform)
  const platformColors = platformConfig.colors

  return (
    <div
      className="relative bg-card border-2 rounded-lg shadow-sm hover:shadow-md transition-shadow"
      style={{
        borderColor: platformColors?.primary || "#3b82f6",
      }}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-muted-foreground border-2 border-background" />

      {/* Platform indicator */}
      <div
        className="absolute -top-2 -right-2 w-4 h-4 rounded-full text-xs flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: platformColors?.primary || "#3b82f6" }}
      >
        {data.platform.charAt(0).toUpperCase()}
      </div>

      {children}

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-muted-foreground border-2 border-background" />
    </div>
  )
})

BaseNode.displayName = "BaseNode"
