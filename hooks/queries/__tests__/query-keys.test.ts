import { describe, it, expect } from "vitest"
import { flowKeys, versionKeys } from "../query-keys"

describe("flowKeys", () => {
  it("all returns base key", () => {
    expect(flowKeys.all).toEqual(["flows"])
  })

  it("lists extends all", () => {
    const keys = flowKeys.lists()
    expect(keys).toEqual(["flows", "list"])
    // Must start with `all` so invalidating `all` also clears lists
    expect(keys.slice(0, flowKeys.all.length)).toEqual(flowKeys.all)
  })

  it("detail extends all with id", () => {
    const keys = flowKeys.detail("abc-123")
    expect(keys).toEqual(["flows", "detail", "abc-123"])
    expect(keys.slice(0, flowKeys.all.length)).toEqual(flowKeys.all)
  })

  it("detail keys are unique per id", () => {
    const key1 = flowKeys.detail("id-1")
    const key2 = flowKeys.detail("id-2")
    expect(key1).not.toEqual(key2)
  })
})

describe("versionKeys", () => {
  it("all scoped to project", () => {
    expect(versionKeys.all("proj-1")).toEqual(["versions", "proj-1"])
  })

  it("list extends all", () => {
    const keys = versionKeys.list("proj-1")
    expect(keys).toEqual(["versions", "proj-1", "list"])
    expect(keys.slice(0, 2)).toEqual(versionKeys.all("proj-1"))
  })

  it("draft extends all", () => {
    const keys = versionKeys.draft("proj-1")
    expect(keys).toEqual(["versions", "proj-1", "draft"])
    expect(keys.slice(0, 2)).toEqual(versionKeys.all("proj-1"))
  })

  it("different projects produce different keys", () => {
    expect(versionKeys.list("proj-1")).not.toEqual(versionKeys.list("proj-2"))
    expect(versionKeys.draft("proj-1")).not.toEqual(versionKeys.draft("proj-2"))
  })

  it("invalidating all(projectId) would match both list and draft", () => {
    const all = versionKeys.all("proj-1")
    const list = versionKeys.list("proj-1")
    const draft = versionKeys.draft("proj-1")

    // Both list and draft start with the `all` prefix
    expect(list.slice(0, all.length)).toEqual(all)
    expect(draft.slice(0, all.length)).toEqual(all)
  })
})
