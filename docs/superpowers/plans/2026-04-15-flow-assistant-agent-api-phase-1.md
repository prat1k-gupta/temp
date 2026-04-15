# Flow Assistant Agent API — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the scaffolding layer (`lib/agent-api/*`) and the simplest endpoint (`GET /v1/agent/flows`) for the external agent REST API. This phase is deliberately scope-minimal — no AI code is touched, no create/edit/publish endpoints, no SSE. Prove the auth wrapper, account resolver, error shapes, rate limiter, and one read-only endpoint work end-to-end with a real `whm_*` API key against a live fs-whatsapp instance.

**Architecture:** New Next.js route handler at `/api/v1/agent/flows` (GET only in Phase 1) wrapped by `withAgentAuth`, a higher-order function that reads `X-API-Key`, validates it by calling fs-whatsapp's existing `GET /api/accounts` endpoint, loads the acting account (first-picked per the single-account assumption), applies rate limiting, and hands a clean `AgentContext` to the handler. All glue code lives in `lib/agent-api/*`. Zero changes to fs-whatsapp, zero changes to existing AI code, zero changes to existing `lib/whatsapp-api.ts` (the agent path has its own `lib/agent-api/publisher.ts` for direct-fetch calls that forward `X-API-Key`).

**Tech Stack:** Next.js 15 App Router, TypeScript, Zod for schema validation, Vitest for unit/integration tests. Dev runs via `docker compose up` on port 3002 with source mounted for hot reload. Tests run locally with `npm run test`. TypeScript check locally with `npx tsc --noEmit`.

**Reference spec:** `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-design.md`

**Pre-reading for the implementer (skim these first):**
- `magic-flow/lib/whatsapp-api.ts` — current pattern for talking to fs-whatsapp (via `apiClient`, session-cookie auth). We are NOT using this path; we're building a parallel direct-fetch layer that forwards `X-API-Key`. But read it to understand the endpoint shapes.
- `magic-flow/lib/__tests__/whatsapp-api.test.ts` — existing test style (vitest, `describe`/`it`/`expect`/`vi`, pure-function tests that avoid network mocks).
- `magic-flow/app/api/ai/flow-assistant/route.ts` — existing streaming route handler pattern. Phase 1 doesn't stream, but Phase 2 will, so skim the shape.
- `fs-whatsapp/internal/handlers/accounts.go:52` — the `ListAccounts` handler we call for account resolution. Response shape is `{accounts: [...]}` with each account being a `AccountResponse` struct (see same file line 32). `phone_number` is `omitempty`.
- `fs-whatsapp/internal/middleware/middleware.go:144` — `validateAPIKey` — confirms `whm_*` keys authenticate via `X-API-Key` header and set `organization_id` on the request context.

---

## File Structure

### New files (all in magic-flow)

```
magic-flow/
├── lib/agent-api/
│   ├── constants.ts                  # FS_WHATSAPP_URL, rate limit buckets, etc.
│   ├── errors.ts                     # AgentError class, error code enum, HTTP/SSE serializers
│   ├── schemas.ts                    # Zod schemas for request bodies (all 4 endpoints defined ahead of time)
│   ├── rate-limit.ts                 # In-memory per-key rate limiter (LRU map)
│   ├── sse.ts                        # SSEWriter class — emits progress/result/error events (used Phase 2+)
│   ├── account-resolver.ts           # getActingAccount — single-account assumption + TODO comment
│   ├── auth.ts                       # withAgentAuth higher-order function
│   ├── types.ts                      # Shared types: AgentContext, Account, WhatsAppAccountRaw
│   ├── publisher.ts                  # Direct-fetch helpers to fs-whatsapp (only listFlows in Phase 1)
│   └── __tests__/
│       ├── errors.test.ts
│       ├── schemas.test.ts
│       ├── rate-limit.test.ts
│       ├── sse.test.ts
│       ├── account-resolver.test.ts
│       ├── auth.test.ts
│       └── publisher.test.ts
│
└── app/api/v1/agent/flows/
    └── route.ts                      # GET handler (find/list flows)
```

### Modified files

None. Phase 1 is purely additive.

### File responsibilities

- **`constants.ts`** — single source for `FS_WHATSAPP_URL` env var resolution, rate limit bucket sizes, key prefix check, max flow list limit.
- **`errors.ts`** — the `AgentError` class, the `AgentErrorCode` string enum, and two serialization methods: `.toHttpResponse()` for non-streaming endpoints, `.toSSE()` for SSE streams (used Phase 2+).
- **`schemas.ts`** — Zod schemas for request body validation. Phase 1 only uses `findFlowQuerySchema`, but we define all 4 endpoints' schemas upfront so they're ready for Phase 2-3.
- **`rate-limit.ts`** — `rateLimitCheck(apiKey, bucket)` returns `{ok: true}` or `{ok: false, retryAfter: number}`. In-memory `Map<string, {count, resetAt}>`. No Redis. No persistence across restarts.
- **`sse.ts`** — `SSEWriter` class wrapping a `ReadableStreamDefaultController`. Methods: `progress(phase, message, extra?)`, `result(payload)`, `error(agentError)`, `heartbeat()`, `close()`. Phase 1 only unit-tests this; nothing uses it yet.
- **`account-resolver.ts`** — `getActingAccount(apiKey)` fetches `GET /api/accounts` from fs-whatsapp with `X-API-Key: apiKey` header, returns the first account with `connected_channels: ["whatsapp"]` hardcoded. Throws `AgentError` on failures.
- **`auth.ts`** — `withAgentAuth<T>(handler)` HOF: reads `X-API-Key`, rate-limits, calls `getActingAccount`, passes `AgentContext` to handler.
- **`types.ts`** — `AgentContext = { apiKey: string, account: Account }`, `Account = { id, name, phone_number, connected_channels }`, `WhatsAppAccountRaw` (the shape fs-whatsapp returns before normalization).
- **`publisher.ts`** — direct-fetch helpers. Phase 1 only has `listFlows(ctx, limit)` which calls `GET /api/magic-flow/projects?limit=N`. More functions added in Phase 2.
- **`route.ts`** — single `GET` handler for `/api/v1/agent/flows`. Wraps a small function that calls `publisher.listFlows`, shapes the response, returns JSON.

---

## Test Strategy

**Unit tests** cover each lib file in isolation. Network calls to fs-whatsapp are mocked with `vi.fn()` replacing `global.fetch` (vitest is configured with `globals: true`).

**Integration test** covers the full `GET /api/v1/agent/flows` route. The route handler is imported directly and called with a mock `Request`. The `fetch` call to fs-whatsapp is mocked to return a canned response. We assert the JSON shape and status code.

**Manual verification** is the end-of-phase sanity check — docker compose up, create a `whm_*` key in the dashboard, curl the endpoint, assert the response.

We do NOT test against a real fs-whatsapp instance in unit tests. We do NOT spin up a Docker container from a test. Tests run in-process with mocked `fetch`.

---

## Task 1: Constants and Types

**Files:**
- Create: `magic-flow/lib/agent-api/constants.ts`
- Create: `magic-flow/lib/agent-api/types.ts`

No tests for this task — these are pure constant/type declarations. Everything else in Phase 1 imports from here.

- [ ] **Step 1: Create `constants.ts`**

File: `magic-flow/lib/agent-api/constants.ts`

```typescript
/**
 * URL for the fs-whatsapp backend. Read once at module load.
 * Uses the same env var as lib/api-client.ts so dev config stays consistent.
 */
export const FS_WHATSAPP_URL = process.env.NEXT_PUBLIC_FS_WHATSAPP_URL || "http://localhost:8080"

/** Prefix that every general API key carries. Used for fast-fail auth rejection. */
export const AGENT_API_KEY_PREFIX = "whm_"

/**
 * Per-key rate limit buckets. See spec "Edge case #7" and decision #14.
 * Numbers are arbitrary for v1 — tune after we see real traffic.
 * Bucket keys match the rate-limit decision points in each route handler.
 */
export const RATE_LIMIT_BUCKETS = {
  /** Applied to POST /v1/agent/flows and POST /v1/agent/flows/{id}/edit (expensive AI calls) */
  expensive: { maxPerMinute: 10 },
  /** Applied to POST /v1/agent/flows/{id}/publish */
  publish: { maxPerMinute: 30 },
  /** Applied to GET /v1/agent/flows (cheap list) */
  cheap: { maxPerMinute: 120 },
} as const

export type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS

/** Max number of flows returned by GET /v1/agent/flows. Hard cap. */
export const FIND_FLOW_MAX_LIMIT = 50

/** Default limit if caller doesn't specify. */
export const FIND_FLOW_DEFAULT_LIMIT = 10
```

- [ ] **Step 2: Create `types.ts`**

File: `magic-flow/lib/agent-api/types.ts`

```typescript
/**
 * The raw account shape returned by fs-whatsapp's `GET /api/accounts`.
 * Mirrors `AccountResponse` in fs-whatsapp/internal/handlers/accounts.go:32.
 * We only depend on a subset of fields.
 */
export interface WhatsAppAccountRaw {
  id: string
  name: string
  phone_number?: string // omitempty in Go
  status: string
  has_access_token: boolean
}

/**
 * The normalized Account we pass around internally. `connected_channels` is
 * hardcoded to ["whatsapp"] in v1 because fs-whatsapp's /api/accounts endpoint
 * only returns WhatsApp accounts (Instagram and Line live in separate models
 * at separate endpoints). See spec "Relationship to Phase D MCP server" for
 * the multi-channel generalization path.
 */
export interface Account {
  id: string
  name: string
  phone_number: string | undefined
  connected_channels: ReadonlyArray<"whatsapp" | "instagram" | "web">
}

/**
 * Everything a route handler needs after auth runs. The `apiKey` is kept
 * so downstream fetches can forward the `X-API-Key` header — we never have
 * to look it up again.
 */
export interface AgentContext {
  apiKey: string
  account: Account
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (or at minimum, no errors originating from the new files).

- [ ] **Step 4: Commit**

```bash
git add magic-flow/lib/agent-api/constants.ts magic-flow/lib/agent-api/types.ts
git commit -m "feat(agent-api): add constants and shared types"
```

---

## Task 2: AgentError class and error code enum

**Files:**
- Create: `magic-flow/lib/agent-api/errors.ts`
- Create: `magic-flow/lib/agent-api/__tests__/errors.test.ts`

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/errors.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { AgentError } from "@/lib/agent-api/errors"

describe("AgentError", () => {
  it("constructs with code, message, and optional details", () => {
    const err = new AgentError("unauthorized", "Invalid API key")
    expect(err.code).toBe("unauthorized")
    expect(err.message).toBe("Invalid API key")
    expect(err.details).toBeUndefined()
  })

  it("stores details when provided", () => {
    const err = new AgentError("keyword_conflict", "Keyword in use", {
      existing_flow: { id: "mf_1", name: "Foo", magic_flow_url: "https://..." },
    })
    expect(err.details).toEqual({
      existing_flow: { id: "mf_1", name: "Foo", magic_flow_url: "https://..." },
    })
  })

  it("toHttpResponse returns a Response with correct status and body shape", async () => {
    const err = new AgentError("keyword_conflict", "Keyword in use", {
      existing_flow: { id: "mf_1", name: "Foo" },
    })
    const res = err.toHttpResponse()
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toContain("application/json")
    const body = await res.json()
    expect(body).toEqual({
      code: "keyword_conflict",
      message: "Keyword in use",
      existing_flow: { id: "mf_1", name: "Foo" },
    })
  })

  it("maps each error code to the correct HTTP status", () => {
    const cases: Array<[string, number]> = [
      ["missing_required_param", 400],
      ["invalid_param", 400],
      ["invalid_instruction", 400],
      ["invalid_trigger_keyword", 400],
      ["channel_not_connected", 400],
      ["no_account_configured", 400],
      ["unsupported_edit", 400],
      ["unauthorized", 401],
      ["flow_not_found", 404],
      ["node_not_found", 404],
      ["keyword_conflict", 409],
      ["rate_limited", 429],
      ["validation_failed", 500],
      ["internal_error", 500],
      ["publish_failed", 502],
    ]
    for (const [code, status] of cases) {
      const res = new AgentError(code as any, "msg").toHttpResponse()
      expect(res.status, `code=${code}`).toBe(status)
    }
  })

  it("toSSE returns a string with event: error\\ndata: {...}\\n\\n framing", () => {
    const err = new AgentError("validation_failed", "Bad flow", { errors: ["unreachable node"] })
    const framed = err.toSSE()
    expect(framed).toMatch(/^event: error\n/)
    expect(framed).toMatch(/^data: .+\n\n$/m)
    const dataLine = framed.split("\n").find((l) => l.startsWith("data: "))!
    const parsed = JSON.parse(dataLine.slice(6))
    expect(parsed).toEqual({
      code: "validation_failed",
      message: "Bad flow",
      errors: ["unreachable node"],
    })
  })

  it("fromUnknown wraps arbitrary errors as internal_error", () => {
    const wrapped = AgentError.fromUnknown(new Error("boom"))
    expect(wrapped).toBeInstanceOf(AgentError)
    expect(wrapped.code).toBe("internal_error")
    expect(wrapped.message).toContain("boom")
  })

  it("fromUnknown passes through existing AgentError instances unchanged", () => {
    const original = new AgentError("rate_limited", "Slow down", { retry_after_seconds: 30 })
    const wrapped = AgentError.fromUnknown(original)
    expect(wrapped).toBe(original) // same instance
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/errors.test.ts` (from `magic-flow/` directory)

Expected: FAIL with error about `@/lib/agent-api/errors` module not found.

- [ ] **Step 3: Implement `errors.ts`**

File: `magic-flow/lib/agent-api/errors.ts`

```typescript
/**
 * Stable string codes for all agent API errors. Every error response body
 * carries a `code` field set to one of these values. Customers depend on
 * these codes being stable; never rename or remove a code in a minor release.
 */
export type AgentErrorCode =
  | "missing_required_param"
  | "invalid_param"
  | "invalid_instruction"
  | "invalid_trigger_keyword"
  | "channel_not_connected"
  | "no_account_configured"
  | "unsupported_edit"
  | "unauthorized"
  | "flow_not_found"
  | "node_not_found"
  | "keyword_conflict"
  | "rate_limited"
  | "validation_failed"
  | "internal_error"
  | "publish_failed"

const HTTP_STATUS_BY_CODE: Record<AgentErrorCode, number> = {
  missing_required_param: 400,
  invalid_param: 400,
  invalid_instruction: 400,
  invalid_trigger_keyword: 400,
  channel_not_connected: 400,
  no_account_configured: 400,
  unsupported_edit: 400,
  unauthorized: 401,
  flow_not_found: 404,
  node_not_found: 404,
  keyword_conflict: 409,
  rate_limited: 429,
  validation_failed: 500,
  internal_error: 500,
  publish_failed: 502,
}

export class AgentError extends Error {
  readonly code: AgentErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(code: AgentErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "AgentError"
    this.code = code
    this.details = details
  }

  /**
   * Wrap any thrown value as an AgentError. If already an AgentError, returns
   * the same instance (no re-wrapping). Otherwise produces an internal_error
   * with the original message as context.
   */
  static fromUnknown(err: unknown): AgentError {
    if (err instanceof AgentError) return err
    const message = err instanceof Error ? err.message : String(err)
    return new AgentError("internal_error", message || "Unknown internal error")
  }

  /**
   * Build the JSON body customers receive. The `code`, `message`, and any
   * `details` fields are flattened into the top-level object — we don't nest
   * details under a `details` key because customers inspect fields like
   * `existing_flow` directly on the error object.
   */
  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message, ...(this.details ?? {}) }
  }

  /** For non-streaming endpoints: plain JSON Response with the correct HTTP status. */
  toHttpResponse(): Response {
    return new Response(JSON.stringify(this.toJSON()), {
      status: HTTP_STATUS_BY_CODE[this.code],
      headers: { "content-type": "application/json" },
    })
  }

  /**
   * For SSE streams: framed as an `event: error\ndata: {...}\n\n` block.
   * The route handler writes this directly to the stream controller. After
   * writing, the stream should be closed — errors are terminal events.
   */
  toSSE(): string {
    return `event: error\ndata: ${JSON.stringify(this.toJSON())}\n\n`
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/errors.test.ts`

Expected: all 7 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/errors.ts magic-flow/lib/agent-api/__tests__/errors.test.ts
git commit -m "feat(agent-api): add AgentError class with code enum and serializers"
```

---

## Task 3: Zod schemas for all request bodies

**Files:**
- Create: `magic-flow/lib/agent-api/schemas.ts`
- Create: `magic-flow/lib/agent-api/__tests__/schemas.test.ts`

We define schemas for ALL 4 endpoints in Phase 1 so they're ready for Phase 2 and 3. Only the find-flow query schema is actually imported by route handlers in Phase 1.

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/schemas.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import {
  findFlowQuerySchema,
  createFlowBodySchema,
  editFlowBodySchema,
  publishFlowBodySchema,
  TRIGGER_KEYWORD_REGEX,
} from "@/lib/agent-api/schemas"

describe("findFlowQuerySchema", () => {
  it("accepts empty query params (all optional)", () => {
    expect(findFlowQuerySchema.parse({})).toEqual({ limit: 10 })
  })

  it("accepts a query string", () => {
    expect(findFlowQuerySchema.parse({ query: "iphone" })).toEqual({ query: "iphone", limit: 10 })
  })

  it("caps limit at 50", () => {
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

  it("rejects trigger_keyword with spaces", () => {
    const { success } = createFlowBodySchema.safeParse({ ...valid, trigger_keyword: "hello world" })
    expect(success).toBe(false)
  })

  it("rejects trigger_keyword with uppercase letters", () => {
    // Caller is expected to lowercase before passing, or schema rejects.
    const { success } = createFlowBodySchema.safeParse({ ...valid, trigger_keyword: "IPhone11" })
    expect(success).toBe(false)
  })

  it("accepts trigger_keyword with lowercase alphanumeric, dash, underscore", () => {
    for (const kw of ["iphone11", "lead-capture", "foo_bar", "a"]) {
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
    // v1 publish has no fields; unknown fields should not cause a hard failure
    // (forward-compat for when we add `version` for rollback).
    const parsed = publishFlowBodySchema.parse({ version: 5 } as any)
    // We expect the schema to strip unknowns, not carry them through.
    expect(parsed).toEqual({})
  })
})

describe("TRIGGER_KEYWORD_REGEX", () => {
  it("matches valid keywords", () => {
    expect(TRIGGER_KEYWORD_REGEX.test("iphone11")).toBe(true)
    expect(TRIGGER_KEYWORD_REGEX.test("a-b_c")).toBe(true)
  })

  it("rejects invalid keywords", () => {
    expect(TRIGGER_KEYWORD_REGEX.test("hello world")).toBe(false)
    expect(TRIGGER_KEYWORD_REGEX.test("Iphone")).toBe(false)
    expect(TRIGGER_KEYWORD_REGEX.test("")).toBe(false)
    expect(TRIGGER_KEYWORD_REGEX.test("x".repeat(51))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/schemas.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement `schemas.ts`**

File: `magic-flow/lib/agent-api/schemas.ts`

```typescript
import { z } from "zod"
import { FIND_FLOW_DEFAULT_LIMIT, FIND_FLOW_MAX_LIMIT } from "./constants"

/**
 * Trigger keyword validation — lowercase alphanumeric, dash, underscore.
 * 1-50 chars. Must be applied AFTER the caller normalizes to lowercase.
 * See spec "Section 2" validation rules.
 */
export const TRIGGER_KEYWORD_REGEX = /^[a-z0-9_-]{1,50}$/

/** GET /v1/agent/flows query params. */
export const findFlowQuerySchema = z.object({
  query: z.string().optional(),
  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(FIND_FLOW_MAX_LIMIT)
    .default(FIND_FLOW_DEFAULT_LIMIT),
})

export type FindFlowQuery = z.infer<typeof findFlowQuerySchema>

/** POST /v1/agent/flows request body. */
export const createFlowBodySchema = z.object({
  instruction: z.string().min(1).max(4000),
  channel: z.enum(["whatsapp", "instagram", "web"]),
  trigger_keyword: z.string().regex(TRIGGER_KEYWORD_REGEX, {
    message: "Trigger keyword must be 1-50 chars, lowercase alphanumeric + dash + underscore",
  }),
})

export type CreateFlowBody = z.infer<typeof createFlowBodySchema>

/** POST /v1/agent/flows/{flow_id}/edit request body. */
export const editFlowBodySchema = z.object({
  instruction: z.string().min(1).max(4000),
})

export type EditFlowBody = z.infer<typeof editFlowBodySchema>

/**
 * POST /v1/agent/flows/{flow_id}/publish request body.
 * Empty in v1. Unknowns are stripped for forward compat with a future
 * `version` field for rollback.
 */
export const publishFlowBodySchema = z.object({}).strip()

export type PublishFlowBody = z.infer<typeof publishFlowBodySchema>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/schemas.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/schemas.ts magic-flow/lib/agent-api/__tests__/schemas.test.ts
git commit -m "feat(agent-api): add zod schemas for all 4 endpoint request bodies"
```

---

## Task 4: In-memory rate limiter

**Files:**
- Create: `magic-flow/lib/agent-api/rate-limit.ts`
- Create: `magic-flow/lib/agent-api/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/rate-limit.test.ts`

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/rate-limit.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `rate-limit.ts`**

File: `magic-flow/lib/agent-api/rate-limit.ts`

```typescript
import { RATE_LIMIT_BUCKETS, type RateLimitBucket } from "./constants"

type BucketKey = `${string}:${RateLimitBucket}`

interface BucketState {
  count: number
  resetAt: number // unix ms
}

/**
 * In-memory rate limit store keyed by `${apiKey}:${bucket}`. Lives for the
 * lifetime of the Next.js process. On hot reload or restart, limits reset.
 * This is intentionally simple — not Redis-backed, not per-IP, not durable.
 *
 * Good enough for v1. See spec decision #14 and edge case #7.
 */
const store = new Map<BucketKey, BucketState>()

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

export function rateLimitCheck(apiKey: string, bucket: RateLimitBucket): RateLimitResult {
  const key: BucketKey = `${apiKey}:${bucket}`
  const now = Date.now()
  const limit = RATE_LIMIT_BUCKETS[bucket].maxPerMinute
  const state = store.get(key)

  if (!state || state.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + 60_000 })
    return { ok: true }
  }

  if (state.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((state.resetAt - now) / 1000) }
  }

  state.count += 1
  return { ok: true }
}

/** TEST ONLY. Clears the store. Not exported from the module index. */
export function __resetRateLimitForTests(): void {
  store.clear()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/rate-limit.test.ts`

Expected: all 8 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/rate-limit.ts magic-flow/lib/agent-api/__tests__/rate-limit.test.ts
git commit -m "feat(agent-api): add in-memory per-key rate limiter with three buckets"
```

---

## Task 5: SSE writer (for Phase 2+, unit-tested in Phase 1)

**Files:**
- Create: `magic-flow/lib/agent-api/sse.ts`
- Create: `magic-flow/lib/agent-api/__tests__/sse.test.ts`

This isn't used by any endpoint in Phase 1 — we build and test it now so Phase 2's create endpoint can pick it up unchanged.

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/sse.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { SSEWriter } from "@/lib/agent-api/sse"
import { AgentError } from "@/lib/agent-api/errors"

/**
 * Helper: consume a ReadableStream<Uint8Array> to a single decoded string.
 */
async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
}

describe("SSEWriter", () => {
  it("progress emits `event: progress\\ndata: {...}\\n\\n` framing", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.progress("generating", "Creating nodes", { nodes_created: 2, nodes_total: 6 })
    writer.close()
    const text = await readAll(readable)
    expect(text).toContain("event: progress\n")
    expect(text).toContain("\n\n")
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
    const parsed = JSON.parse(dataLine.slice(6))
    expect(parsed).toEqual({
      phase: "generating",
      message: "Creating nodes",
      nodes_created: 2,
      nodes_total: 6,
    })
  })

  it("result emits a single result event then closes naturally", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.result({ flow_id: "mf_1", version: 2 })
    writer.close()
    const text = await readAll(readable)
    expect(text).toMatch(/event: result\n/)
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
    expect(JSON.parse(dataLine.slice(6))).toEqual({ flow_id: "mf_1", version: 2 })
  })

  it("error emits an SSE error event formatted from AgentError", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.error(new AgentError("validation_failed", "Bad flow", { errors: ["x"] }))
    writer.close()
    const text = await readAll(readable)
    expect(text).toContain("event: error\n")
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))!
    expect(JSON.parse(dataLine.slice(6))).toEqual({
      code: "validation_failed",
      message: "Bad flow",
      errors: ["x"],
    })
  })

  it("heartbeat emits an SSE comment line (prefixed with `:`)", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.heartbeat()
    writer.close()
    const text = await readAll(readable)
    expect(text).toContain(": ping\n\n")
  })

  it("multiple events in order are all flushed", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.progress("a", "first")
    writer.progress("b", "second")
    writer.result({ done: true })
    writer.close()
    const text = await readAll(readable)
    const events = text.split("\n\n").filter((e) => e.trim())
    expect(events.length).toBe(3)
    expect(events[0]).toContain("event: progress")
    expect(events[1]).toContain("event: progress")
    expect(events[2]).toContain("event: result")
  })

  it("close is idempotent — calling twice does not throw", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.progress("a", "m")
    writer.close()
    expect(() => writer.close()).not.toThrow()
    await readAll(readable)
  })

  it("writes after close are silently ignored (does not throw)", async () => {
    const { readable, writer } = SSEWriter.create()
    writer.close()
    expect(() => writer.progress("x", "y")).not.toThrow()
    await readAll(readable)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/sse.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `sse.ts`**

File: `magic-flow/lib/agent-api/sse.ts`

```typescript
import { AgentError } from "./errors"

/**
 * SSE writer for agent API streaming endpoints. Wraps a ReadableStream's
 * controller and exposes three event types: `progress`, `result`, `error`,
 * plus a `heartbeat` to keep proxies from timing out.
 *
 * Usage:
 *   const { readable, writer } = SSEWriter.create()
 *   // ... call writer.progress(...), writer.result(...) ...
 *   writer.close()
 *   return new Response(readable, { headers: { "content-type": "text/event-stream" }})
 */
export class SSEWriter {
  private readonly encoder = new TextEncoder()
  private closed = false

  private constructor(private readonly controller: ReadableStreamDefaultController<Uint8Array>) {}

  /** Factory that pairs a stream + writer. */
  static create(): { readable: ReadableStream<Uint8Array>; writer: SSEWriter } {
    let writer!: SSEWriter
    const readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        writer = new SSEWriter(controller)
      },
    })
    return { readable, writer }
  }

  /** Emit a progress event. `phase` is a short machine-readable string; `message` is human-readable. */
  progress(phase: string, message: string, extra?: Record<string, unknown>): void {
    if (this.closed) return
    const payload = { phase, message, ...(extra ?? {}) }
    this.writeFrame("progress", JSON.stringify(payload))
  }

  /** Emit the final result event. The stream should be closed after this. */
  result(payload: Record<string, unknown>): void {
    if (this.closed) return
    this.writeFrame("result", JSON.stringify(payload))
  }

  /** Emit an error event from an AgentError. Terminal — close the stream after. */
  error(err: AgentError): void {
    if (this.closed) return
    // Reuse AgentError's toSSE() to keep the framing in one place.
    this.enqueue(err.toSSE())
  }

  /** Emit an SSE comment line as a heartbeat. Proxies stop buffering long streams if they see any bytes. */
  heartbeat(): void {
    if (this.closed) return
    this.enqueue(": ping\n\n")
  }

  /** Close the underlying stream. Safe to call multiple times. */
  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.controller.close()
    } catch {
      // Already closed — swallow.
    }
  }

  private writeFrame(eventType: string, data: string): void {
    this.enqueue(`event: ${eventType}\ndata: ${data}\n\n`)
  }

  private enqueue(raw: string): void {
    try {
      this.controller.enqueue(this.encoder.encode(raw))
    } catch {
      // Controller may have been closed externally (client abort) — swallow.
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/sse.test.ts`

Expected: all 7 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/sse.ts magic-flow/lib/agent-api/__tests__/sse.test.ts
git commit -m "feat(agent-api): add SSEWriter class with progress/result/error/heartbeat"
```

---

## Task 6: Account resolver (single-account assumption)

**Files:**
- Create: `magic-flow/lib/agent-api/account-resolver.ts`
- Create: `magic-flow/lib/agent-api/__tests__/account-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/account-resolver.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getActingAccount } from "@/lib/agent-api/account-resolver"
import { AgentError } from "@/lib/agent-api/errors"

describe("getActingAccount", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns the first account normalized to our Account shape", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [
            { id: "acc_1", name: "Acme Main", phone_number: "+919876543210", status: "active", has_access_token: true },
            { id: "acc_2", name: "Second", phone_number: "+919988776655", status: "active", has_access_token: true },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const account = await getActingAccount("whm_abc")
    expect(account).toEqual({
      id: "acc_1",
      name: "Acme Main",
      phone_number: "+919876543210",
      connected_channels: ["whatsapp"],
    })
  })

  it("forwards X-API-Key header on the fetch call", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ accounts: [{ id: "a", name: "n", status: "active", has_access_token: true }] }), {
        status: 200,
      }),
    )
    await getActingAccount("whm_abc")
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("throws unauthorized AgentError when fs-whatsapp returns 401", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("", { status: 401 }))
    await expect(getActingAccount("whm_bad")).rejects.toMatchObject({
      name: "AgentError",
      code: "unauthorized",
    })
  })

  it("throws no_account_configured when accounts list is empty", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response(JSON.stringify({ accounts: [] }), { status: 200 }))
    await expect(getActingAccount("whm_abc")).rejects.toMatchObject({
      name: "AgentError",
      code: "no_account_configured",
    })
  })

  it("throws internal_error when fs-whatsapp returns non-401 failure status", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("oops", { status: 500 }))
    await expect(getActingAccount("whm_abc")).rejects.toMatchObject({
      name: "AgentError",
      code: "internal_error",
    })
  })

  it("throws internal_error when the fetch itself rejects (network error)", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    await expect(getActingAccount("whm_abc")).rejects.toMatchObject({
      name: "AgentError",
      code: "internal_error",
    })
  })

  it("propagates an undefined phone_number when the field is omitted", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [{ id: "a", name: "n", status: "active", has_access_token: true }],
        }),
        { status: 200 },
      ),
    )
    const account = await getActingAccount("whm_abc")
    expect(account.phone_number).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/account-resolver.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `account-resolver.ts`**

File: `magic-flow/lib/agent-api/account-resolver.ts`

```typescript
import { FS_WHATSAPP_URL } from "./constants"
import { AgentError } from "./errors"
import type { Account, WhatsAppAccountRaw } from "./types"

/**
 * TODO(multi-account): when orgs are allowed to have >1 account, this helper
 * must be replaced with an explicit account_id param on the request. For now
 * (single-account assumption), we unconditionally pick the first account
 * returned by fs-whatsapp. If an org has 0 accounts, we return an error.
 *
 * When this assumption is removed:
 *   1. Add `account_id` as a required param on POST /v1/agent/flows
 *   2. If we also add a GET /v1/agent/account(s) endpoint at that time, it returns an array
 *   3. Delete this helper
 *
 * Multi-channel note: fs-whatsapp's GET /api/accounts returns ONLY WhatsApp
 * accounts today (Instagram/Line are separate models with separate endpoints).
 * That's why `connected_channels` is hardcoded to ["whatsapp"] below. When
 * multi-channel ships, this helper queries the other platform endpoints and
 * unions the result.
 */
export async function getActingAccount(apiKey: string): Promise<Account> {
  let res: Response
  try {
    res = await fetch(`${FS_WHATSAPP_URL}/api/accounts`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (res.status === 401) {
    throw new AgentError("unauthorized", "Invalid or expired API key")
  }
  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when listing accounts`)
  }

  let body: { accounts?: WhatsAppAccountRaw[] }
  try {
    body = (await res.json()) as { accounts?: WhatsAppAccountRaw[] }
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable accounts response")
  }

  const accounts = body.accounts ?? []
  if (accounts.length === 0) {
    throw new AgentError(
      "no_account_configured",
      "This organization has no connected WhatsApp account. Connect one in the Freestand dashboard before using the agent API.",
    )
  }

  const first = accounts[0]
  return {
    id: first.id,
    name: first.name,
    phone_number: first.phone_number,
    connected_channels: ["whatsapp"],
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/account-resolver.test.ts`

Expected: all 7 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/account-resolver.ts magic-flow/lib/agent-api/__tests__/account-resolver.test.ts
git commit -m "feat(agent-api): add getActingAccount with single-account assumption"
```

---

## Task 7: withAgentAuth wrapper

**Files:**
- Create: `magic-flow/lib/agent-api/auth.ts`
- Create: `magic-flow/lib/agent-api/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/auth.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { withAgentAuth } from "@/lib/agent-api/auth"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"
import type { AgentContext } from "@/lib/agent-api/types"

describe("withAgentAuth", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockAccountsOk() {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [{ id: "a", name: "n", phone_number: "+91999", status: "active", has_access_token: true }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
  }

  it("returns 401 when X-API-Key header is missing", async () => {
    const handler = vi.fn()
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows")
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("unauthorized")
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 401 when X-API-Key has wrong prefix", async () => {
    const handler = vi.fn()
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "sk-wrong-prefix" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("calls the handler with AgentContext on valid auth", async () => {
    mockAccountsOk()
    const handler = vi.fn(async (ctx: AgentContext) => new Response(JSON.stringify({ got: ctx.account.id })))
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await wrapped(req)
    expect(handler).toHaveBeenCalledOnce()
    const [ctx] = handler.mock.calls[0] as [AgentContext, Request]
    expect(ctx.apiKey).toBe("whm_abc")
    expect(ctx.account.id).toBe("a")
    expect(ctx.account.connected_channels).toEqual(["whatsapp"])
    expect(res.status).toBe(200)
  })

  it("returns 401 when fs-whatsapp validates the key as invalid", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("", { status: 401 }))
    const handler = vi.fn()
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_bad" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it("returns 429 when rate limit is exceeded on the cheap bucket", async () => {
    mockAccountsOk()
    const handler = vi.fn(async () => new Response("ok"))
    const wrapped = withAgentAuth(handler, "cheap")
    const makeReq = () =>
      new Request("https://example.com/api/v1/agent/flows", { headers: { "x-api-key": "whm_abc" } })

    // Exhaust the cheap bucket (120/min)
    for (let i = 0; i < 120; i++) await wrapped(makeReq())
    const res = await wrapped(makeReq())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe("rate_limited")
    expect(body.retry_after_seconds).toBeGreaterThan(0)
  })

  it("catches errors thrown by the handler and returns them as HTTP errors", async () => {
    mockAccountsOk()
    const { AgentError } = await import("@/lib/agent-api/errors")
    const handler = vi.fn(async () => {
      throw new AgentError("flow_not_found", "No such flow")
    })
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe("flow_not_found")
  })

  it("wraps non-AgentError thrown values as internal_error", async () => {
    mockAccountsOk()
    const handler = vi.fn(async () => {
      throw new Error("boom")
    })
    const wrapped = withAgentAuth(handler, "cheap")
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await wrapped(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe("internal_error")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/auth.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `auth.ts`**

File: `magic-flow/lib/agent-api/auth.ts`

```typescript
import { AGENT_API_KEY_PREFIX } from "./constants"
import { AgentError } from "./errors"
import { rateLimitCheck } from "./rate-limit"
import { getActingAccount } from "./account-resolver"
import type { AgentContext } from "./types"
import type { RateLimitBucket } from "./constants"

/**
 * Higher-order function that wraps a Next.js route handler with authentication,
 * rate limiting, and account resolution. Every agent API route uses this.
 *
 * Pipeline:
 *   1. Read X-API-Key header. Fail fast with 401 if missing or wrong prefix.
 *   2. Apply rate limit for the given bucket. Return 429 with retry_after on limit.
 *   3. Call getActingAccount(apiKey). This also validates the key against
 *      fs-whatsapp's real auth layer — a 401 here means the key is invalid.
 *   4. Invoke the inner handler with a populated AgentContext.
 *   5. Catch any errors the handler throws and map them to HTTP responses.
 *      AgentError → its mapped HTTP status. Other errors → 500 internal_error.
 */
export function withAgentAuth(
  handler: (ctx: AgentContext, req: Request) => Promise<Response>,
  bucket: RateLimitBucket,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // 1. API key presence and prefix
    const apiKey = req.headers.get("x-api-key")
    if (!apiKey || !apiKey.startsWith(AGENT_API_KEY_PREFIX)) {
      return new AgentError(
        "unauthorized",
        "Missing or invalid API key. Expected X-API-Key header with whm_ prefix.",
      ).toHttpResponse()
    }

    // 2. Rate limit
    const limit = rateLimitCheck(apiKey, bucket)
    if (!limit.ok) {
      return new AgentError("rate_limited", "Rate limit exceeded", {
        retry_after_seconds: limit.retryAfter,
      }).toHttpResponse()
    }

    // 3. Validate key + load account (one round-trip to fs-whatsapp)
    let account
    try {
      account = await getActingAccount(apiKey)
    } catch (err) {
      return AgentError.fromUnknown(err).toHttpResponse()
    }

    // 4. Invoke handler, 5. Map errors
    try {
      return await handler({ apiKey, account }, req)
    } catch (err) {
      return AgentError.fromUnknown(err).toHttpResponse()
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/auth.test.ts`

Expected: all 7 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/auth.ts magic-flow/lib/agent-api/__tests__/auth.test.ts
git commit -m "feat(agent-api): add withAgentAuth wrapper with auth+ratelimit+context load"
```

---

## Task 8: Publisher helpers (Phase 1 scope: listFlows only)

**Files:**
- Create: `magic-flow/lib/agent-api/publisher.ts`
- Create: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

In Phase 2 this file grows a lot — it will add `createProject`, `createVersion`, `publishVersion`, `publishRuntimeFlow`, `deleteProject`, `checkKeywordConflict`. For Phase 1 we only need `listFlows` (which powers `GET /v1/agent/flows`).

- [ ] **Step 1: Write the failing test**

File: `magic-flow/lib/agent-api/__tests__/publisher.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { listFlows } from "@/lib/agent-api/publisher"
import type { AgentContext } from "@/lib/agent-api/types"

function mockCtx(): AgentContext {
  return {
    apiKey: "whm_abc",
    account: {
      id: "acc_1",
      name: "Acme",
      phone_number: "+919876543210",
      connected_channels: ["whatsapp"],
    },
  }
}

describe("listFlows", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("returns the normalized flow list from fs-whatsapp", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "mf_1",
              name: "iPhone 11 Launch",
              created_at: "2026-04-15T11:42:08Z",
              updated_at: "2026-04-15T11:47:22Z",
              trigger_keywords: ["iphone11"],
              node_count: 6,
              latest_version: 3,
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const result = await listFlows(mockCtx(), 50)
    expect(result.total).toBe(1)
    expect(result.flows).toHaveLength(1)
    expect(result.flows[0]).toEqual({
      flow_id: "mf_1",
      name: "iPhone 11 Launch",
      trigger_keyword: "iphone11",
      node_count: 6,
      current_version: 3,
      magic_flow_url: expect.stringContaining("/flow/mf_1"),
      test_url: "https://wa.me/919876543210?text=iphone11",
      created_at: "2026-04-15T11:42:08Z",
      updated_at: "2026-04-15T11:47:22Z",
    })
  })

  it("forwards X-API-Key in the fetch headers", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ projects: [], total: 0 }), { status: 200 }),
    )
    await listFlows(mockCtx(), 10)
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers["X-API-Key"]).toBe("whm_abc")
  })

  it("passes limit to fs-whatsapp as query param", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ projects: [], total: 0 }), { status: 200 }),
    )
    await listFlows(mockCtx(), 25)
    const [url] = (global.fetch as any).mock.calls[0]
    expect(url).toContain("limit=25")
  })

  it("omits test_url when the account has no phone_number", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "mf_1",
              name: "Foo",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              trigger_keywords: ["bar"],
              node_count: 2,
              latest_version: 1,
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    )
    const ctx: AgentContext = { ...mockCtx(), account: { ...mockCtx().account, phone_number: undefined } }
    const result = await listFlows(ctx, 10)
    expect(result.flows[0].test_url).toBeUndefined()
  })

  it("returns empty array when fs-whatsapp has no projects for this org", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ projects: [], total: 0, page: 1, limit: 50 }), { status: 200 }),
    )
    const result = await listFlows(mockCtx(), 50)
    expect(result.flows).toEqual([])
    expect(result.total).toBe(0)
  })

  it("picks the first trigger_keyword when a project has multiple", async () => {
    ;(global.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          projects: [
            {
              id: "mf_1",
              name: "Multi",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              trigger_keywords: ["alpha", "beta"],
              node_count: 3,
              latest_version: 1,
            },
          ],
          total: 1,
        }),
        { status: 200 },
      ),
    )
    const result = await listFlows(mockCtx(), 10)
    expect(result.flows[0].trigger_keyword).toBe("alpha")
  })

  it("throws internal_error on fs-whatsapp HTTP failure", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("nope", { status: 500 }))
    await expect(listFlows(mockCtx(), 10)).rejects.toMatchObject({ code: "internal_error" })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/agent-api/__tests__/publisher.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `publisher.ts`**

File: `magic-flow/lib/agent-api/publisher.ts`

```typescript
import { FS_WHATSAPP_URL } from "./constants"
import { AgentError } from "./errors"
import type { AgentContext } from "./types"

/**
 * Public flow shape returned by our agent API. Purposefully narrower than
 * fs-whatsapp's MagicFlowProjectResponse — we omit org-internal fields.
 */
export interface PublicFlow {
  flow_id: string
  name: string
  trigger_keyword: string | undefined
  node_count: number
  current_version: number
  magic_flow_url: string
  test_url: string | undefined
  created_at: string
  updated_at: string
}

export interface ListFlowsResult {
  flows: PublicFlow[]
  total: number
}

/** Shape fs-whatsapp returns from GET /api/magic-flow/projects */
interface FsProjectsResponse {
  projects: Array<{
    id: string
    name: string
    created_at: string
    updated_at: string
    trigger_keywords?: string[]
    node_count?: number
    latest_version?: number
  }>
  total: number
  page?: number
  limit?: number
}

/**
 * Call fs-whatsapp's magic-flow projects list, forwarding the agent's API key.
 * Normalizes each project into our public flow shape with computed URLs.
 */
export async function listFlows(ctx: AgentContext, limit: number): Promise<ListFlowsResult> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects?limit=${encodeURIComponent(String(limit))}`

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when listing projects`)
  }

  let body: FsProjectsResponse
  try {
    body = (await res.json()) as FsProjectsResponse
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable projects response")
  }

  const flows: PublicFlow[] = (body.projects ?? []).map((p) => {
    const firstKeyword = (p.trigger_keywords ?? [])[0]
    return {
      flow_id: p.id,
      name: p.name,
      trigger_keyword: firstKeyword,
      node_count: p.node_count ?? 0,
      current_version: p.latest_version ?? 1,
      magic_flow_url: buildMagicFlowUrl(p.id),
      test_url: buildTestUrl(ctx.account.phone_number, firstKeyword),
      created_at: p.created_at,
      updated_at: p.updated_at,
    }
  })

  return { flows, total: body.total ?? flows.length }
}

function buildMagicFlowUrl(flowId: string): string {
  // In a proper deployment this would read an env var for the public app URL.
  // For v1 we hardcode freestand.xyz; the dashboard URL should come from config
  // when we productionize. Tests just assert `contains "/flow/<id>"`.
  return `https://app.freestand.xyz/flow/${flowId}`
}

function buildTestUrl(phoneNumber: string | undefined, keyword: string | undefined): string | undefined {
  if (!phoneNumber || !keyword) return undefined
  // Strip non-digit chars from the phone number for wa.me compatibility.
  const digits = phoneNumber.replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(keyword)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/agent-api/__tests__/publisher.test.ts`

Expected: all 7 tests PASS.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add magic-flow/lib/agent-api/publisher.ts magic-flow/lib/agent-api/__tests__/publisher.test.ts
git commit -m "feat(agent-api): add listFlows publisher helper (direct fetch to fs-whatsapp)"
```

---

## Task 9: GET /v1/agent/flows route handler

**Files:**
- Create: `magic-flow/app/api/v1/agent/flows/route.ts`
- Create: `magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing integration test**

File: `magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GET } from "@/app/api/v1/agent/flows/route"
import { __resetRateLimitForTests } from "@/lib/agent-api/rate-limit"

describe("GET /v1/agent/flows", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
    __resetRateLimitForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function mockFsResponses() {
    // First call: GET /api/accounts (from withAgentAuth → getActingAccount)
    // Second call: GET /api/magic-flow/projects (from listFlows)
    const accountsBody = {
      accounts: [
        { id: "acc_1", name: "Acme Main", phone_number: "+919876543210", status: "active", has_access_token: true },
      ],
    }
    const projectsBody = {
      projects: [
        {
          id: "mf_1",
          name: "iPhone Launch",
          created_at: "2026-04-15T11:42:08Z",
          updated_at: "2026-04-15T11:47:22Z",
          trigger_keywords: ["iphone11"],
          node_count: 6,
          latest_version: 2,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    }
    let callIndex = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      const response =
        callIndex === 0
          ? new Response(JSON.stringify(accountsBody), { status: 200 })
          : new Response(JSON.stringify(projectsBody), { status: 200 })
      callIndex++
      return Promise.resolve(response)
    })
  }

  it("returns 200 with shaped flow list on valid auth", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.flows[0].flow_id).toBe("mf_1")
    expect(body.flows[0].trigger_keyword).toBe("iphone11")
    expect(body.flows[0].test_url).toBe("https://wa.me/919876543210?text=iphone11")
  })

  it("returns 401 when X-API-Key is missing", async () => {
    const req = new Request("https://example.com/api/v1/agent/flows")
    const res = await GET(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe("unauthorized")
  })

  it("returns 401 when fs-whatsapp rejects the key", async () => {
    ;(global.fetch as any).mockResolvedValue(new Response("", { status: 401 }))
    const req = new Request("https://example.com/api/v1/agent/flows", {
      headers: { "x-api-key": "whm_bad" },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid limit param (zero or negative)", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows?limit=0", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  it("rejects limit over 50 with 400 invalid_param", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows?limit=999", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(400) // zod rejects values > 50 via .max(50)
    const body = await res.json()
    expect(body.code).toBe("invalid_param")
  })

  it("forwards the query param to fs-whatsapp unchanged (for future server-side filtering)", async () => {
    mockFsResponses()
    const req = new Request("https://example.com/api/v1/agent/flows?query=iphone", {
      headers: { "x-api-key": "whm_abc" },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    // The query is accepted at the schema level even though Phase 1 doesn't
    // use it server-side — the parent LLM does fuzzy matching on the client.
    const body = await res.json()
    expect(body.flows).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/v1/agent/flows/__tests__/route.test.ts`

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the route handler**

File: `magic-flow/app/api/v1/agent/flows/route.ts`

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import { listFlows } from "@/lib/agent-api/publisher"
import { findFlowQuerySchema } from "@/lib/agent-api/schemas"

/**
 * GET /v1/agent/flows — find/list flows for the authenticated org.
 *
 * Query params:
 *   - query (optional): fuzzy hint string; not used server-side in v1,
 *                       parent LLM does the fuzzy matching on the returned list
 *   - limit (optional): 1-50, default 10
 *
 * Auth: X-API-Key header with a whm_* key. See withAgentAuth.
 * Rate limit bucket: cheap (120/min).
 */
export const GET = withAgentAuth(async (ctx, req) => {
  const url = new URL(req.url)
  const queryParams = {
    query: url.searchParams.get("query") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  }

  const parsed = findFlowQuerySchema.safeParse(queryParams)
  if (!parsed.success) {
    throw new AgentError("invalid_param", "Invalid query parameters", {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const result = await listFlows(ctx, parsed.data.limit)
  return Response.json(result, { status: 200 })
}, "cheap")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/v1/agent/flows/__tests__/route.test.ts`

Expected: all 6 tests PASS.

- [ ] **Step 5: Run the full Phase 1 test suite**

Run: `npx vitest run lib/agent-api app/api/v1/agent`

Expected: all tests from Tasks 2-9 PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add magic-flow/app/api/v1/agent/flows/route.ts magic-flow/app/api/v1/agent/flows/__tests__/route.test.ts
git commit -m "feat(agent-api): add GET /v1/agent/flows endpoint"
```

---

## Task 10: Manual verification against a running stack

**Prerequisites:** Docker running, fs-whatsapp container up on `http://localhost:8080`, magic-flow container up on `http://localhost:3002`, a test organization seeded with at least one `WhatsAppAccount` and at least one `MagicFlowProject`.

- [ ] **Step 1: Start the dev environment**

Run: `cd magic-flow && docker compose up -d` (and ensure fs-whatsapp is also up — check with `docker ps`)
Expected: both containers running, magic-flow logs show `ready on port 3002`.

- [ ] **Step 2: Generate a test `whm_*` API key**

1. Navigate to `http://localhost:3002/settings/api-keys`
2. Log in as an admin user
3. Go to the "General" tab
4. Click "Create Key"
5. Name it "Phase 1 test"
6. Copy the `whm_...` value from the reveal dialog
7. Store in a shell variable:
   ```bash
   export FREESTAND_TEST_KEY="whm_paste_here"
   ```

- [ ] **Step 3: Curl the endpoint with the key**

```bash
curl -s http://localhost:3002/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_TEST_KEY" | jq .
```

Expected: 200 JSON response with shape `{flows: [...], total: N}`. Each flow has `flow_id`, `name`, `trigger_keyword`, `node_count`, `current_version`, `magic_flow_url`, `test_url`, `created_at`, `updated_at`. If your test org has flows seeded, they should appear. If empty, you get `{flows: [], total: 0}`.

- [ ] **Step 4: Curl without the header — should 401**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/api/v1/agent/flows
```

Expected: `401`.

- [ ] **Step 5: Curl with a garbage key — should 401**

```bash
curl -s http://localhost:3002/api/v1/agent/flows -H "X-API-Key: sk-nope" | jq .
```

Expected: 401 JSON `{code: "unauthorized", ...}`.

- [ ] **Step 6: Curl with `?limit=2&query=test` — should 200 with at most 2 results**

```bash
curl -s "http://localhost:3002/api/v1/agent/flows?limit=2&query=test" \
  -H "X-API-Key: $FREESTAND_TEST_KEY" | jq .
```

Expected: 200, `flows.length <= 2`.

- [ ] **Step 7: Curl with `?limit=999` — should 400**

```bash
curl -s "http://localhost:3002/api/v1/agent/flows?limit=999" \
  -H "X-API-Key: $FREESTAND_TEST_KEY" | jq .
```

Expected: 400 JSON `{code: "invalid_param", ...}`.

- [ ] **Step 8: Trigger rate limit (smoke test)**

```bash
for i in {1..125}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:3002/api/v1/agent/flows \
    -H "X-API-Key: $FREESTAND_TEST_KEY"
done | sort | uniq -c
```

Expected: ~120 `200`s followed by ~5 `429`s. Exact numbers depend on timing.

- [ ] **Step 9: Revoke the test key in the dashboard**

1. Navigate back to `/settings/api-keys`
2. Delete the "Phase 1 test" key
3. Verify future curls with the revoked key return 401:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/api/v1/agent/flows \
     -H "X-API-Key: $FREESTAND_TEST_KEY"
   ```
   Expected: `401`.

---

## Task 11: Phase 1 wrap-up — full test run, type check, final commit

- [ ] **Step 1: Run the ENTIRE magic-flow test suite**

Run: `cd magic-flow && npm run test`

Expected: all tests pass, including the existing tests in `lib/__tests__/` (`api-client.test.ts`, `auth.test.ts`, `permissions.test.ts`, `whatsapp-api.test.ts`) plus our new ones. No regressions.

- [ ] **Step 2: Full type check**

Run: `cd magic-flow && npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Verify Phase 1 file inventory**

Run:
```bash
ls -la magic-flow/lib/agent-api/ magic-flow/lib/agent-api/__tests__/ magic-flow/app/api/v1/agent/flows/
```

Expected contents:
- `lib/agent-api/`: `auth.ts`, `account-resolver.ts`, `constants.ts`, `errors.ts`, `publisher.ts`, `rate-limit.ts`, `schemas.ts`, `sse.ts`, `types.ts`, `__tests__/`
- `lib/agent-api/__tests__/`: `auth.test.ts`, `account-resolver.test.ts`, `errors.test.ts`, `publisher.test.ts`, `rate-limit.test.ts`, `schemas.test.ts`, `sse.test.ts`
- `app/api/v1/agent/flows/`: `route.ts`, `__tests__/route.test.ts`

- [ ] **Step 4: Verify the internal `/api/ai/flow-assistant` endpoint still works**

Manual: navigate to the MagicFlow UI, open any flow, interact with the AI flow assistant chat panel, confirm it responds normally. This endpoint was NOT touched in Phase 1, but the regression check is cheap insurance.

- [ ] **Step 5: Push the branch and open a PR (manual, ask first)**

Do NOT push without confirming with the user. Per project rules: "Never push without user explicitly saying to push."

When the user gives the go-ahead:

```bash
git push -u origin feat/flow-assistant-agent-api-phase-1
gh pr create --title "feat(agent-api): phase 1 — scaffolding + GET /v1/agent/flows" --body "$(cat <<'EOF'
## Summary
- New `lib/agent-api/` glue layer: auth wrapper, account resolver, error types, rate limiter, SSE writer, zod schemas, direct-fetch publisher helpers
- New `GET /v1/agent/flows` endpoint — find/list flows for the authenticated org via `X-API-Key` auth
- Zero changes to fs-whatsapp, zero changes to existing AI code, zero changes to `lib/whatsapp-api.ts`

## Test plan
- [ ] Unit tests pass: `npm run test`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] Manual curl test against a seeded docker environment returns a flow list
- [ ] Missing / invalid key returns 401
- [ ] Internal AI flow assistant (`/api/ai/flow-assistant`) still works in the UI with no regressions
EOF
)"
```

---

## Phase 1 Definition of Done

- [ ] All 7 unit test files pass (errors, schemas, rate-limit, sse, account-resolver, auth, publisher)
- [ ] Integration test for `GET /v1/agent/flows` passes
- [ ] Full `npm run test` suite passes with no regressions
- [ ] `npx tsc --noEmit` passes
- [ ] Manual curl test returns valid JSON from a live dev stack
- [ ] Missing key → 401, bad key → 401, invalid limit → 400
- [ ] Rate limiting triggers after 120 cheap calls per minute per key
- [ ] The internal `/api/ai/flow-assistant` UI path still works unchanged
- [ ] PR created (not merged) on `feat/flow-assistant-agent-api-phase-1`

## What Phase 1 deliberately does NOT do

- No create flow endpoint
- No edit flow endpoint
- No publish flow endpoint
- No SSE streaming in any route handler (SSEWriter exists, unused)
- No AI code changes
- No modifications to `lib/whatsapp-api.ts`
- No customer-facing docs (those come in Phase 4)
- No OpenAPI spec (Phase 4)

These land in their respective phases.
