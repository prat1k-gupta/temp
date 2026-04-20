# Phase 2 — REST CRUD + `platform_url` Implementation Plan

> **For agentic workers:** Use TDD throughout. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship deterministic REST CRUD for flows / templates / campaigns / accounts at `/api/v1/*` in magic-flow (proxying to fs-whatsapp), with a uniform `platform_url` field on every resource response so external callers can deep-link to the Freestand UI. The legacy `magic_flow_url` field gets renamed to `platform_url` (double-emit during the transition).

**Architecture:**
- **Part A (fs-whatsapp, 1 PR):** add `[platform]` config section with a `base_url`, populate `PlatformURL` on existing campaign / template / flow response transformers.
- **Part B (magic-flow, 1 PR):** add a `write` rate-limit bucket, add Zod schemas for the new endpoints, build a thin `proxyToFsWhatsApp` helper, ship 21 new REST routes, double-emit `platform_url` alongside `magic_flow_url` on existing flow responses.

Part A must merge before Part B can be tested end-to-end.

**Tech Stack:** Go 1.21 + Koanf + GORM (fs-whatsapp), TypeScript + Next.js + Zod + Vitest (magic-flow).

**Spec reference:** `magic-flow/docs/superpowers/specs/2026-04-20-agent-api-decoupling.md` — Phase 2 + Conventions (`platform_url`).

---

## Scope check

Two repos, two PRs. Independent test surfaces. The shared contract is the `platform_url` field name on response bodies and the existence of new fs-whatsapp endpoints to proxy. No code-level coupling between the two PRs.

## Conventions (apply throughout both parts)

- `platform_url` is the canonical field name on every flow / template / campaign response.
- URL paths (suffix appended to `PlatformBaseURL`):
  - Flow: `/flow/{id}` (singular — matches existing magic-flow Next.js route)
  - Template: `/templates/{id}`
  - Campaign: `/campaigns/{id}`
- Error messages describe state, not API URLs or vendor codes (per `feedback_error_messages_no_internals.md`).
- Tests scoped to touched packages + a full build/typecheck (per `feedback_scoped_test_runs.md`).

---

# PART A — fs-whatsapp `platform_url` infrastructure

**Branch (create first):** `feat/agent-api-phase-2a-platform-url`
**Working directory:** `/Users/pratikgupta/Freestand/fs-whatsapp`

## File Structure (Part A)

- `internal/config/config.go` — modify: add `PlatformConfig` type + `Platform` field on `Config` + default in `setDefaults()`.
- `config.example.toml` — modify: add `[platform]` section with `base_url`.
- `test/testutil/app.go` — modify: populate `cfg.Platform.BaseURL` in `SetupTestApp`.
- `internal/handlers/campaigns.go` — modify: add `PlatformURL` to `CampaignResponse`, change `toCampaignResponse(c)` → `toCampaignResponse(c, baseURL)`, update all call sites (4: ListCampaigns, CreateCampaign, GetCampaign, UpdateCampaign).
- `internal/handlers/templates.go` — modify: add `PlatformURL` to `TemplateResponse`, change `templateToResponse(t)` → `templateToResponse(t, baseURL)`, update all call sites (6).
- `internal/handlers/magic_flow.go` — modify: add `PlatformURL` to `MagicFlowProjectResponse`, change `projectToResponse(p)` → `projectToResponse(p, baseURL)`, update all call sites (4).
- `internal/handlers/campaigns_platform_url_test.go` — new: 1 test asserting `PlatformURL` is set on a campaign response.
- `internal/handlers/templates_platform_url_test.go` — new: 1 test asserting `PlatformURL` is set on a template response.
- `internal/handlers/magic_flow_platform_url_test.go` — new: 1 test asserting `PlatformURL` is set on a project response.

Why three tiny test files instead of one: each lives next to the handler it tests, matching existing fs-whatsapp test conventions (`campaigns_test.go`, `templates_test.go`, etc.).

---

## Task A1: Branch + verify state

- [ ] **Step 1: Create branch from main**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && git checkout main && git pull && git checkout -b feat/agent-api-phase-2a-platform-url
```

- [ ] **Step 2: Confirm transformer signatures**

Read each of these and verify the signature matches the assumption:

- `internal/handlers/campaigns.go:1855` — `func toCampaignResponse(c models.BulkMessageCampaign) CampaignResponse`
- `internal/handlers/templates.go:573` — `func templateToResponse(t models.Template) TemplateResponse`
- `internal/handlers/magic_flow.go:87` — `func projectToResponse(p models.MagicFlowProject) MagicFlowProjectResponse`

If any differ materially (e.g., already takes a `baseURL`, or is a method on `*App`), STOP and update this plan.

---

## Task A2: Add `PlatformConfig`

- [ ] **Step 1: Add the type and field in config.go**

In `internal/config/config.go` after the `WhatsAppConfig` block, add:

```go
// PlatformConfig holds settings for the Freestand platform UI used in
// platform_url fields on API responses (so external callers can deep-link).
type PlatformConfig struct {
    BaseURL string `koanf:"base_url"`
}
```

In the `Config` struct (lines 13-25), add after `Instagram InstagramConfig`:

```go
Platform PlatformConfig `koanf:"platform"`
```

In `setDefaults()` (around line 141), add a fallback:

```go
if cfg.Platform.BaseURL == "" {
    cfg.Platform.BaseURL = "http://localhost:3002"
}
```

- [ ] **Step 2: Add to `config.example.toml`**

Below the `[instagram]` section, add:

```toml
[platform]
# Freestand UI base URL — used in platform_url fields so API consumers can deep-link
# to flows / templates / campaigns in the app.
base_url = "http://localhost:3002"
```

- [ ] **Step 3: Build check**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./...
```

Expected: clean.

---

## Task A3: Populate `Platform.BaseURL` in test fixture

- [ ] **Step 1: Update `test/testutil/app.go`**

Find where `cfg := &config.Config{}` is built in `SetupTestApp` (~line 25-64). Add after the assignments:

```go
cfg.Platform.BaseURL = "https://app.test.local"
```

This ensures every test that uses `SetupTestApp` gets a populated BaseURL, so existing tests that round-trip campaign/template responses don't see empty `platform_url` strings (or fail JSON-shape assertions later).

- [ ] **Step 2: Build check**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./...
```

Expected: clean.

---

## Task A4: Failing test for campaign `PlatformURL`

- [ ] **Step 1: Create `internal/handlers/campaigns_platform_url_test.go`**

```go
package handlers_test

import (
    "encoding/json"
    "testing"

    "github.com/freestandtech/fs-chat/internal/handlers"
    fixtures "github.com/freestandtech/fs-chat/test/fixtures/models"
    "github.com/freestandtech/fs-chat/test/testutil"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestCampaignResponse_IncludesPlatformURL(t *testing.T) {
    ta := testutil.SetupTestApp(t)
    org := fixtures.NewOrganization().Build()
    require.NoError(t, ta.DB.Create(&org).Error)
    user := fixtures.NewUser(org.ID).AsAdmin().Build()
    require.NoError(t, ta.DB.Create(&user).Error)
    acct := fixtures.NewWhatsAppAccount(org.ID).Build()
    require.NoError(t, ta.DB.Create(&acct).Error)
    tmpl := fixtures.NewTemplate(org.ID, acct.Name).WithStatus("APPROVED").Build()
    require.NoError(t, ta.DB.Create(&tmpl).Error)

    body := map[string]interface{}{
        "name":            "Test campaign",
        "account_name":    acct.Name,
        "template_id":     tmpl.ID.String(),
        "audience_source": "contacts",
        "audience_config": map[string]interface{}{
            "channel": "whatsapp",
            "filter":  map[string]interface{}{},
        },
    }

    req := testutil.NewJSONRequest(t, body)
    testutil.SetAuthContext(req, user.ID, org.ID, user.Email, "admin")

    require.NoError(t, ta.App.CreateCampaign(req))
    assert.Equal(t, 200, testutil.GetResponseStatusCode(req))

    var resp struct {
        Data handlers.CampaignResponse `json:"data"`
    }
    require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
    assert.NotEmpty(t, resp.Data.PlatformURL, "platform_url must be populated on campaign responses")
    assert.Contains(t, resp.Data.PlatformURL, "https://app.test.local/campaigns/")
    assert.Contains(t, resp.Data.PlatformURL, resp.Data.ID.String())
}
```

- [ ] **Step 2: Run, expect compile or runtime FAIL**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go test ./internal/handlers/ -run TestCampaignResponse_IncludesPlatformURL -v 2>&1 | tail -10
```

Expected: compile error (`PlatformURL` field doesn't exist yet on `CampaignResponse`).

---

## Task A5: Add `PlatformURL` to `CampaignResponse` + thread `baseURL`

- [ ] **Step 1: Add field to struct**

In `internal/handlers/campaigns.go` around line 50-94 (the `CampaignResponse` struct), add at the bottom:

```go
PlatformURL string `json:"platform_url"`
```

- [ ] **Step 2: Update transformer signature**

Change line 1855:

```go
func toCampaignResponse(c models.BulkMessageCampaign) CampaignResponse {
```

to:

```go
func toCampaignResponse(c models.BulkMessageCampaign, baseURL string) CampaignResponse {
```

Inside the function, after the `resp := CampaignResponse{...}` block, before any `if` blocks for nested template/flow names, add:

```go
if baseURL != "" {
    resp.PlatformURL = baseURL + "/campaigns/" + c.ID.String()
}
```

- [ ] **Step 3: Update every call site to pass `a.Config.Platform.BaseURL`**

Find all call sites:

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && grep -n "toCampaignResponse(" internal/handlers/campaigns.go
```

For each call site, replace `toCampaignResponse(x)` with `toCampaignResponse(x, a.Config.Platform.BaseURL)`. Expected ~4 call sites: ListCampaigns, CreateCampaign (multiple paths), GetCampaign, UpdateCampaign.

- [ ] **Step 4: Build + run the new test, expect PASS**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./... && go test ./internal/handlers/ -run TestCampaignResponse_IncludesPlatformURL -v
```

Expected: `--- PASS`.

---

## Task A6: Same treatment for templates

- [ ] **Step 1: Failing test — create `internal/handlers/templates_platform_url_test.go`**

```go
package handlers_test

import (
    "encoding/json"
    "testing"

    "github.com/freestandtech/fs-chat/internal/handlers"
    fixtures "github.com/freestandtech/fs-chat/test/fixtures/models"
    "github.com/freestandtech/fs-chat/test/testutil"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestTemplateResponse_IncludesPlatformURL(t *testing.T) {
    ta := testutil.SetupTestApp(t)
    org := fixtures.NewOrganization().Build()
    require.NoError(t, ta.DB.Create(&org).Error)
    user := fixtures.NewUser(org.ID).AsAdmin().Build()
    require.NoError(t, ta.DB.Create(&user).Error)
    acct := fixtures.NewWhatsAppAccount(org.ID).Build()
    require.NoError(t, ta.DB.Create(&acct).Error)
    tmpl := fixtures.NewTemplate(org.ID, acct.Name).WithStatus("APPROVED").Build()
    require.NoError(t, ta.DB.Create(&tmpl).Error)

    req := testutil.NewJSONRequest(t, nil)
    req.RequestCtx.SetUserValue("id", tmpl.ID.String())
    testutil.SetAuthContext(req, user.ID, org.ID, user.Email, "admin")

    require.NoError(t, ta.App.GetTemplate(req))
    assert.Equal(t, 200, testutil.GetResponseStatusCode(req))

    var resp struct {
        Data handlers.TemplateResponse `json:"data"`
    }
    require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
    assert.NotEmpty(t, resp.Data.PlatformURL)
    assert.Contains(t, resp.Data.PlatformURL, "https://app.test.local/templates/")
    assert.Contains(t, resp.Data.PlatformURL, resp.Data.ID.String())
}
```

Run, expect compile FAIL.

- [ ] **Step 2: Add `PlatformURL` field to `TemplateResponse`**

In `internal/handlers/templates.go` lines 36-54, add at the bottom of the struct:

```go
PlatformURL string `json:"platform_url"`
```

- [ ] **Step 3: Update `templateToResponse` signature**

Change line 573 signature to take `baseURL string`. Inside the function, before the `return`, add:

```go
resp := TemplateResponse{
    // ... existing assignments ...
}
if baseURL != "" {
    resp.PlatformURL = baseURL + "/templates/" + t.ID.String()
}
return resp
```

(Restructure the existing `return TemplateResponse{...}` to `resp := TemplateResponse{...}; ...; return resp` — you may need to add an explicit `return resp` at the end.)

- [ ] **Step 4: Update every call site (~6)**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && grep -n "templateToResponse(" internal/handlers/templates.go
```

Replace each call: `templateToResponse(x)` → `templateToResponse(x, a.Config.Platform.BaseURL)`.

- [ ] **Step 5: Build + run test, expect PASS**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./... && go test ./internal/handlers/ -run TestTemplateResponse_IncludesPlatformURL -v
```

Expected: PASS.

---

## Task A7: Same treatment for magic-flow projects

- [ ] **Step 1: Failing test — create `internal/handlers/magic_flow_platform_url_test.go`**

```go
package handlers_test

import (
    "encoding/json"
    "testing"

    "github.com/freestandtech/fs-chat/internal/handlers"
    "github.com/freestandtech/fs-chat/internal/models"
    fixtures "github.com/freestandtech/fs-chat/test/fixtures/models"
    "github.com/freestandtech/fs-chat/test/testutil"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestProjectResponse_IncludesPlatformURL(t *testing.T) {
    ta := testutil.SetupTestApp(t)
    org := fixtures.NewOrganization().Build()
    require.NoError(t, ta.DB.Create(&org).Error)
    user := fixtures.NewUser(org.ID).AsAdmin().Build()
    require.NoError(t, ta.DB.Create(&user).Error)

    project := &models.MagicFlowProject{
        OrganizationID: org.ID,
        CreatedBy:      user.ID,
        Name:           "Test project",
        Platform:       "whatsapp",
        Type:           "flow",
        FlowSlug:       "test-flow",
    }
    require.NoError(t, ta.DB.Create(project).Error)

    req := testutil.NewJSONRequest(t, nil)
    req.RequestCtx.SetUserValue("id", project.ID.String())
    testutil.SetAuthContext(req, user.ID, org.ID, user.Email, "admin")

    require.NoError(t, ta.App.GetMagicFlowProject(req))
    assert.Equal(t, 200, testutil.GetResponseStatusCode(req))

    var resp struct {
        Data handlers.MagicFlowProjectResponse `json:"data"`
    }
    require.NoError(t, json.Unmarshal(testutil.GetResponseBody(req), &resp))
    assert.NotEmpty(t, resp.Data.PlatformURL)
    assert.Contains(t, resp.Data.PlatformURL, "https://app.test.local/flow/")
    assert.Contains(t, resp.Data.PlatformURL, resp.Data.ID)
}
```

Run, expect FAIL.

- [ ] **Step 2: Add field + update transformer**

In `internal/handlers/magic_flow.go` lines 22-52 (`MagicFlowProjectResponse`), add at the bottom:

```go
PlatformURL string `json:"platform_url"`
```

In `projectToResponse` (line 87), update signature to take `baseURL string`. After the `resp := ...` block and before `return`:

```go
if baseURL != "" {
    resp.PlatformURL = baseURL + "/flow/" + p.ID.String()
}
```

- [ ] **Step 3: Update every call site (~4)**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && grep -n "projectToResponse(" internal/handlers/magic_flow.go
```

Replace each: `projectToResponse(x)` → `projectToResponse(x, a.Config.Platform.BaseURL)`.

- [ ] **Step 4: Build + run test**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./... && go test ./internal/handlers/ -run TestProjectResponse_IncludesPlatformURL -v
```

Expected: PASS.

---

## Task A8: Final scoped tests + commit

- [ ] **Step 1: Run scoped handler tests for the package**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go test ./internal/handlers/ -run "TestCampaignResponse_IncludesPlatformURL|TestTemplateResponse_IncludesPlatformURL|TestProjectResponse_IncludesPlatformURL" -v
```

Expected: 3 PASS.

(Integration tests requiring `TEST_DATABASE_URL` are run on CI. If `TEST_DATABASE_URL` isn't set locally, these 3 may skip — that's acceptable since the build check confirms the change compiles in all callers.)

- [ ] **Step 2: Build check across the whole repo**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./...
```

Expected: clean (no callers in worker, queue, or migration packages broken by the signature change).

- [ ] **Step 3: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && git status && git diff --stat
```

Confirm 8 files modified/new:
- `internal/config/config.go`
- `config.example.toml`
- `test/testutil/app.go`
- `internal/handlers/campaigns.go`
- `internal/handlers/templates.go`
- `internal/handlers/magic_flow.go`
- 3 new `_platform_url_test.go` files

Commit:

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && git add -A && git commit -m "$(cat <<'EOF'
feat(api): add platform_url to flow/template/campaign responses

Adds a new [platform] config section with base_url, then threads it through
the three response transformers (toCampaignResponse, templateToResponse,
projectToResponse) so every flow / template / campaign response carries a
platform_url field. External API callers can use this to deep-link to the
Freestand UI for live state, approval status, materialization progress, etc.

URL pattern: {base_url}/flow/{id}, /templates/{id}, /campaigns/{id} — matches
existing magic-flow Next.js routes.

Default base_url is http://localhost:3002 (magic-flow dev server). Production
deploys override via FSCHAT_PLATFORM_BASE_URL env var or config.toml.

Spec: magic-flow/docs/superpowers/specs/2026-04-20-agent-api-decoupling.md (Phase 2)
EOF
)"
```

- [ ] **Step 4: Push + open PR**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && git push -u origin feat/agent-api-phase-2a-platform-url
gh pr create --title "feat(api): add platform_url to flow/template/campaign responses" --body "$(cat <<'EOF'
## Summary

Adds platform_url field to every flow / template / campaign response so external API callers (and the new magic-flow REST endpoints in Phase 2B) can deep-link to the Freestand UI.

- New \`[platform]\` config section with \`base_url\` (FSCHAT_PLATFORM_BASE_URL env override).
- Threaded through 3 response transformers: \`toCampaignResponse\`, \`templateToResponse\`, \`projectToResponse\`.
- URL pattern: \`{base_url}/flow/{id}\`, \`/templates/{id}\`, \`/campaigns/{id}\` matching magic-flow's Next.js routes.

## Test plan

- [x] \`go build ./...\` clean
- [x] 3 new tests assert PlatformURL is populated on each resource type
- [ ] CI: \`make test\` (integration tests need TEST_DATABASE_URL)
- [ ] Production deploys must set FSCHAT_PLATFORM_BASE_URL (or config.toml [platform].base_url)
EOF
)"
```

**Acceptance criteria (Part A):**
- [ ] PR opened against fs-whatsapp main.
- [ ] All three new tests assert non-empty `platform_url` with correct prefix and resource ID.
- [ ] Existing tests still pass (signature changes propagated to all call sites).
- [ ] `go build ./...` clean across the whole repo.

---

# PART B — magic-flow REST endpoints + `magic_flow_url` rename

**Branch (create after Part A is merged so platform_url is real):** `feat/agent-api-phase-2b-rest-endpoints`
**Working directory:** `/Users/pratikgupta/Freestand/magic-flow`
**Depends on:** Part A merged to fs-whatsapp main.

## File Structure (Part B)

### Infrastructure
- `lib/agent-api/constants.ts` — modify: add `write` rate-limit bucket (60/min).
- `lib/agent-api/auth.ts` — modify: wire `write` bucket into the `withAgentAuth` selector.
- `lib/agent-api/schemas.ts` — modify: add Zod schemas for new endpoints (templates create/update, campaign create/update/preview, flow trigger, etc.).
- `lib/agent-api/proxy.ts` — new: `proxyToFsWhatsApp(req, opts)` helper. One source of truth for forwarding the caller's API key, normalizing the response envelope, and mapping fs-whatsapp errors to magic-flow agent error codes.
- `lib/agent-api/publisher.ts` — modify: rename `magic_flow_url` → emit BOTH `magic_flow_url` and `platform_url` (deprecation transition).
- `lib/agent-api/errors.ts` — modify: add `campaign_materializing` to the union (already used by Phase 1 backend, magic-flow needs to know about it).

### Resource routes — accounts (1)
- `app/api/v1/accounts/route.ts` — new: GET list.

### Resource routes — flows (5 new + 2 alias)
- `app/api/v1/flows/route.ts` — new: GET list (alias / forward to existing `/api/v1/agent/flows` GET).
- `app/api/v1/flows/[flow_id]/route.ts` — new: GET single, DELETE.
- `app/api/v1/flows/[flow_id]/publish/route.ts` — new: POST (alias / forward to existing).
- `app/api/v1/flows/[flow_id]/trigger/route.ts` — new: POST `{ phone }`.
- `app/api/v1/flows/[flow_id]/variables/route.ts` — new: GET.

### Resource routes — templates (7)
- `app/api/v1/templates/route.ts` — new: GET list (status filter), POST create.
- `app/api/v1/templates/[template_id]/route.ts` — new: GET, PUT, DELETE.
- `app/api/v1/templates/[template_id]/submit/route.ts` — new: POST.
- `app/api/v1/templates/sync/route.ts` — new: POST.

### Resource routes — campaigns (9)
- `app/api/v1/campaigns/route.ts` — new: GET list (status filter), POST create.
- `app/api/v1/campaigns/[campaign_id]/route.ts` — new: GET, PUT (reschedule), DELETE (cancel).
- `app/api/v1/campaigns/[campaign_id]/start/route.ts` — new: POST.
- `app/api/v1/campaigns/[campaign_id]/pause/route.ts` — new: POST.
- `app/api/v1/campaigns/[campaign_id]/cancel/route.ts` — new: POST.
- `app/api/v1/campaigns/preview-audience/route.ts` — new: POST.

### Tests
- `lib/agent-api/__tests__/proxy.test.ts` — new: covers the proxy helper (auth forwarding, error mapping, response normalization).
- One smoke test per resource group asserting auth + happy-path passthrough — files colocated under `app/api/v1/{accounts,flows,templates,campaigns}/__tests__/`.

### Renames
- `lib/agent-api/publisher.ts:15` — `magic_flow_url: string` becomes `magic_flow_url: string  /* deprecated, prefer platform_url */; platform_url: string`.
- All emission sites in publisher.ts + `app/api/v1/agent/flows/*/route.ts` emit BOTH fields with the same value.
- Tests in `lib/agent-api/__tests__/publisher.test.ts`, `app/api/v1/agent/flows/__tests__/route.test.ts`, `app/api/v1/agent/flows/[flow_id]/__tests__/edit-publish.test.ts` add assertions for `platform_url` alongside existing `magic_flow_url`.

---

## Task B1: Branch + verify Part A on fs-whatsapp main

- [ ] **Step 1: Confirm Part A merged**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp && git checkout main && git pull && git log --oneline -3 | grep -i "platform_url"
```

Expected: a commit titled like "feat(api): add platform_url ..." in main. If not present, STOP — Part A must merge first.

- [ ] **Step 2: Create branch in magic-flow**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && git checkout main && git pull && git checkout -b feat/agent-api-phase-2b-rest-endpoints
```

---

## Task B2: Add `write` rate-limit bucket

- [ ] **Step 1: Update `lib/agent-api/constants.ts`**

Find the existing rate-limit config (probably an object literal). Add a `write` bucket at 60/min. Pattern matches existing `cheap`, `expensive`, `publish` buckets.

```typescript
export const RATE_LIMITS = {
  cheap:     { perMinute: 120 },
  write:     { perMinute: 60 },
  publish:   { perMinute: 30 },
  expensive: { perMinute: 10 },
} as const

export type RateLimitBucket = keyof typeof RATE_LIMITS
```

(Confirm exact existing shape — adjust the snippet to match.)

- [ ] **Step 2: Wire it into `withAgentAuth`**

In `lib/agent-api/auth.ts`, find the `bucket` parameter type for `withAgentAuth`. It probably already accepts `RateLimitBucket`. If yes, no change. If it has an explicit union, add `"write"`.

- [ ] **Step 3: Type-check**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit
```

Expected: clean.

---

## Task B3: Add `proxy.ts` helper (test-first)

- [ ] **Step 1: Failing test — create `lib/agent-api/__tests__/proxy.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { proxyToFsWhatsApp } from "../proxy"

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch)
  mockFetch.mockReset()
})

describe("proxyToFsWhatsApp", () => {
  it("forwards X-API-Key from the caller", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: "success", data: { ok: true } }), { status: 200 }))

    await proxyToFsWhatsApp({
      apiKey: "whm_test_123",
      method: "GET",
      path: "/api/templates",
    })

    const init = mockFetch.mock.calls[0][1]
    expect(init.headers["X-API-Key"]).toBe("whm_test_123")
  })

  it("returns the unwrapped data envelope on 2xx", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ status: "success", data: { id: "tpl_1", name: "X" } }), { status: 200 }))

    const result = await proxyToFsWhatsApp({
      apiKey: "whm_x",
      method: "GET",
      path: "/api/templates/tpl_1",
    })

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ id: "tpl_1", name: "X" })
  })

  it("preserves status code and message on error envelope", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      status: "error",
      message: "Campaign recipients are still being fetched...",
      data: { code: "campaign_materializing" },
    }), { status: 409 }))

    const result = await proxyToFsWhatsApp({
      apiKey: "whm_x",
      method: "POST",
      path: "/api/campaigns/c_1/start",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
    expect(result.error?.code).toBe("campaign_materializing")
    expect(result.error?.message).toContain("materializing")
  })
})
```

Run, expect compile FAIL.

- [ ] **Step 2: Implement `lib/agent-api/proxy.ts`**

```typescript
const FS_WHATSAPP_URL = process.env.FS_WHATSAPP_URL ?? "http://localhost:8080"

export interface ProxyOptions {
  apiKey: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string                 // e.g. "/api/templates"
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export interface ProxyResult<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: { code: string; message: string }
  warnings?: Array<{ code: string; message: string; [extra: string]: unknown }>
}

export async function proxyToFsWhatsApp<T = unknown>(opts: ProxyOptions): Promise<ProxyResult<T>> {
  const url = new URL(FS_WHATSAPP_URL + opts.path)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method,
    headers: {
      "X-API-Key": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  })

  const envelope: any = await res.json().catch(() => ({}))

  if (envelope.status === "error") {
    return {
      ok: false,
      status: res.status,
      error: {
        code: envelope.data?.code ?? "internal_error",
        message: envelope.message ?? "Request failed",
      },
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data: envelope.data as T,
    warnings: envelope.data?.warnings,
  }
}
```

- [ ] **Step 3: Run proxy tests**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx vitest run lib/agent-api/__tests__/proxy.test.ts
```

Expected: 3 PASS.

---

## Task B4: Add Zod schemas for the new endpoints

- [ ] **Step 1: Append to `lib/agent-api/schemas.ts`**

```typescript
// --- Templates ---
export const templateBodyComponentSchema = z.object({
  type: z.enum(["BODY", "HEADER", "FOOTER", "BUTTONS"]),
  text: z.string().optional(),
  buttons: z.array(z.unknown()).optional(),
})

export const createTemplateBodySchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/).min(1).max(512),
  language: z.string().min(2).max(10),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  components: z.array(templateBodyComponentSchema).min(1),
  account_name: z.string().min(1),
})

export const updateTemplateBodySchema = createTemplateBodySchema.partial().extend({
  account_name: z.string().min(1),
})

export const listTemplatesQuerySchema = z.object({
  status: z.enum(["APPROVED", "PENDING", "DRAFT", "REJECTED", "DISABLED", "PAUSED"]).optional(),
  account_name: z.string().optional(),
})

// --- Campaigns ---
export const audienceConfigSchema = z.object({
  channel: z.enum(["whatsapp"]).optional(),
  filter: z.record(z.unknown()).optional(),
  search: z.string().optional(),
  audience_id: z.string().uuid().optional(),
  column_mapping: z.record(z.string()).optional(),
})

export const previewAudienceBodySchema = z.object({
  source: z.enum(["contacts", "freestand-claimant"]),
  audience_config: audienceConfigSchema,
})

export const createCampaignBodySchema = z.object({
  name: z.string().min(1).max(200),
  flow_id: z.string().uuid(),
  account_name: z.string().min(1),
  audience_source: z.enum(["contacts", "freestand-claimant"]),
  audience_config: audienceConfigSchema,
  scheduled_at: z.string().datetime().optional(),
})

export const updateCampaignBodySchema = z.object({
  scheduled_at: z.string().datetime(),
})

export const listCampaignsQuerySchema = z.object({
  status: z.enum([
    "draft", "materializing", "scheduled", "queued", "processing",
    "paused", "completed", "cancelled", "failed",
  ]).optional(),
})

// --- Flows ---
export const triggerFlowBodySchema = z.object({
  phone: z.string().regex(/^\+\d{6,15}$/),
})
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit
```

Expected: clean.

---

## Task B5: Add `campaign_materializing` to error union

- [ ] **Step 1: Update `lib/agent-api/errors.ts`**

Find the `AgentErrorCode` type union. Add:

```typescript
| "campaign_materializing"
```

Run `npx tsc --noEmit` to confirm no breakage.

---

## Task B6: Implement `/v1/accounts` (smallest endpoint, prove the pattern)

- [ ] **Step 1: Failing test — create `app/api/v1/accounts/__tests__/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../route"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

vi.mock("@/lib/agent-api/proxy")
vi.mock("@/lib/agent-api/account-resolver", () => ({
  getActingAccount: vi.fn().mockResolvedValue({ org_id: "org_1", connected_channels: ["whatsapp"] }),
}))

beforeEach(() => {
  vi.mocked(proxyToFsWhatsApp).mockReset()
})

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/accounts", {
    method: "GET",
    headers,
  })
}

describe("GET /api/v1/accounts", () => {
  it("returns 401 without X-API-Key", async () => {
    const res = await GET(makeRequest({}) as any)
    expect(res.status).toBe(401)
  })

  it("forwards to fs-whatsapp /api/accounts and returns the data", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true,
      status: 200,
      data: { accounts: [{ id: "a_1", name: "Account 1", platform_url: "https://app.test/accounts/a_1" }] },
    })

    const res = await GET(makeRequest({ "X-API-Key": "whm_test_xyz" }) as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accounts).toHaveLength(1)
    expect(body.accounts[0].platform_url).toContain("/accounts/a_1")
  })
})
```

Run, expect compile FAIL.

- [ ] **Step 2: Implement `app/api/v1/accounts/route.ts`**

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

export const GET = withAgentAuth("cheap", async (req, ctx) => {
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: "/api/accounts",
  })

  if (!result.ok) {
    return Response.json(
      { code: result.error?.code ?? "internal_error", message: result.error?.message ?? "Failed" },
      { status: result.status },
    )
  }

  return Response.json(result.data, { status: 200 })
})
```

(If `withAgentAuth`'s actual signature differs from the assumed `(bucket, handler)` shape, adapt to the real signature you find in `lib/agent-api/auth.ts`.)

- [ ] **Step 3: Run test, expect 2 PASS**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx vitest run app/api/v1/accounts/
```

---

## Task B7: Implement template endpoints

- [ ] **Step 1: Failing tests — create `app/api/v1/templates/__tests__/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET, POST } from "../route"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

vi.mock("@/lib/agent-api/proxy")
vi.mock("@/lib/agent-api/account-resolver", () => ({
  getActingAccount: vi.fn().mockResolvedValue({ org_id: "org_1", connected_channels: ["whatsapp"] }),
}))

beforeEach(() => vi.mocked(proxyToFsWhatsApp).mockReset())

const validBody = {
  name: "test_template",
  language: "en_US",
  category: "UTILITY",
  components: [{ type: "BODY", text: "Hello {{1}}" }],
  account_name: "default",
}

describe("GET /api/v1/templates", () => {
  it("forwards status filter to fs-whatsapp", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({ ok: true, status: 200, data: { templates: [] } })
    const req = new Request("http://localhost/api/v1/templates?status=APPROVED", {
      headers: { "X-API-Key": "whm_x" },
    })
    await GET(req as any)
    expect(vi.mocked(proxyToFsWhatsApp).mock.calls[0][0].query?.status).toBe("APPROVED")
  })

  it("rejects invalid status enum with 400", async () => {
    const req = new Request("http://localhost/api/v1/templates?status=BOGUS", {
      headers: { "X-API-Key": "whm_x" },
    })
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })
})

describe("POST /api/v1/templates", () => {
  it("validates body shape, forwards on success", async () => {
    vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
      ok: true, status: 201,
      data: { id: "tpl_new", name: "test_template", platform_url: "https://app/templates/tpl_new" },
    })
    const req = new Request("http://localhost/api/v1/templates", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(201)
  })

  it("rejects invalid name regex with 400", async () => {
    const req = new Request("http://localhost/api/v1/templates", {
      method: "POST",
      headers: { "X-API-Key": "whm_x", "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, name: "BAD-NAME-WITH-DASHES" }),
    })
    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })
})
```

Run, expect compile FAIL.

- [ ] **Step 2: Implement `app/api/v1/templates/route.ts`**

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { listTemplatesQuerySchema, createTemplateBodySchema } from "@/lib/agent-api/schemas"

export const GET = withAgentAuth("cheap", async (req, ctx) => {
  const url = new URL(req.url)
  const parsed = listTemplatesQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    account_name: url.searchParams.get("account_name") ?? undefined,
  })
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: "/api/templates",
    query: parsed.data,
  })

  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})

export const POST = withAgentAuth("write", async (req, ctx) => {
  const body = await req.json().catch(() => null)
  const parsed = createTemplateBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: "/api/templates",
    body: parsed.data,
  })

  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})
```

- [ ] **Step 3: Implement `app/api/v1/templates/[template_id]/route.ts`**

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { updateTemplateBodySchema } from "@/lib/agent-api/schemas"

interface Ctx { params: Promise<{ template_id: string }> }

export const GET = withAgentAuth("cheap", async (_req, ctx, routeCtx: Ctx) => {
  const { template_id } = await routeCtx.params
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/templates/${template_id}`,
  })
  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})

export const PUT = withAgentAuth("write", async (req, ctx, routeCtx: Ctx) => {
  const { template_id } = await routeCtx.params
  const body = await req.json().catch(() => null)
  const parsed = updateTemplateBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "PUT",
    path: `/api/templates/${template_id}`,
    body: parsed.data,
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})

export const DELETE = withAgentAuth("write", async (_req, ctx, routeCtx: Ctx) => {
  const { template_id } = await routeCtx.params
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "DELETE",
    path: `/api/templates/${template_id}`,
  })
  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})
```

(If `withAgentAuth`'s real signature is `(bucket, handler)` taking only `(req, ctx)`, the routeCtx parameter pattern above won't match. In that case, adapt: handlers receive Next.js's standard route context as a third positional arg. Verify via reading the existing `app/api/v1/agent/flows/[flow_id]/edit/route.ts` for the actual pattern.)

- [ ] **Step 4: Implement `submit` and `sync` routes**

`app/api/v1/templates/[template_id]/submit/route.ts`:

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

interface Ctx { params: Promise<{ template_id: string }> }

export const POST = withAgentAuth("publish", async (_req, ctx, routeCtx: Ctx) => {
  const { template_id } = await routeCtx.params
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: `/api/templates/${template_id}/publish`,
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})
```

`app/api/v1/templates/sync/route.ts`:

```typescript
import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

export const POST = withAgentAuth("write", async (_req, ctx) => {
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: "/api/templates/sync",
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
})
```

- [ ] **Step 5: Run template tests + tsc**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run app/api/v1/templates/
```

Expected: PASS.

---

## Task B8: Implement campaign endpoints

Same pattern as templates. Create the files listed in File Structure (Part B → Resource routes → campaigns).

- [ ] **Step 1: Failing tests — create `app/api/v1/campaigns/__tests__/route.test.ts`**

Mirror the template test pattern — one happy-path + one validation-fail per endpoint group. Critically: include a test that asserts the `warnings[]` array from fs-whatsapp passes through on `POST /v1/campaigns`:

```typescript
it("preserves warnings[] from fs-whatsapp in the response", async () => {
  vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      id: "cmp_1",
      platform_url: "https://app.test/campaigns/cmp_1",
      warnings: [
        { code: "first_message_not_template", message: "..." },
      ],
    },
    warnings: [{ code: "first_message_not_template", message: "..." }],
  })
  // ... post valid body ...
  const body = await res.json()
  expect(body.warnings).toHaveLength(1)
  expect(body.warnings[0].code).toBe("first_message_not_template")
})
```

And one that asserts `campaign_materializing` 409 passthrough:

```typescript
it("passes through 409 campaign_materializing from fs-whatsapp", async () => {
  vi.mocked(proxyToFsWhatsApp).mockResolvedValue({
    ok: false,
    status: 409,
    error: { code: "campaign_materializing", message: "..." },
  })
  // ... call POST /api/v1/campaigns/cmp_1/start ...
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body.code).toBe("campaign_materializing")
})
```

- [ ] **Step 2: Implement the route files**

Following the template pattern. Each is ~15-30 lines. Use `withAgentAuth` with the right bucket per the table in the spec (cheap for GET, write for POST/PUT/DELETE except start/pause/cancel which use publish).

- [ ] **Step 3: Run scoped tests + tsc**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run app/api/v1/campaigns/
```

Expected: PASS.

---

## Task B9: Implement flow endpoints

5 new route files. Pattern same as above. Notes:

- `GET /v1/flows` and `POST /v1/flows/{id}/publish` are functional duplicates of existing `/api/v1/agent/flows` GET and `/api/v1/agent/flows/{id}/publish` POST. Two options:
  - **Aliased re-export:** `app/api/v1/flows/route.ts` → `export { GET } from "../agent/flows/route"`. Simplest.
  - **Independent thin proxy:** call fs-whatsapp directly. More duplication but cleaner separation.

Pick **aliased re-export** for the duplicates to avoid drift.

- `POST /v1/flows/{id}/trigger` body shape: `{ phone: string }` validated by `triggerFlowBodySchema`. Forwards to fs-whatsapp's existing trigger endpoint.

- `GET /v1/flows/{id}/variables` returns the variable list — proxy to fs-whatsapp's existing flow-variables endpoint.

- `DELETE /v1/flows/{id}` proxies to fs-whatsapp's project delete.

- [ ] **Step 1: Failing test for trigger** — `app/api/v1/flows/[flow_id]/trigger/__tests__/route.test.ts`. Mirror the template POST pattern.

- [ ] **Step 2: Implement all 5 route files**

- [ ] **Step 3: Run scoped tests + tsc**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run app/api/v1/flows/
```

---

## Task B10: Rename `magic_flow_url` → emit BOTH fields

- [ ] **Step 1: Update `lib/agent-api/publisher.ts`**

For every emission of `magic_flow_url: x` in the file (lines 88, 528, 541 per current grep), emit BOTH:

```typescript
magic_flow_url: x,  // deprecated — prefer platform_url
platform_url: x,
```

Update the type definition at line 15:

```typescript
export interface FlowSummary {
  // ... existing fields ...
  magic_flow_url: string  // deprecated — prefer platform_url
  platform_url: string
}
```

- [ ] **Step 2: Update the 3 route files**

Same double-emit pattern in:
- `app/api/v1/agent/flows/route.ts:321`
- `app/api/v1/agent/flows/[flow_id]/edit/route.ts:154, 303`
- `app/api/v1/agent/flows/[flow_id]/publish/route.ts:69, 117`

For each, find the existing `magic_flow_url: \`${appUrl}/flow/${...}\`,` line and add directly below:

```typescript
platform_url: `${appUrl}/flow/${...}`,
```

- [ ] **Step 3: Update tests**

For each test file that asserts `magic_flow_url`, add a parallel `platform_url` assertion:

```typescript
expect(result.platform_url).toContain("/flow/proj_1")
```

Files: `lib/agent-api/__tests__/publisher.test.ts`, `lib/agent-api/__tests__/errors.test.ts`, `app/api/v1/agent/flows/__tests__/route.test.ts`, `app/api/v1/agent/flows/[flow_id]/__tests__/edit-publish.test.ts`.

- [ ] **Step 4: Run all tests + tsc**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run lib/agent-api/ app/api/v1/agent/
```

Expected: PASS (both old and new assertions hold because we emit both fields).

---

## Task B11: Final scoped tests + commit + PR

- [ ] **Step 1: All scoped tests for new code**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npx vitest run \
  lib/agent-api/__tests__/proxy.test.ts \
  lib/agent-api/__tests__/publisher.test.ts \
  lib/agent-api/__tests__/errors.test.ts \
  app/api/v1/accounts/ \
  app/api/v1/flows/ \
  app/api/v1/templates/ \
  app/api/v1/campaigns/ \
  app/api/v1/agent/
```

Expected: all PASS.

- [ ] **Step 2: Lint**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && npx eslint lib/agent-api app/api/v1 --max-warnings 0
```

- [ ] **Step 3: Review and commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && git status && git diff --stat
```

Expect a long list — ~30 modified/new files across `lib/agent-api/` and `app/api/v1/`.

Stage and commit:

```bash
cd /Users/pratikgupta/Freestand/magic-flow && git add -A && git commit -m "$(cat <<'EOF'
feat(api): add /v1 REST CRUD for flows/templates/campaigns/accounts

Adds 21 new REST endpoints under /api/v1/* that proxy to fs-whatsapp,
giving external API callers a deterministic CRUD surface for templates and
broadcasts without going through the LLM agent. Companion to Phase 2A on
fs-whatsapp which populates platform_url on resource responses.

Infrastructure:
- new write rate-limit bucket (60/min) alongside cheap (120/min),
  publish (30/min), and expensive (10/min)
- new lib/agent-api/proxy.ts helper — single source of truth for
  forwarding the caller's API key, parsing fs-whatsapp envelopes, and
  mapping error codes
- new Zod schemas covering every new request body / query param

Endpoints:
- GET /v1/accounts
- /v1/flows, /v1/flows/{id} GET/DELETE, /v1/flows/{id}/publish,
  /v1/flows/{id}/trigger, /v1/flows/{id}/variables
- /v1/templates GET/POST, /v1/templates/{id} GET/PUT/DELETE,
  /v1/templates/{id}/submit, /v1/templates/sync
- /v1/campaigns GET/POST, /v1/campaigns/{id} GET/PUT/DELETE,
  /v1/campaigns/{id}/start|pause|cancel, /v1/campaigns/preview-audience

Existing /v1/agent/flows endpoints unchanged. Flow responses now
double-emit magic_flow_url AND platform_url for one release window
before magic_flow_url is dropped.

Spec: docs/superpowers/specs/2026-04-20-agent-api-decoupling.md (Phase 2)
EOF
)"
```

- [ ] **Step 4: Push + PR**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && git push -u origin feat/agent-api-phase-2b-rest-endpoints
gh pr create --title "feat(api): add /v1 REST CRUD for flows/templates/campaigns/accounts" --body "$(cat <<'EOF'
## Summary

Ships 21 new REST endpoints under \`/api/v1/*\` so external callers can CRUD flows, templates, campaigns, and accounts without going through the NL agent. Thin proxy layer over fs-whatsapp; new \`write\` rate-limit bucket; new \`lib/agent-api/proxy.ts\` helper centralizing fs-whatsapp call shape.

Pairs with fs-chat PR (Phase 2A) which populates \`platform_url\` on backend responses. Existing flow endpoints double-emit \`magic_flow_url\` AND \`platform_url\` for one release window.

## Endpoints added

- \`GET /v1/accounts\`
- Flows: list, get, delete, publish, trigger, variables
- Templates: list, create, get, update, delete, submit, sync
- Campaigns: list, create, get, update (reschedule), delete (cancel), start, pause, cancel, preview-audience

All \`X-API-Key: whm_*\` auth via existing \`withAgentAuth\` wrapper.

## Test plan

- [x] \`npx tsc --noEmit\` clean
- [x] Scoped vitest run for proxy + new routes — all green
- [x] Existing \`/v1/agent/flows\` tests still pass with new \`platform_url\` assertions
- [ ] Manual: hit \`GET /v1/accounts\` with a real \`whm_*\` key, confirm \`platform_url\` populated
- [ ] Manual: hit \`POST /v1/campaigns\` for a non-template-first flow, confirm \`warnings[]\` passthrough
EOF
)"
```

**Acceptance criteria (Part B):**
- [ ] PR opened against magic-flow main.
- [ ] All 21 endpoints accessible at `/api/v1/*` with `X-API-Key` auth.
- [ ] Zod validation rejects bad bodies with 400.
- [ ] `warnings[]` from fs-whatsapp campaign create passes through unchanged.
- [ ] `409 campaign_materializing` from fs-whatsapp start passes through unchanged.
- [ ] Existing flow endpoints still emit `magic_flow_url` (with deprecation note) AND new `platform_url`.
- [ ] `npx tsc --noEmit && npx vitest run` clean for touched packages.

---

## Self-Review Checklist (whole plan)

- [ ] **Spec coverage:**
  - REST CRUD for flows / templates / campaigns / accounts → Tasks B6-B9
  - `platform_url` on every resource response → Part A (backend) + B10 (flow renames)
  - `write` rate-limit bucket → Task B2
  - `magic_flow_url` deprecation with double-emit → Task B10
  - `campaign_materializing` 409 in error union → Task B5
  - `warnings[]` passthrough → Task B8 explicit test

- [ ] **No placeholders:** every code block runs as-is. Three places intentionally flagged for verification against actual code:
  - `withAgentAuth` exact signature in `lib/agent-api/auth.ts` (Task B6 onwards)
  - `RATE_LIMITS` exact shape in `lib/agent-api/constants.ts` (Task B2)
  - Existing transformer signatures in fs-whatsapp (Task A1)

- [ ] **Type consistency:** `ProxyResult<T>` shape matches across helper, tests, and route handlers. `RateLimitBucket` includes the new `write` value everywhere.

- [ ] **Project conventions:** no `Co-Authored-By` watermark, no force-push, no stash, no main-branch direct commits. Tests scoped to touched packages per `feedback_scoped_test_runs.md`. Error messages state-based per `feedback_error_messages_no_internals.md`.

---

## Rollback

Each PR is independently reversible:

```bash
# fs-whatsapp Part A
cd fs-whatsapp && git revert <part-a-commit-sha>

# magic-flow Part B
cd magic-flow && git revert <part-b-commit-sha>
```

Reverting Part A while Part B is live: `platform_url` becomes empty string in fs-whatsapp responses (the conditional `if baseURL != ""` short-circuits). Part B's REST endpoints still work, just with empty `platform_url` values — degraded but not broken.

Reverting Part B alone: external callers lose the new endpoints; existing `/v1/agent/flows` endpoints still work because the rename is a double-emit, not a removal.
