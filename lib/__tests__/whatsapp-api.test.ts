import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Test the response shaping logic from whatsapp-api.ts.
 * We test the mapping/transformation functions by replicating the logic
 * since the actual functions depend on apiClient (which needs browser env).
 */

// Replicate the mapping logic from getChatbotFlows
function mapChatbotFlow(f: any) {
  return {
    id: f.id,
    name: f.name,
    flowSlug: f.flow_slug,
    variables: f.variables || [],
    triggerKeywords: f.trigger_keywords || [],
    triggerMatchType: f.trigger_match_type || "contains_whole_word",
    triggerRef: f.trigger_ref || "",
  }
}

// Replicate publishFlowToWhatsApp response shaping
function shapePublishResponse(result: any, publishedFlowId?: string) {
  const isUpdate = !!publishedFlowId
  const flowId = result?.id || result?.flow_id || publishedFlowId
  const flowSlug = result?.flow_slug || undefined
  return { success: true, flowId, flowSlug, updated: isUpdate }
}

// Replicate getGlobalVariables extraction
function extractGlobalVariables(result: any) {
  const settings = result?.settings || result
  return { globalVariables: settings?.global_variables || {} }
}

// Replicate updateFlowKeywords payload building
function buildKeywordsPayload(params: {
  triggerKeywords?: string[]
  triggerMatchType?: string
  triggerRef?: string
}) {
  const payload: Record<string, any> = {}
  if (Array.isArray(params.triggerKeywords)) {
    payload.trigger_keywords = params.triggerKeywords
  }
  if (params.triggerMatchType !== undefined) {
    payload.trigger_match_type = params.triggerMatchType
  }
  if (params.triggerRef !== undefined) {
    payload.trigger_ref = params.triggerRef
  }
  return payload
}

describe("mapChatbotFlow — snake_case to camelCase", () => {
  it("maps all fields correctly", () => {
    const raw = {
      id: "flow-1",
      name: "Welcome Flow",
      flow_slug: "welcome-flow",
      variables: ["name", "email"],
      trigger_keywords: ["hi", "hello"],
      trigger_match_type: "exact",
      trigger_ref: "welcome",
    }

    const result = mapChatbotFlow(raw)

    expect(result.id).toBe("flow-1")
    expect(result.name).toBe("Welcome Flow")
    expect(result.flowSlug).toBe("welcome-flow")
    expect(result.variables).toEqual(["name", "email"])
    expect(result.triggerKeywords).toEqual(["hi", "hello"])
    expect(result.triggerMatchType).toBe("exact")
    expect(result.triggerRef).toBe("welcome")
  })

  it("defaults missing arrays to empty", () => {
    const raw = { id: "1", name: "x", flow_slug: "x" }
    const result = mapChatbotFlow(raw)

    expect(result.variables).toEqual([])
    expect(result.triggerKeywords).toEqual([])
  })

  it("defaults missing triggerMatchType to 'contains_whole_word'", () => {
    const raw = { id: "1", name: "x", flow_slug: "x" }
    const result = mapChatbotFlow(raw)

    expect(result.triggerMatchType).toBe("contains_whole_word")
  })

  it("defaults missing triggerRef to empty string", () => {
    const raw = { id: "1", name: "x", flow_slug: "x" }
    const result = mapChatbotFlow(raw)

    expect(result.triggerRef).toBe("")
  })
})

describe("shapePublishResponse — publish result extraction", () => {
  it("extracts flowId from result.id on create", () => {
    const result = { id: "new-flow-id", flow_slug: "my-flow" }
    const shaped = shapePublishResponse(result)

    expect(shaped.flowId).toBe("new-flow-id")
    expect(shaped.flowSlug).toBe("my-flow")
    expect(shaped.updated).toBe(false)
    expect(shaped.success).toBe(true)
  })

  it("extracts flowId from result.flow_id fallback", () => {
    const result = { flow_id: "alt-id", flow_slug: "slug" }
    const shaped = shapePublishResponse(result)

    expect(shaped.flowId).toBe("alt-id")
  })

  it("falls back to publishedFlowId on update", () => {
    const result = {} // no id in response
    const shaped = shapePublishResponse(result, "existing-id")

    expect(shaped.flowId).toBe("existing-id")
    expect(shaped.updated).toBe(true)
  })

  it("marks updated=true when publishedFlowId provided", () => {
    const result = { id: "updated-id", flow_slug: "slug" }
    const shaped = shapePublishResponse(result, "existing-id")

    expect(shaped.updated).toBe(true)
    expect(shaped.flowId).toBe("updated-id")
  })

  it("flowSlug is undefined when not in response", () => {
    const result = { id: "1" }
    const shaped = shapePublishResponse(result)

    expect(shaped.flowSlug).toBeUndefined()
  })
})

describe("extractGlobalVariables — settings extraction", () => {
  it("extracts from nested settings.global_variables", () => {
    const result = {
      settings: {
        global_variables: { brand: "Freestand", region: "IN" },
        other_setting: "value",
      },
    }
    const extracted = extractGlobalVariables(result)

    expect(extracted.globalVariables).toEqual({ brand: "Freestand", region: "IN" })
  })

  it("extracts from top-level global_variables when no settings wrapper", () => {
    const result = {
      global_variables: { key: "value" },
    }
    const extracted = extractGlobalVariables(result)

    expect(extracted.globalVariables).toEqual({ key: "value" })
  })

  it("defaults to empty object when no global_variables", () => {
    const result = { settings: {} }
    const extracted = extractGlobalVariables(result)

    expect(extracted.globalVariables).toEqual({})
  })

  it("defaults to empty object when result is null", () => {
    const extracted = extractGlobalVariables(null)

    expect(extracted.globalVariables).toEqual({})
  })
})

describe("buildKeywordsPayload — camelCase to snake_case", () => {
  it("maps all fields to snake_case", () => {
    const payload = buildKeywordsPayload({
      triggerKeywords: ["hi", "hello"],
      triggerMatchType: "exact",
      triggerRef: "welcome",
    })

    expect(payload).toEqual({
      trigger_keywords: ["hi", "hello"],
      trigger_match_type: "exact",
      trigger_ref: "welcome",
    })
  })

  it("only includes provided fields", () => {
    const payload = buildKeywordsPayload({
      triggerKeywords: ["test"],
    })

    expect(payload).toEqual({ trigger_keywords: ["test"] })
    expect(payload).not.toHaveProperty("trigger_match_type")
    expect(payload).not.toHaveProperty("trigger_ref")
  })

  it("returns empty object when no fields provided", () => {
    const payload = buildKeywordsPayload({})

    expect(payload).toEqual({})
  })

  it("includes triggerMatchType even when empty string", () => {
    const payload = buildKeywordsPayload({ triggerMatchType: "" })

    expect(payload).toEqual({ trigger_match_type: "" })
  })

  it("includes triggerRef even when empty string", () => {
    const payload = buildKeywordsPayload({ triggerRef: "" })

    expect(payload).toEqual({ trigger_ref: "" })
  })

  it("does not include triggerKeywords when not an array", () => {
    const payload = buildKeywordsPayload({
      triggerKeywords: "not-an-array" as any,
    })

    expect(payload).not.toHaveProperty("trigger_keywords")
  })
})
