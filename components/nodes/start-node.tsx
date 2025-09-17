"use client"

import { Handle, Position } from "@xyflow/react"
import { Play } from "lucide-react"

export function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="relative">
      <div
        className={`min-w-[150px] rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl border-2 bg-teal-600 border-teal-600 ${
          selected ? "ring-2 ring-teal-500/50 shadow-xl" : ""
        }`}
      >
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20">
            <Play className="w-4 h-4 text-white fill-white" />
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
            className="w-4 h-4 bg-white hover:scale-110 transition-transform shadow-sm border-2 border-teal-600"
          />
        </div>
      </div>
    </div>
  )
}
