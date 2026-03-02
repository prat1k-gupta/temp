import { describe, it, expect } from "vitest"
import {
  FlowLayoutManager,
  HORIZONTAL_GAP,
  VERTICAL_GAP,
  START_X,
  BASE_Y,
} from "../flow-layout"

describe("FlowLayoutManager", () => {
  describe("getNextSequentialPosition", () => {
    it("returns START_X, BASE_Y for the first call", () => {
      const layout = new FlowLayoutManager()
      expect(layout.getNextSequentialPosition()).toEqual({ x: START_X, y: BASE_Y })
    })

    it("advances x by HORIZONTAL_GAP on each call", () => {
      const layout = new FlowLayoutManager()
      layout.getNextSequentialPosition() // 600
      const second = layout.getNextSequentialPosition()
      expect(second).toEqual({ x: START_X + HORIZONTAL_GAP, y: BASE_Y })

      const third = layout.getNextSequentialPosition()
      expect(third).toEqual({ x: START_X + HORIZONTAL_GAP * 2, y: BASE_Y })
    })

    it("keeps y constant across sequential calls", () => {
      const layout = new FlowLayoutManager()
      for (let i = 0; i < 5; i++) {
        expect(layout.getNextSequentialPosition().y).toBe(BASE_Y)
      }
    })
  })

  describe("getBranchPositions", () => {
    it("returns empty array for count=0", () => {
      const layout = new FlowLayoutManager()
      expect(layout.getBranchPositions(0, 600, 150)).toEqual([])
    })

    it("returns single centered position for count=1", () => {
      const layout = new FlowLayoutManager()
      const positions = layout.getBranchPositions(1, 600, 150)
      expect(positions).toEqual([{ x: 600 + HORIZONTAL_GAP, y: 150 }])
    })

    it("returns 2 positions symmetric around parentY", () => {
      const layout = new FlowLayoutManager()
      const positions = layout.getBranchPositions(2, 600, 150)
      expect(positions).toHaveLength(2)
      // Total height = 1 * 250 = 250; topY = 150 - 125 = 25
      expect(positions[0]).toEqual({ x: 950, y: 25 })
      expect(positions[1]).toEqual({ x: 950, y: 275 })
    })

    it("returns 3 positions centered around parentY", () => {
      const layout = new FlowLayoutManager()
      const positions = layout.getBranchPositions(3, 600, 150)
      expect(positions).toHaveLength(3)
      // Total height = 2 * 250 = 500; topY = 150 - 250 = -100
      expect(positions[0]).toEqual({ x: 950, y: -100 })
      expect(positions[1]).toEqual({ x: 950, y: 150 })
      expect(positions[2]).toEqual({ x: 950, y: 400 })
    })
  })

  describe("createBranchLayout", () => {
    it("creates a child layout with given start position", () => {
      const layout = new FlowLayoutManager()
      const child = layout.createBranchLayout(950, 400)
      const pos = child.getNextSequentialPosition()
      expect(pos).toEqual({ x: 950, y: 400 })
    })

    it("child layout advances independently", () => {
      const layout = new FlowLayoutManager()
      const child = layout.createBranchLayout(950, 400)

      child.getNextSequentialPosition() // 950
      const second = child.getNextSequentialPosition()
      expect(second).toEqual({ x: 950 + HORIZONTAL_GAP, y: 400 })

      // Parent layout is unaffected
      expect(layout.getNextSequentialPosition()).toEqual({ x: START_X, y: BASE_Y })
    })
  })
})
