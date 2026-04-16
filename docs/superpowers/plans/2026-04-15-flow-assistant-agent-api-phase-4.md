# Flow Assistant Agent API — Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Plan granularity note:** Task-level plan with files, acceptance criteria, and test requirements. Expand to step-level TDD form with `superpowers:writing-plans` before starting this phase.

**Goal:** Make the Phase 1-3 REST+SSE API self-serve for customer integrations. No SDK, no NPM package. Ship the OpenAPI spec endpoint, publish the integration guide as production docs, and verify a fresh external developer can integrate end-to-end against Freestand from nothing but the docs.

**Architecture:** One new Next.js route (`GET /api/v1/agent/openapi.json`) that serves an auto-generated OpenAPI 3.1 spec built from the zod schemas in `lib/agent-api/schemas.ts` plus manually-declared response shapes and route metadata. A new `lib/agent-api/openapi.ts` module owns the generation logic. The integration guide written during brainstorming (`docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md`) moves to the customer-facing docs site at its final URL.

**Tech Stack:** Same as prior phases. New dependency: a zod-to-OpenAPI adapter. Options include `zod-to-openapi` (`@asteasolutions/zod-to-openapi`) or writing it by hand. If writing by hand, we declare a small OpenAPI builder and pull the request/response shapes from the existing zod schemas and TypeScript types. Pick the option during implementation — both are viable, the library adds a dependency, the hand-rolled version is ~150 LOC.

**Reference spec:** `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-design.md` (especially Phase 4 deliverables in the Phasing section) and the integration guide `2026-04-15-flow-assistant-agent-api-integration.md` which is already drafted and just needs productionization.

**Pre-reading for the implementer:**
- `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md` — the drafted customer guide. Read it end-to-end; your job in Phase 4 is to ship it as customer-facing docs and verify every code snippet still compiles/runs against the shipped API.
- The OpenAPI 3.1 spec: https://spec.openapis.org/oas/v3.1.0 (skim the object model for `paths`, `components.schemas`, `responses`, `parameters`)
- Example OpenAPI docs from Anthropic or OpenAI to see how production AI APIs document streaming endpoints
- Whatever docs site magic-flow ships today — ask the user or look at `magic-flow/docs/` for the customer docs framework if any exists. If none exists, Phase 4 ships the integration guide as a markdown file in the repo and links to it from the dashboard's API Keys settings page.

---

## File Structure

### New files

```
magic-flow/
├── lib/agent-api/
│   ├── openapi.ts                    # zod schemas + response types → OpenAPI 3.1 JSON
│   └── __tests__/
│       └── openapi.test.ts
├── app/api/v1/agent/openapi.json/
│   └── route.ts                      # GET handler that returns the OpenAPI document
├── docs/agent-api/                   # customer-facing docs at a new top-level location
│   ├── README.md                     # The productionized integration guide (copied/refined from docs/superpowers/specs/...-integration.md)
│   ├── quickstart.md                 # Split out of the guide — Vercel AI SDK 5-minute start
│   ├── reference.md                  # Split out — full tool reference
│   ├── errors.md                     # Split out — error code reference
│   ├── examples/
│   │   ├── vercel-ai-sdk.ts          # Runnable TS example
│   │   ├── openai-typescript.ts      # Runnable TS example
│   │   ├── anthropic-typescript.ts   # Runnable TS example
│   │   └── python-httpx.py           # Runnable Python example
│   └── system-prompt-fragment.md     # The pastable system prompt block as its own file
```

### Modified files

```
magic-flow/
├── app/(dashboard)/settings/api-keys/page.tsx    # Add a "View API docs" link/button in the General tab
```

### File responsibilities

**`openapi.ts`**: exports `buildOpenApiSpec()` → `object`. Returns a fully-formed OpenAPI 3.1 document describing the 4 agent API endpoints. Request bodies come from the existing zod schemas (`findFlowQuerySchema`, `createFlowBodySchema`, `editFlowBodySchema`, `publishFlowBodySchema`). Response bodies are declared inline (they're not Zod schemas — we serialize them directly). SSE endpoints are documented with `content-type: text/event-stream` and a description explaining the event shapes. All error codes are documented as 4xx/5xx responses. `components.securitySchemes` declares the `X-API-Key` header scheme.

**`openapi.json/route.ts`**: `GET` handler that returns `buildOpenApiSpec()` as JSON with `content-type: application/json`. Unauthenticated — the OpenAPI spec itself is public. Cacheable with a long `cache-control` header (the spec changes only on deploy).

**`docs/agent-api/README.md`**: the production version of the integration guide. Mostly copy-paste from `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md`, with: (a) broken links fixed, (b) API endpoint URLs pointing at the real production host, (c) example `whm_*` keys replaced with env var placeholders, (d) any "TODO" or "v1 only" flags validated or removed.

**`docs/agent-api/examples/*.ts`** and `*.py`: standalone runnable example files. An external developer should be able to clone them, `npm install` or `pip install` the stated dependencies, set the env var, and run them against a real Freestand org. Each example is one happy-path demonstration: call `freestand_create_flow`, get the test URL, print it.

**`app/(dashboard)/settings/api-keys/page.tsx` modification**: add a small link next to the "Create Key" button that says "View API docs →" and links to `/docs/agent-api` (or wherever the docs end up). One-liner change.

---

## Task 1: Build `lib/agent-api/openapi.ts`

**Files:**
- Create: `magic-flow/lib/agent-api/openapi.ts`
- Create: `magic-flow/lib/agent-api/__tests__/openapi.test.ts`

**Acceptance criteria:**
- `buildOpenApiSpec()` returns an object conforming to the OpenAPI 3.1 schema
- Document contains:
  - `openapi: "3.1.0"`
  - `info` block with title, version, description, contact
  - `servers` block with the production URL
  - `paths` for all 4 endpoints: `GET /v1/agent/flows`, `POST /v1/agent/flows`, `POST /v1/agent/flows/{flow_id}/edit`, `POST /v1/agent/flows/{flow_id}/publish`
  - Each path has its method block with `parameters`, `requestBody` (where applicable), `responses` (200, 400, 401, 404, 409, 429, 500, 502 where applicable)
  - `components.schemas` has schemas for: `FindFlowResponse`, `CreateFlowRequest`, `CreateFlowResult`, `EditFlowRequest`, `EditFlowResult`, `PublishFlowResult`, `AgentError`, `PublicFlow`
  - `components.securitySchemes` declares `ApiKeyAuth` with `type: apiKey`, `in: header`, `name: X-API-Key`
  - `security: [{ApiKeyAuth: []}]` applied globally
  - SSE endpoints' success response content type is `text/event-stream` with a description explaining event types

**Test requirements:**
- Unit test: call `buildOpenApiSpec()`, assert the returned object has `openapi === "3.1.0"`
- Assert it has exactly 4 paths
- Assert each path has the expected methods
- Assert `components.securitySchemes.ApiKeyAuth` exists and is correct shape
- Validation test: pass the output to an OpenAPI validator (either a library like `@readme/openapi-parser` or a hand-rolled check for required top-level fields). If no library available, just do structural assertions.
- Round-trip test: generate client code from the output using `openapi-typescript` in a subprocess (shell out from a test) and assert it produces a valid TypeScript file. This is optional — if it's too much infra for a test, defer to Task 6 manual verification.

**Decision point during implementation:** Use the `@asteasolutions/zod-to-openapi` library or hand-roll. Check if the magic-flow package.json has any OpenAPI dependency already. If not, hand-rolling is probably cleaner — our schema set is small (4 endpoints).

---

## Task 2: Build the `/api/v1/agent/openapi.json` route

**Files:**
- Create: `magic-flow/app/api/v1/agent/openapi.json/route.ts`
- Create: `magic-flow/app/api/v1/agent/openapi.json/__tests__/route.test.ts`

**Acceptance criteria:**
- `GET` handler (not wrapped in `withAgentAuth` — the spec is public)
- Returns `buildOpenApiSpec()` as JSON
- `content-type: application/json`
- `cache-control: public, max-age=3600, s-maxage=86400` (1 hour browser cache, 24 hours CDN cache)
- Does NOT require `X-API-Key` (public endpoint)
- Test: GET request returns 200 with the full spec

---

## Task 3: Move and refine the integration guide as customer docs

**Files:**
- Create: `magic-flow/docs/agent-api/README.md`
- Create: `magic-flow/docs/agent-api/quickstart.md`
- Create: `magic-flow/docs/agent-api/reference.md`
- Create: `magic-flow/docs/agent-api/errors.md`
- Create: `magic-flow/docs/agent-api/system-prompt-fragment.md`

**Acceptance criteria:**
- `README.md` has a short intro (~100 words) and links to the three sub-pages
- `quickstart.md` contains the "Quickstart — Vercel AI SDK" section from the brainstorm integration guide, with all code snippets copy-paste-runnable
- `reference.md` contains "The four tools" + "Integration examples" (for OpenAI TS, Anthropic TS, Python, raw curl) + "End-user UX patterns"
- `errors.md` contains the error code reference table
- `system-prompt-fragment.md` contains the paste-able system prompt block
- All links work (relative paths)
- All code examples compile/run — verified in Task 5

**Implementation note:** This is primarily a file-splitting exercise. The source content is `docs/superpowers/specs/2026-04-15-flow-assistant-agent-api-integration.md`. Split it into sub-pages, fix internal links to point to the new file structure, keep the content substance intact.

---

## Task 4: Write runnable example files

**Files:**
- Create: `magic-flow/docs/agent-api/examples/vercel-ai-sdk.ts`
- Create: `magic-flow/docs/agent-api/examples/openai-typescript.ts`
- Create: `magic-flow/docs/agent-api/examples/anthropic-typescript.ts`
- Create: `magic-flow/docs/agent-api/examples/python-httpx.py`

**Acceptance criteria:**
- Each file is a complete runnable example
- Top comments explain: prerequisites, how to set `FREESTAND_API_KEY`, how to run
- The TypeScript examples are `tsx`-runnable standalone files (not expecting a build step)
- The Python example uses stdlib-only where possible + `httpx` as the one external dep (install note in the comment header)
- Each example calls `create_flow` once, prints the `test_url` from the result
- Each example includes error handling for the common error cases: `keyword_conflict`, `channel_not_connected`, `invalid_instruction`
- Each example is no more than ~100 lines — they're demonstrations, not full agents

**Validation:**
- Run each example against a real dev stack in Task 6

---

## Task 5: Add the "API docs" link in the dashboard settings page

**Files:**
- Modify: `magic-flow/app/(dashboard)/settings/api-keys/page.tsx`

**Acceptance criteria:**
- In the "General" tab, next to or below the "Create Key" button, add a link labeled "View API docs →"
- Link target: `/docs/agent-api` (or wherever the docs ship) or the canonical external docs URL
- Styling matches the existing buttons — use the shadcn `Button` with `variant="outline"` or a plain anchor styled to match
- No behavioral change to the existing Create Key / Delete Key / Reveal Key flows
- Test: existing tests for the page still pass (run `npm run test`)
- Visual check: render the page in the browser, confirm the link appears and is clickable

**Implementation note:** This is the only Phase 4 change that touches existing UI code. Keep it minimal — one link in the right place.

---

## Task 6: Verify every code example runs against a real dev stack

**Prerequisites:** Phases 1-3 already merged or at least running locally. Docker dev env up. A `whm_*` key available. ANTHROPIC_API_KEY set.

**Acceptance criteria:**
- Run `docs/agent-api/examples/vercel-ai-sdk.ts` end-to-end. Observe a flow get created, test URL printed. Open the URL on mobile, trigger the flow.
- Run `docs/agent-api/examples/openai-typescript.ts` end-to-end. Same result.
- Run `docs/agent-api/examples/anthropic-typescript.ts` end-to-end. Same result.
- Run `docs/agent-api/examples/python-httpx.py` end-to-end. Same result.
- Fetch the OpenAPI spec: `curl http://localhost:3002/api/v1/agent/openapi.json | jq .openapi` → returns `"3.1.0"`
- Run a codegen tool against the spec: `npx openapi-typescript http://localhost:3002/api/v1/agent/openapi.json -o /tmp/agent-api-types.d.ts` → produces a valid TypeScript file with types for all 4 endpoints
- Open the docs pages in a browser (if hosted) or as markdown (if file-only) and click through every internal link — no 404s

**Test commands:**

```bash
# Set up
export FREESTAND_API_KEY="whm_..."
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# Run each example
cd magic-flow/docs/agent-api/examples
npx tsx vercel-ai-sdk.ts
npx tsx openai-typescript.ts
npx tsx anthropic-typescript.ts

# Python (install httpx first)
pip install httpx openai
python python-httpx.py

# OpenAPI spec
curl -s http://localhost:3002/api/v1/agent/openapi.json | jq .openapi

# Codegen
npx openapi-typescript http://localhost:3002/api/v1/agent/openapi.json -o /tmp/agent-types.d.ts
head -50 /tmp/agent-types.d.ts
```

**What "passing" looks like:** Every example completes successfully. The generated TypeScript types include `CreateFlowRequest`, `PublicFlow`, and `AgentError`. The docs pages render cleanly. An external developer reading only `docs/agent-api/README.md` and following the quickstart could integrate the agent API in under 30 minutes without asking a Freestand engineer anything.

---

## Task 7: Phase 4 wrap-up

**Acceptance criteria:**
- All new files committed
- All tests pass: `npm run test`
- Type check passes: `npx tsc --noEmit`
- The dashboard settings page still works with the new docs link
- The OpenAPI spec endpoint returns a valid document
- All four code examples run end-to-end against a dev stack
- No regressions on Phase 1/2/3 routes
- No regressions on the internal `/api/ai/flow-assistant` UI path
- Branch: `feat/flow-assistant-agent-api-phase-4`
- PR created, not merged until user review

---

## Phase 4 Definition of Done

- [ ] `lib/agent-api/openapi.ts` exists and tested
- [ ] `GET /api/v1/agent/openapi.json` endpoint returns a valid OpenAPI 3.1 document
- [ ] Customer-facing docs exist at `magic-flow/docs/agent-api/` (or the project's docs site location)
- [ ] All four runnable examples exist and work end-to-end against a dev stack
- [ ] Dashboard settings page has a "View API docs" link in the General API Keys tab
- [ ] No regressions anywhere
- [ ] PR created, ready for review

## What Phase 4 deliberately does NOT do

- No NPM package (`@freestand/agent-tools`) — explicitly dropped during brainstorming
- No language-specific client libraries (customers generate clients from the OpenAPI spec in whichever language they use)
- No hosted documentation site (v1 ships docs as markdown in the repo, linked from the dashboard — upgrade to a proper docs site later)
- No analytics/metrics on customer usage of the agent API (telemetry is in the Open Questions section of the spec, deferred)
- No SDK-style helpers like "retry on rate limit" — customers write their own
- No versioned API deprecation policy (v1 is the only version; when v2 exists, we write a deprecation doc then)
