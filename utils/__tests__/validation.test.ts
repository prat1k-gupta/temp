import { describe, it, expect } from "vitest"
import {
  isValidNodeId,
  isValidPlatform,
  isValidCoordinates,
  isWithinCharacterLimit,
  isWithinArrayLimit,
} from "../validation"

describe("isValidNodeId", () => {
  it("returns true for non-empty strings", () => {
    expect(isValidNodeId("node-1")).toBe(true)
    expect(isValidNodeId("abc")).toBe(true)
    expect(isValidNodeId("1")).toBe(true)
  })

  it("returns false for empty strings", () => {
    expect(isValidNodeId("")).toBe(false)
  })

  it("returns false for non-string values", () => {
    expect(isValidNodeId(null as any)).toBe(false)
    expect(isValidNodeId(undefined as any)).toBe(false)
    expect(isValidNodeId(123 as any)).toBe(false)
  })
})

describe("isValidPlatform", () => {
  it("returns true for valid platforms", () => {
    expect(isValidPlatform("web")).toBe(true)
    expect(isValidPlatform("whatsapp")).toBe(true)
    expect(isValidPlatform("instagram")).toBe(true)
  })

  it("returns false for invalid platforms", () => {
    expect(isValidPlatform("facebook")).toBe(false)
    expect(isValidPlatform("")).toBe(false)
    expect(isValidPlatform(null)).toBe(false)
    expect(isValidPlatform(undefined)).toBe(false)
    expect(isValidPlatform(42)).toBe(false)
  })
})

describe("isValidCoordinates", () => {
  it("returns true for valid coordinates", () => {
    expect(isValidCoordinates(0, 0)).toBe(true)
    expect(isValidCoordinates(100, 200)).toBe(true)
    expect(isValidCoordinates(0.5, 0.5)).toBe(true)
  })

  it("returns false for negative coordinates", () => {
    expect(isValidCoordinates(-1, 0)).toBe(false)
    expect(isValidCoordinates(0, -1)).toBe(false)
  })

  it("returns false for NaN coordinates", () => {
    expect(isValidCoordinates(NaN, 0)).toBe(false)
    expect(isValidCoordinates(0, NaN)).toBe(false)
  })
})

describe("isWithinCharacterLimit", () => {
  it("returns true when within limit", () => {
    expect(isWithinCharacterLimit("hello", 10)).toBe(true)
    expect(isWithinCharacterLimit("", 10)).toBe(true)
  })

  it("returns true at exact limit", () => {
    expect(isWithinCharacterLimit("hello", 5)).toBe(true)
  })

  it("returns false when exceeding limit", () => {
    expect(isWithinCharacterLimit("hello world", 5)).toBe(false)
  })
})

describe("isWithinArrayLimit", () => {
  it("returns true when within limit", () => {
    expect(isWithinArrayLimit([1, 2], 5)).toBe(true)
    expect(isWithinArrayLimit([], 5)).toBe(true)
  })

  it("returns true at exact limit", () => {
    expect(isWithinArrayLimit([1, 2, 3], 3)).toBe(true)
  })

  it("returns false when exceeding limit", () => {
    expect(isWithinArrayLimit([1, 2, 3, 4], 3)).toBe(false)
  })

  it("returns false for non-arrays", () => {
    expect(isWithinArrayLimit("not an array" as any, 5)).toBe(false)
    expect(isWithinArrayLimit(null as any, 5)).toBe(false)
  })
})
