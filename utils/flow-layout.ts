/**
 * FlowLayoutManager — deterministic auto-positioning for plan-built flows.
 *
 * Nodes in the trunk advance horizontally (x += HORIZONTAL_GAP, same y).
 * Branches fan out vertically, centered around the parent's y.
 */

export const HORIZONTAL_GAP = 350
export const VERTICAL_GAP = 250
export const START_X = 600 // first real node x (start node sits at ~250)
export const BASE_Y = 150

export class FlowLayoutManager {
  private currentX: number
  private baseY: number

  constructor(startX: number = START_X, baseY: number = BASE_Y) {
    this.currentX = startX
    this.baseY = baseY
  }

  /** Return the next sequential position and advance the cursor. */
  getNextSequentialPosition(): { x: number; y: number } {
    const pos = { x: this.currentX, y: this.baseY }
    this.currentX += HORIZONTAL_GAP
    return pos
  }

  /** Get the current cursor x (without advancing). */
  getCurrentX(): number {
    return this.currentX
  }

  /**
   * Compute vertically-centered positions for `count` branches.
   * The branches are centered around `parentY`.
   *
   * Example: 3 branches at parentY=150, gap=250
   *   offsets = [-250, 0, 250]  →  y = [-100, 150, 400]
   */
  getBranchPositions(
    count: number,
    parentX: number,
    parentY: number
  ): Array<{ x: number; y: number }> {
    if (count <= 0) return []

    const branchStartX = parentX + HORIZONTAL_GAP
    const totalHeight = (count - 1) * VERTICAL_GAP
    const topY = parentY - totalHeight / 2

    return Array.from({ length: count }, (_, i) => ({
      x: branchStartX,
      y: topY + i * VERTICAL_GAP,
    }))
  }

  /**
   * Create a child layout manager for a branch sub-tree.
   * Starts one HORIZONTAL_GAP right of `startX`, at the given `startY`.
   */
  createBranchLayout(startX: number, startY: number): FlowLayoutManager {
    return new FlowLayoutManager(startX, startY)
  }
}
