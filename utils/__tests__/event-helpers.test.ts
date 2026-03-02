import { describe, it, expect } from "vitest"
import { getClientCoordinates, hasClientCoordinates, isDoubleClick } from "../event-helpers"

describe("getClientCoordinates", () => {
  it("extracts coordinates from mouse events", () => {
    const event = { clientX: 100, clientY: 200 } as MouseEvent
    expect(getClientCoordinates(event)).toEqual({ x: 100, y: 200 })
  })

  it("extracts coordinates from touch events", () => {
    const event = {
      touches: [{ clientX: 50, clientY: 75 }],
    } as unknown as TouchEvent
    expect(getClientCoordinates(event)).toEqual({ x: 50, y: 75 })
  })

  it("returns 0,0 for events with no coordinates", () => {
    const event = {} as MouseEvent
    expect(getClientCoordinates(event)).toEqual({ x: 0, y: 0 })
  })
})

describe("hasClientCoordinates", () => {
  it("returns true for mouse events", () => {
    expect(hasClientCoordinates({ clientX: 0, clientY: 0 })).toBe(true)
  })

  it("returns truthy for touch events", () => {
    expect(hasClientCoordinates({ touches: [{ clientX: 0, clientY: 0 }] })).toBeTruthy()
  })

  it("returns false for events without coordinates", () => {
    expect(hasClientCoordinates({})).toBe(false)
  })
})

describe("isDoubleClick", () => {
  it("returns true when time and distance are within thresholds", () => {
    expect(
      isDoubleClick(1000, 800, { x: 100, y: 100 }, { x: 102, y: 102 }, 300, 5)
    ).toBe(true)
  })

  it("returns false when time exceeds threshold", () => {
    expect(
      isDoubleClick(1000, 500, { x: 100, y: 100 }, { x: 100, y: 100 }, 300, 5)
    ).toBe(false)
  })

  it("returns false when distance exceeds threshold", () => {
    expect(
      isDoubleClick(1000, 900, { x: 100, y: 100 }, { x: 200, y: 200 }, 300, 5)
    ).toBe(false)
  })

  it("uses default thresholds when not provided", () => {
    expect(
      isDoubleClick(1000, 800, { x: 100, y: 100 }, { x: 102, y: 102 })
    ).toBe(true)
  })

  it("returns false for first click (lastClickTime = 0)", () => {
    expect(
      isDoubleClick(1000, 0, { x: 100, y: 100 }, { x: 100, y: 100 })
    ).toBe(false)
  })
})
