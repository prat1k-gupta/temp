import { describe, it, expect, beforeEach, vi } from "vitest"
import { rateLimitCheck, __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

describe("rateLimitCheck", () => {
  beforeEach(() => {
    __resetRateLimitForTests()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"))
  })

  it("allows the first call on a fresh key", () => {
    expect(rateLimitCheck("whm_abc", "cheap")).toEqual({ ok: true })
  })

  it("allows up to bucket limit within the same minute", () => {
    for (let i = 0; i < 120; i++) {
      expect(rateLimitCheck("whm_abc", "cheap").ok, `call ${i}`).toBe(true)
    }
  })

  it("rejects the call that exceeds bucket limit", () => {
    for (let i = 0; i < 120; i++) rateLimitCheck("whm_abc", "cheap")
    const result = rateLimitCheck("whm_abc", "cheap")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(60)
    }
  })

  it("different buckets for the same key are independent", () => {
    // Fill the expensive bucket (10 max)
    for (let i = 0; i < 10; i++) rateLimitCheck("whm_abc", "expensive")
    expect(rateLimitCheck("whm_abc", "expensive").ok).toBe(false)
    // cheap bucket should still be open
    expect(rateLimitCheck("whm_abc", "cheap").ok).toBe(true)
  })

  it("different keys do not share buckets", () => {
    for (let i = 0; i < 10; i++) rateLimitCheck("whm_abc", "expensive")
    expect(rateLimitCheck("whm_abc", "expensive").ok).toBe(false)
    expect(rateLimitCheck("whm_def", "expensive").ok).toBe(true)
  })

  it("resets after the minute window elapses", () => {
    for (let i = 0; i < 10; i++) rateLimitCheck("whm_abc", "expensive")
    expect(rateLimitCheck("whm_abc", "expensive").ok).toBe(false)

    // Advance 61 seconds
    vi.setSystemTime(new Date("2026-04-15T12:01:01Z"))

    expect(rateLimitCheck("whm_abc", "expensive").ok).toBe(true)
  })

  it("expensive bucket limit is 10/min", () => {
    for (let i = 0; i < 10; i++) {
      expect(rateLimitCheck("whm_abc", "expensive").ok).toBe(true)
    }
    expect(rateLimitCheck("whm_abc", "expensive").ok).toBe(false)
  })

  it("publish bucket limit is 30/min", () => {
    for (let i = 0; i < 30; i++) {
      expect(rateLimitCheck("whm_abc", "publish").ok).toBe(true)
    }
    expect(rateLimitCheck("whm_abc", "publish").ok).toBe(false)
  })
})
