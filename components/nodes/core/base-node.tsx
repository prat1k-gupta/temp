import type React from "react"
import { memo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { nodeRegistry } from "@/lib/node-registry"

export interface BaseNodeData {
  id: string
  platform: string
  onNodeUpdate: (nodeId: string, updates: any) => void
  [key: string]: any
}

export interface BaseNodeProps extends NodeProps {
  data: BaseNodeData
}

export const BaseNode = memo(({ data, children }: BaseNodeProps & { children: React.ReactNode }) => {
  const platform = nodeRegistry.getPlatform(data.platform)
  const platformColors = platform?.constraints.colors

  return (
    <div
      className="relative bg-white border-2 border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
      style={{
        borderColor: platformColors?.primary || "#3b82f6",
      }}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-gray-400 border-2 border-white" />

      {/* Platform indicator */}
      <div
        className="absolute -top-2 -right-2 w-4 h-4 rounded-full text-xs flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: platformColors?.primary || "#3b82f6" }}
      >
        {data.platform.charAt(0).toUpperCase()}
      </div>

      {children}

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-gray-400 border-2 border-white" />
    </div>
  )
})

BaseNode.displayName = "BaseNode"
