"use client"

import { Handle, Position } from "@xyflow/react"
import { Play, Lock } from "lucide-react"

export function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="relative">
      <div
        className={`min-w-[150px] rounded-lg shadow-lg border-2 bg-chart-2 border-chart-2 cursor-default select-none ${
          selected ? "ring-2 ring-chart-2/50 shadow-xl" : ""
        }`}
        style={{ 
          pointerEvents: 'none',
          userSelect: 'none'
        }}
      >
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 dark:bg-black/20 relative">
            <Play className="w-4 h-4 text-white fill-white" />
            <Lock className="w-3 h-3 text-white/80 absolute -top-1 -right-1" />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm text-white">
              Start
            </span>
            <p className="text-xs mt-1 text-white/90">
              Flow entry point
            </p>
          </div>
        </div>

        <div className="absolute -right-2 top-1/2 -translate-y-1/2">
          <Handle
            type="source"
            position={Position.Right}
            className="w-4 h-4 bg-background hover:scale-110 transition-transform shadow-sm border-2 border-chart-2"
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      </div>
    </div>
  )
}
