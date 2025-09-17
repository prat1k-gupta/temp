"use client"

import { Handle, Position } from "@xyflow/react"
import { Play } from "lucide-react"

export function StartNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className="relative">
      <div
        className={`min-w-[150px] rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl border-2 ${
          selected ? "ring-2 ring-teal-500/50 shadow-xl" : ""
        }`}
        style={{
          backgroundColor: "#0d9488 !important",
          borderColor: "#0d9488 !important",
          background: "#0d9488 !important",
        }}
      >
        <div className="p-4 flex items-center gap-3" style={{ backgroundColor: "#0d9488 !important" }}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
          >
            <Play className="w-4 h-4" style={{ color: "#ffffff", fill: "#ffffff" }} />
          </div>
          <div className="flex-1">
            <span className="font-semibold text-sm" style={{ color: "#ffffff !important" }}>
              Start
            </span>
            <p className="text-xs mt-1" style={{ color: "rgba(255, 255, 255, 0.9) !important" }}>
              Flow entry point
            </p>
          </div>
        </div>

        <div className="absolute -right-2 top-1/2 -translate-y-1/2">
          <Handle
            type="source"
            position={Position.Right}
            className="w-4 h-4 bg-white hover:scale-110 transition-transform shadow-sm"
            style={{ borderColor: "#0d9488", borderWidth: "2px" }}
          />
        </div>
      </div>
    </div>
  )
}
