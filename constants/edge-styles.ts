import type { CSSProperties } from "react"

/**
 * Default edge style for all ReactFlow edges.
 * Uses CSS variable so it inherits from the design system.
 */
export const DEFAULT_EDGE_STYLE: CSSProperties = {
  stroke: "var(--edge-color)",
  strokeWidth: 2,
}
