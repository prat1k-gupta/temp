import { describe, it, expect } from "vitest"
import {
  findFlowQuerySchema,
  createFlowBodySchema,
  editFlowBodySchema,
  publishFlowBodySchema,
} from "@/lib/agent-api/schemas"

describe("findFlowQuerySchema", () => {
  it("accepts empty query params (all optional)", () => {
    expect(findFlowQuerySchema.parse({})).toEqual({ limit: 10 })
  })

  it("accepts a query string", () => {
    expect(findFlowQuerySchema.parse({ query: "iphone" })).toEqual({ query: "iphone", limit: 10 })
  })

  // TODO: schema rejects > 50 instead of clamping; see plan task 3 discussion
  it.skip("caps limit at 50", () => {
    const parsed = findFlowQuerySchema.parse({ limit: "999" })
    expect(parsed.limit).toBe(50)
  })

  it("coerces numeric strings to numbers for limit", () => {
    const parsed = findFlowQuerySchema.parse({ limit: "25" })
    expect(parsed.limit).toBe(25)
  })

  it("uses default limit of 10 when not specified", () => {
    expect(findFlowQuerySchema.parse({}).limit).toBe(10)
  })

  it("rejects limit below 1", () => {
    const parsed = findFlowQuerySchema.safeParse({ limit: "0" })
    expect(parsed.success).toBe(false)
  })

  it("rejects limit above 50", () => {
    const parsed = findFlowQuerySchema.safeParse({ limit: "51" })
    expect(parsed.success).toBe(false)
  })
})

describe("createFlowBodySchema", () => {
  const valid = {
    name: "iPhone Lead Capture",
    instruction: "build a lead capture flow",
    channel: "whatsapp",
    trigger_keyword: "iphone11",
  }

  it("accepts a valid body", () => {
    expect(createFlowBodySchema.parse(valid)).toEqual(valid)
  })

  it("rejects missing instruction", () => {
    const { success, error } = createFlowBodySchema.safeParse({ ...valid, instruction: undefined })
    expect(success).toBe(false)
    expect(error!.issues[0].path).toEqual(["instruction"])
  })

  it("rejects instruction longer than 4000 chars", () => {
    const longInstruction = "x".repeat(4001)
    const { success } = createFlowBodySchema.safeParse({ ...valid, instruction: longInstruction })
    expect(success).toBe(false)
  })

  it("rejects channel not in whitelist", () => {
    const { success } = createFlowBodySchema.safeParse({ ...valid, channel: "sms" })
    expect(success).toBe(false)
  })

  it("accepts all three valid channels", () => {
    for (const channel of ["whatsapp", "instagram", "web"]) {
      const { success } = createFlowBodySchema.safeParse({ ...valid, channel })
      expect(success, `channel=${channel}`).toBe(true)
    }
  })

  it("accepts trigger_keyword with spaces", () => {
    const { success } = createFlowBodySchema.safeParse({ ...valid, trigger_keyword: "hello world" })
    expect(success).toBe(true)
  })

  it("accepts trigger_keyword with mixed case (caller lowercases)", () => {
    const { success } = createFlowBodySchema.safeParse({ ...valid, trigger_keyword: "IPhone11" })
    expect(success).toBe(true)
  })

  it("accepts various trigger_keyword formats", () => {
    for (const kw of ["iphone11", "lead capture", "foo_bar", "a", "hello world!"]) {
      const { success } = createFlowBodySchema.safeParse({ ...valid, trigger_keyword: kw })
      expect(success, `kw=${kw}`).toBe(true)
    }
  })

  it("rejects trigger_keyword longer than 50 chars", () => {
    const { success } = createFlowBodySchema.safeParse({
      ...valid,
      trigger_keyword: "x".repeat(51),
    })
    expect(success).toBe(false)
  })

  it("accepts name field", () => {
    const result = createFlowBodySchema.parse({ ...valid, name: "My Lead Flow" })
    expect(result.name).toBe("My Lead Flow")
  })

  it("rejects missing name", () => {
    const { instruction, channel, trigger_keyword } = valid
    const { success } = createFlowBodySchema.safeParse({ instruction, channel, trigger_keyword })
    expect(success).toBe(false)
  })

  it("rejects name longer than 100 chars", () => {
    const { success } = createFlowBodySchema.safeParse({ ...valid, name: "x".repeat(101) })
    expect(success).toBe(false)
  })
})

describe("editFlowBodySchema", () => {
  it("accepts valid body with just instruction", () => {
    const parsed = editFlowBodySchema.parse({ instruction: "make it friendlier" })
    expect(parsed.instruction).toBe("make it friendlier")
  })

  it("rejects missing instruction", () => {
    expect(editFlowBodySchema.safeParse({}).success).toBe(false)
  })

  it("rejects instruction longer than 4000 chars", () => {
    expect(editFlowBodySchema.safeParse({ instruction: "x".repeat(4001) }).success).toBe(false)
  })
})

describe("publishFlowBodySchema", () => {
  it("accepts empty body", () => {
    expect(publishFlowBodySchema.parse({})).toEqual({})
  })

  it("accepts an empty object as body", () => {
    expect(() => publishFlowBodySchema.parse({})).not.toThrow()
  })

  it("ignores unknown fields without throwing", () => {
    const parsed = publishFlowBodySchema.parse({ version: 5 } as any)
    expect(parsed).toEqual({})
  })
})

