import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

vi.mock("@/lib/auth", () => ({
  getUser: () => null,
}))

import { ChangeTracker } from "../change-tracker"

function makeTracker(): ChangeTracker {
  const tracker = new ChangeTracker()
  tracker.startTracking([], [], "whatsapp")
  return tracker
}

describe("ChangeTracker.trackNodeUpdate — debounced source attribution", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("attributes a user→ai crossover to the right source on each entry", () => {
    const tracker = makeTracker()

    // User types into a node. currentSource defaults to 'user'.
    tracker.trackNodeUpdate("node-1", { label: "" }, { label: "h" })
    // 100ms later, AI fires an edit on the same node before the user's
    // 500ms debounce window closes.
    vi.advanceTimersByTime(100)
    tracker.setSource("ai")
    tracker.trackNodeUpdate("node-1", { label: "h" }, { label: "AI value" })

    // AI flushes immediately (no debounce). The user's pending entry also
    // flushes from the crossover guard. Both appear right away.
    const afterCrossover = tracker.getChanges()
    expect(afterCrossover).toHaveLength(2)
    expect(afterCrossover[0].source).toBe("user")
    expect(afterCrossover[0].data.newData).toEqual({ label: "h" })
    expect(afterCrossover[1].source).toBe("ai")
    expect(afterCrossover[1].data.oldData).toEqual({ label: "h" })
    expect(afterCrossover[1].data.newData).toEqual({ label: "AI value" })
  })

  it("attributes an ai→user crossover to the right source on each entry", () => {
    const tracker = makeTracker()

    // AI edits a node first.
    tracker.setSource("ai")
    tracker.trackNodeUpdate("node-1", { label: "" }, { label: "generated" })

    // 200ms later, user starts typing on the same node. The cross-source
    // call must flush the AI entry as 'ai' and start a fresh user entry.
    vi.advanceTimersByTime(200)
    tracker.setSource("user")
    tracker.trackNodeUpdate("node-1", { label: "generated" }, { label: "user edit" })

    const afterCrossover = tracker.getChanges()
    expect(afterCrossover).toHaveLength(1)
    expect(afterCrossover[0].source).toBe("ai")
    expect(afterCrossover[0].data.newData).toEqual({ label: "generated" })

    vi.advanceTimersByTime(500)
    const final = tracker.getChanges()
    expect(final).toHaveLength(2)
    expect(final[1].source).toBe("user")
    expect(final[1].data.oldData).toEqual({ label: "generated" })
    expect(final[1].data.newData).toEqual({ label: "user edit" })
  })

  it("merges same-source rapid updates into one change entry", () => {
    const tracker = makeTracker()

    // Three rapid user keystrokes inside the 500ms window — should collapse
    // into one 'user' change with latestNewData reflecting the last value.
    tracker.trackNodeUpdate("node-1", { label: "" }, { label: "h" })
    vi.advanceTimersByTime(100)
    tracker.trackNodeUpdate("node-1", { label: "h" }, { label: "he" })
    vi.advanceTimersByTime(100)
    tracker.trackNodeUpdate("node-1", { label: "he" }, { label: "hel" })

    // Still within debounce window — no flush yet.
    expect(tracker.getChanges()).toHaveLength(0)

    vi.advanceTimersByTime(500)
    const changes = tracker.getChanges()
    expect(changes).toHaveLength(1)
    expect(changes[0].source).toBe("user")
    // firstOldData is the empty label from the first call; latestNewData is
    // the last value typed.
    expect(changes[0].data.oldData).toEqual({ label: "" })
    expect(changes[0].data.newData).toEqual({ label: "hel" })
  })

  it("does not merge across sources even when the same source is restored", () => {
    const tracker = makeTracker()

    // user types once
    tracker.trackNodeUpdate("node-1", { label: "" }, { label: "u1" })
    vi.advanceTimersByTime(50)
    // ai edits — flushes the user entry
    tracker.setSource("ai")
    tracker.trackNodeUpdate("node-1", { label: "u1" }, { label: "ai" })
    vi.advanceTimersByTime(50)
    // user types again — flushes the ai entry
    tracker.setSource("user")
    tracker.trackNodeUpdate("node-1", { label: "ai" }, { label: "u2" })
    vi.advanceTimersByTime(500)

    const changes = tracker.getChanges()
    expect(changes).toHaveLength(3)
    expect(changes[0].source).toBe("user")
    expect(changes[1].source).toBe("ai")
    expect(changes[2].source).toBe("user")
    expect(changes[0].data.newData).toEqual({ label: "u1" })
    expect(changes[1].data.newData).toEqual({ label: "ai" })
    expect(changes[2].data.newData).toEqual({ label: "u2" })
  })
})
