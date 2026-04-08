# Casbin Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom RBAC (PathFeatureMap, HasFeature, GetRoleFeatures) with Apache Casbin enforcer using GORM adapter and per-route `withRBAC` wrapper.

**Architecture:** Casbin SyncedEnforcer loaded at startup from `casbin_rule` table via GORM adapter. Each route wrapped with `withRBAC(resource, handler)` — no global PathResourceMap. Frontend unchanged except AuthProvider fetches `/api/auth/permissions`. Feature flag `RBAC_ENGINE` enables rollback to legacy system.

**Tech Stack:** Casbin v2, gorm-adapter/v3, Go, PostgreSQL, React (minimal changes)

**Spec:** `docs/superpowers/specs/2026-04-06-casbin-migration-design.md`

---

## File Structure

### New Files (fs-whatsapp)
| File | Responsibility |
|------|---------------|
| `internal/rbac/rbac.go` | Casbin enforcer init, `withRBAC` wrapper, FeatureRegistry, DefaultRoleFeatures, GetUserPermissions, GetResourceForPath |
| `internal/rbac/rbac_test.go` | Tests for withRBAC, GetUserPermissions |
| `config/rbac_model.conf` | Casbin PERM model definition |

### Modified Files (fs-whatsapp)
| File | Change |
|------|--------|
| `cmd/fs-chat/main.go` | Init enforcer, remove RBAC Before() middleware, wrap all routes with `withRBAC` |
| `internal/handlers/app.go` | Add `Enforcer *casbin.SyncedEnforcer` to App struct |
| `internal/handlers/auth.go` | Seed via `enforcer.AddPolicies()` |
| `internal/handlers/role_permissions.go` | Use Casbin API for CRUD, add GetUserPermissions endpoint |
| `internal/handlers/users.go` | Replace `middleware.HasFeature` with `enforcer.Enforce` |
| `internal/database/postgres.go` | Remove OrgRolePermission from migration models |
| `go.mod` / `go.sum` | Add casbin and gorm-adapter dependencies |

### Modified Files (magic-flow)
| File | Change |
|------|--------|
| `contexts/auth-context.tsx` | Fetch `/api/auth/permissions` |
| `lib/permissions.ts` | Update feature names (remove `settings.` prefix) |
| `components/app-sidebar.tsx` | Update feature names |
| `app/(dashboard)/settings/*/layout.tsx` | Update feature names |

### Deleted After Migration
| File | When |
|------|------|
| `internal/middleware/rbac.go` | Phase 4 (after verification) |
| `internal/models/org_role_permission.go` | Phase 4 |

---

## Task 1: Add Casbin Dependencies + Model Config

**Files:**
- Modify: `go.mod`
- Create: `config/rbac_model.conf`

- [ ] **Step 1: Add Casbin dependencies**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
go get github.com/casbin/casbin/v2
go get github.com/casbin/gorm-adapter/v3
```

- [ ] **Step 2: Create Casbin model config**

Create `config/rbac_model.conf`:

```ini
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && r.obj == p.obj && (p.act == "*" || r.act == p.act)
```

- [ ] **Step 3: Verify build**

```bash
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add go.mod go.sum config/rbac_model.conf
git commit -m "feat(casbin): add Casbin v2 + GORM adapter deps and model config"
```

---

## Task 2: Create RBAC Package with Enforcer + withRBAC Wrapper

**Files:**
- Create: `internal/rbac/rbac.go`
- Create: `internal/rbac/rbac_test.go`

- [ ] **Step 1: Write tests for withRBAC and GetUserPermissions**

Create `internal/rbac/rbac_test.go`:

```go
package rbac

import (
	"testing"

	"github.com/casbin/casbin/v2"
	"github.com/casbin/casbin/v2/model"
	"github.com/stretchr/testify/assert"
)

func newTestEnforcer(t *testing.T) *casbin.SyncedEnforcer {
	m, err := model.NewModelFromFile("../../config/rbac_model.conf")
	assert.NoError(t, err)

	e, err := casbin.NewSyncedEnforcer(m)
	assert.NoError(t, err)

	// Add test policies
	e.AddPolicy("admin", "org_1", "flows", "*")
	e.AddPolicy("admin", "org_1", "users", "*")
	e.AddPolicy("admin", "org_1", "teams", "*")
	e.AddPolicy("manager", "org_1", "flows", "*")
	e.AddPolicy("manager", "org_1", "teams", "*")
	e.AddPolicy("manager", "org_1", "users", "GET")
	e.AddPolicy("agent", "org_1", "chat", "*")
	e.AddPolicy("agent", "org_1", "contacts", "*")

	return e
}

func TestEnforce_ModuleLevel(t *testing.T) {
	e := newTestEnforcer(t)

	// Admin has full access to flows
	ok, _ := e.Enforce("admin", "org_1", "flows", "GET")
	assert.True(t, ok)
	ok, _ = e.Enforce("admin", "org_1", "flows", "DELETE")
	assert.True(t, ok)

	// Manager has full access to flows
	ok, _ = e.Enforce("manager", "org_1", "flows", "POST")
	assert.True(t, ok)

	// Agent cannot access flows
	ok, _ = e.Enforce("agent", "org_1", "flows", "GET")
	assert.False(t, ok)

	// Agent can access chat
	ok, _ = e.Enforce("agent", "org_1", "chat", "GET")
	assert.True(t, ok)
}

func TestEnforce_ActionLevel(t *testing.T) {
	e := newTestEnforcer(t)

	// Manager can GET users (read-only)
	ok, _ := e.Enforce("manager", "org_1", "users", "GET")
	assert.True(t, ok)

	// Manager cannot POST/DELETE users
	ok, _ = e.Enforce("manager", "org_1", "users", "POST")
	assert.False(t, ok)
	ok, _ = e.Enforce("manager", "org_1", "users", "DELETE")
	assert.False(t, ok)

	// Admin can do anything on users
	ok, _ = e.Enforce("admin", "org_1", "users", "DELETE")
	assert.True(t, ok)
}

func TestEnforce_OrgIsolation(t *testing.T) {
	e := newTestEnforcer(t)

	// Admin in org_1 cannot access org_2
	ok, _ := e.Enforce("admin", "org_2", "flows", "GET")
	assert.False(t, ok)
}

func TestEnforce_DefaultDeny(t *testing.T) {
	e := newTestEnforcer(t)

	// Unknown role denied
	ok, _ := e.Enforce("unknown-role", "org_1", "flows", "GET")
	assert.False(t, ok)

	// Known role, unknown resource denied
	ok, _ = e.Enforce("admin", "org_1", "billing", "GET")
	assert.False(t, ok)
}

func TestGetUserPermissions(t *testing.T) {
	e := newTestEnforcer(t)

	perms := GetUserPermissions(e, "manager", "org_1")
	assert.Contains(t, perms, "flows")
	assert.Contains(t, perms, "teams")
	assert.Contains(t, perms, "users")
	assert.NotContains(t, perms, "chat")

	perms = GetUserPermissions(e, "agent", "org_1")
	assert.Contains(t, perms, "chat")
	assert.Contains(t, perms, "contacts")
	assert.NotContains(t, perms, "flows")
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/rbac/... -v
```
Expected: FAIL — package doesn't exist

- [ ] **Step 3: Implement `internal/rbac/rbac.go`**

```go
package rbac

import (
	"fmt"
	"strings"

	"github.com/casbin/casbin/v2"
	gormadapter "github.com/casbin/gorm-adapter/v3"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"

	"github.com/freestandtech/fs-chat/internal/models"
	"github.com/google/uuid"
)

// FeatureDefinition describes a feature that can be assigned to roles.
type FeatureDefinition struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Group string `json:"group"` // "main" or "settings" — for frontend sidebar grouping
}

// FeatureRegistry is the single source of truth for all assignable features.
var FeatureRegistry = []FeatureDefinition{
	{Key: "flows", Label: "Flows", Group: "main"},
	{Key: "templates", Label: "WhatsApp Templates", Group: "main"},
	{Key: "chat", Label: "Chat", Group: "main"},
	{Key: "campaigns", Label: "Campaigns", Group: "main"},
	{Key: "contacts", Label: "Contacts", Group: "main"},
	{Key: "analytics", Label: "Analytics", Group: "main"},
	{Key: "accounts", Label: "Accounts", Group: "settings"},
	{Key: "users", Label: "User Management", Group: "settings"},
	{Key: "teams", Label: "Teams", Group: "settings"},
	{Key: "chatbot", Label: "Chatbot Settings", Group: "settings"},
	{Key: "api-keys", Label: "API Keys", Group: "settings"},
}

// AllowedFeatures is derived from FeatureRegistry for validation.
var AllowedFeatures map[string]bool

func init() {
	AllowedFeatures = make(map[string]bool, len(FeatureRegistry))
	for _, f := range FeatureRegistry {
		AllowedFeatures[f.Key] = true
	}
}

// DefaultRoleFeatures defines default permissions for built-in roles.
var DefaultRoleFeatures = map[string][]string{
	"admin": {
		"flows", "templates", "chat", "campaigns", "contacts", "analytics",
		"accounts", "users", "teams", "chatbot", "api-keys",
	},
	"manager": {
		"flows", "templates", "chat", "campaigns", "contacts", "analytics",
		"accounts", "teams", "chatbot",
	},
	"agent": {
		"chat", "contacts",
	},
}

// ManagerReadOnlyResources are resources where managers get GET-only access
// even without the full feature permission (e.g., users list for Teams page).
var ManagerReadOnlyResources = map[string]bool{
	"users": true,
}

// NewEnforcer creates a Casbin SyncedEnforcer with GORM adapter.
func NewEnforcer(db *gorm.DB, modelPath string) (*casbin.SyncedEnforcer, error) {
	adapter, err := gormadapter.NewAdapterByDB(db)
	if err != nil {
		return nil, fmt.Errorf("failed to create casbin adapter: %w", err)
	}

	e, err := casbin.NewSyncedEnforcer(modelPath, adapter)
	if err != nil {
		return nil, fmt.Errorf("failed to create casbin enforcer: %w", err)
	}

	if err := e.LoadPolicy(); err != nil {
		return nil, fmt.Errorf("failed to load policies: %w", err)
	}

	return e, nil
}

// WithRBAC wraps a handler with Casbin enforcement for the given resource.
func WithRBAC(enforcer *casbin.SyncedEnforcer, resource string, handler fastglue.FastRequestHandler) fastglue.FastRequestHandler {
	return func(r *fastglue.Request) error {
		role, ok := r.RequestCtx.UserValue("role").(models.Role)
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
		}
		orgID, ok := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
		if !ok {
			return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
		}
		method := string(r.RequestCtx.Method())

		allowed, err := enforcer.Enforce(string(role), orgID.String(), resource, method)
		if err != nil || !allowed {
			return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Access denied", nil, "")
		}
		return handler(r)
	}
}

// GetUserPermissions returns all features the user's role has access to in their org.
// Uses GetFilteredPolicy for a single in-memory lookup.
func GetUserPermissions(e *casbin.SyncedEnforcer, role, orgID string) []string {
	policies := e.GetFilteredPolicy(0, role, orgID)

	seen := make(map[string]bool)
	var features []string
	for _, p := range policies {
		if len(p) < 3 {
			continue
		}
		resource := p[2]
		if !seen[resource] {
			seen[resource] = true
			features = append(features, resource)
		}
	}
	return features
}

// SeedOrgPolicies adds default policies for a new org. Atomic batch insert.
func SeedOrgPolicies(e *casbin.SyncedEnforcer, orgID string) error {
	var policies [][]string
	for role, features := range DefaultRoleFeatures {
		for _, feature := range features {
			policies = append(policies, []string{role, orgID, feature, "*"})
		}
	}
	// Add manager read-only access to users (for Teams page)
	policies = append(policies, []string{"manager", orgID, "users", "GET"})

	_, err := e.AddPolicies(policies)
	return err
}
```

- [ ] **Step 4: Run tests**

```bash
go test ./internal/rbac/... -v
```
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add internal/rbac/rbac.go internal/rbac/rbac_test.go
git commit -m "feat(casbin): add rbac package with enforcer, withRBAC wrapper, and tests"
```

---

## Task 3: Add Enforcer to App Struct + Init in main.go

**Files:**
- Modify: `internal/handlers/app.go`
- Modify: `cmd/fs-chat/main.go`

- [ ] **Step 1: Add Enforcer field to App struct**

In `internal/handlers/app.go`, add to the `App` struct:

```go
import "github.com/casbin/casbin/v2"

type App struct {
    // ...existing fields...
    Enforcer *casbin.SyncedEnforcer
}
```

- [ ] **Step 2: Init enforcer in main.go**

In `cmd/fs-chat/main.go`, after database init and before route registration, add:

```go
import "github.com/freestandtech/fs-chat/internal/rbac"

// Init Casbin enforcer
enforcer, err := rbac.NewEnforcer(db, "config/rbac_model.conf")
if err != nil {
    lo.Fatal("Failed to init Casbin enforcer", "error", err)
}
app.Enforcer = enforcer
lo.Info("Casbin enforcer initialized", "policies", len(enforcer.GetPolicy()))
```

- [ ] **Step 3: Build and verify**

```bash
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add internal/handlers/app.go cmd/fs-chat/main.go
git commit -m "feat(casbin): init SyncedEnforcer in App struct and main.go"
```

---

## Task 4: Migrate Data from org_role_permissions to casbin_rule

**Files:**
- Create: migration SQL script or Go function

- [ ] **Step 1: Write migration function**

Add to `internal/rbac/rbac.go`:

```go
// MigrateFromOrgRolePermissions reads old org_role_permissions table
// and creates equivalent Casbin policies. Run once during migration.
func MigrateFromOrgRolePermissions(e *casbin.SyncedEnforcer, db *gorm.DB) error {
	type OldPermission struct {
		OrganizationID uuid.UUID
		Role           string
		Features       models.StringArray `gorm:"type:jsonb"`
	}

	var oldPerms []OldPermission
	if err := db.Table("org_role_permissions").Find(&oldPerms).Error; err != nil {
		return fmt.Errorf("failed to read org_role_permissions: %w", err)
	}

	var policies [][]string
	for _, perm := range oldPerms {
		for _, feature := range perm.Features {
			// Map old settings.* names to new flat names
			resource := strings.TrimPrefix(feature, "settings.")
			policies = append(policies, []string{perm.Role, perm.OrganizationID.String(), resource, "*"})
		}
	}

	if len(policies) > 0 {
		if _, err := e.AddPolicies(policies); err != nil {
			return fmt.Errorf("failed to add migrated policies: %w", err)
		}
	}

	return nil
}
```

- [ ] **Step 2: Call migration on startup (behind feature flag)**

In `cmd/fs-chat/main.go`, after enforcer init:

```go
// One-time migration: org_role_permissions → casbin_rule
if len(enforcer.GetPolicy()) == 0 {
    lo.Info("No Casbin policies found, migrating from org_role_permissions...")
    if err := rbac.MigrateFromOrgRolePermissions(enforcer, db); err != nil {
        lo.Error("Migration failed", "error", err)
    } else {
        lo.Info("Migration complete", "policies", len(enforcer.GetPolicy()))
    }
}
```

- [ ] **Step 3: Verify migration**

Rebuild container, check logs for migration output. Then verify:

```bash
docker exec fschat_db_dev psql -U fschat -d fschat -c "SELECT COUNT(*) FROM casbin_rule;"
docker exec fschat_db_dev psql -U fschat -d fschat -c "SELECT * FROM casbin_rule LIMIT 10;"
```

- [ ] **Step 4: Commit**

```bash
git add internal/rbac/rbac.go cmd/fs-chat/main.go
git commit -m "feat(casbin): migrate org_role_permissions data to casbin_rule"
```

---

## Task 5: Remove RBAC Before() Middleware + Wrap Routes with withRBAC

**Files:**
- Modify: `cmd/fs-chat/main.go`

This is the biggest task — removing the global RBAC middleware and wrapping each route.

- [ ] **Step 1: Remove the RBAC Before() middleware block**

Delete the entire "Role-based access control middleware" `g.Before(func...)` block (approximately lines 477-556 in current main.go).

- [ ] **Step 2: Create a route helper**

At the top of the route registration section, add:

```go
// Helper for RBAC-gated routes
wrap := func(resource string, h fastglue.FastRequestHandler) fastglue.FastRequestHandler {
    return rbac.WithRBAC(app.Enforcer, resource, h)
}
```

- [ ] **Step 3: Wrap all gated routes**

Replace plain route registrations with wrapped versions. Routes NOT wrapped: health, auth, webhooks, ws, ext, /api/me, /api/settings/features, /api/auth/permissions, /api/settings/role-permissions.

```go
// Current User (no gate — all authenticated users)
g.GET("/api/me", app.GetCurrentUser)
g.PUT("/api/me/settings", app.UpdateCurrentUserSettings)
g.PUT("/api/me/password", app.ChangePassword)
g.PUT("/api/me/availability", app.UpdateAvailability)

// User Management
g.GET("/api/users", wrap("users", app.ListUsers))
g.POST("/api/users", wrap("users", app.CreateUser))
g.GET("/api/users/{id}", wrap("users", app.GetUser))
g.PUT("/api/users/{id}", wrap("users", app.UpdateUser))
g.DELETE("/api/users/{id}", wrap("users", app.DeleteUser))

// API Keys
g.GET("/api/api-keys", wrap("api-keys", app.ListAPIKeys))
g.POST("/api/api-keys", wrap("api-keys", app.CreateAPIKey))
g.DELETE("/api/api-keys/{id}", wrap("api-keys", app.DeleteAPIKey))

// Flow API Keys
g.GET("/api/flow-api-keys", wrap("api-keys", app.ListFlowAPIKeys))
g.POST("/api/flow-api-keys", wrap("api-keys", app.CreateFlowAPIKey))
g.GET("/api/flow-api-keys/{id}", wrap("api-keys", app.GetFlowAPIKey))
g.DELETE("/api/flow-api-keys/{id}", wrap("api-keys", app.DeleteFlowAPIKey))

// WhatsApp Accounts
g.GET("/api/accounts", wrap("accounts", app.ListAccounts))
g.POST("/api/accounts", wrap("accounts", app.CreateAccount))
g.GET("/api/accounts/{id}", wrap("accounts", app.GetAccount))
g.PUT("/api/accounts/{id}", wrap("accounts", app.UpdateAccount))
g.DELETE("/api/accounts/{id}", wrap("accounts", app.DeleteAccount))
g.POST("/api/accounts/{id}/test", wrap("accounts", app.TestAccountConnection))

// Embedded Signup
g.GET("/api/embedded-signup/config", wrap("accounts", app.GetEmbeddedSignupConfig))
g.POST("/api/embedded-signup/complete", wrap("accounts", app.CompleteEmbeddedSignup))
g.GET("/api/embedded-signup/status/{id}", wrap("accounts", app.GetEmbeddedSignupStatus))
g.POST("/api/embedded-signup/test-message", wrap("accounts", app.SendEmbeddedSignupTestMessage))

// Instagram Accounts
g.GET("/api/instagram/accounts", wrap("accounts", app.ListInstagramAccounts))
g.POST("/api/instagram/accounts", wrap("accounts", app.CreateInstagramAccount))
g.GET("/api/instagram/accounts/{id}", wrap("accounts", app.GetInstagramAccount))
g.PUT("/api/instagram/accounts/{id}", wrap("accounts", app.UpdateInstagramAccount))
g.DELETE("/api/instagram/accounts/{id}", wrap("accounts", app.DeleteInstagramAccount))
g.POST("/api/instagram/accounts/{id}/test", wrap("accounts", app.TestInstagramAccountConnection))

// Contacts
g.GET("/api/contacts", wrap("contacts", app.ListContacts))
g.POST("/api/contacts", wrap("contacts", app.CreateContact))
g.GET("/api/contacts/{id}", wrap("contacts", app.GetContact))
g.PUT("/api/contacts/{id}", wrap("contacts", app.UpdateContact))
g.DELETE("/api/contacts/{id}", wrap("contacts", app.DeleteContact))
g.PUT("/api/contacts/{id}/assign", wrap("contacts", app.AssignContact))
g.GET("/api/contacts/{id}/session-data", wrap("contacts", app.GetContactSessionData))
g.GET("/api/contacts/{id}/variables", wrap("contacts", app.GetContactVariables))

// Messages (gated by contacts — messages belong to contacts)
g.GET("/api/contacts/{id}/messages", wrap("contacts", app.GetMessages))
g.POST("/api/contacts/{id}/messages", wrap("contacts", app.SendMessage))
g.POST("/api/contacts/{id}/messages/{message_id}/reaction", wrap("contacts", app.SendReaction))
g.POST("/api/messages", wrap("contacts", app.SendMessage))
g.POST("/api/messages/template", wrap("contacts", app.SendTemplateMessage))
g.POST("/api/messages/media", wrap("contacts", app.SendMediaMessage))
g.PUT("/api/messages/{id}/read", wrap("contacts", app.MarkMessageRead))

// Media
g.GET("/api/media/{message_id}", wrap("contacts", app.ServeMedia))

// Templates
g.GET("/api/templates", wrap("templates", app.ListTemplates))
g.POST("/api/templates", wrap("templates", app.CreateTemplate))
g.GET("/api/templates/{id}", wrap("templates", app.GetTemplate))
g.PUT("/api/templates/{id}", wrap("templates", app.UpdateTemplate))
g.DELETE("/api/templates/{id}", wrap("templates", app.DeleteTemplate))
g.POST("/api/templates/sync", wrap("templates", app.SyncTemplates))
g.POST("/api/templates/{id}/publish", wrap("templates", app.SubmitTemplate))
g.POST("/api/templates/upload-media", wrap("templates", app.UploadTemplateMedia))

// WhatsApp Flows
g.GET("/api/flows", wrap("flows", app.ListFlows))
g.POST("/api/flows", wrap("flows", app.CreateFlow))
g.GET("/api/flows/{id}", wrap("flows", app.GetFlow))
g.PUT("/api/flows/{id}", wrap("flows", app.UpdateFlow))
g.DELETE("/api/flows/{id}", wrap("flows", app.DeleteFlow))
g.POST("/api/flows/{id}/save-to-meta", wrap("flows", app.SaveFlowToMeta))
g.POST("/api/flows/{id}/publish", wrap("flows", app.PublishFlow))
g.POST("/api/flows/{id}/deprecate", wrap("flows", app.DeprecateFlow))
g.POST("/api/flows/{id}/duplicate", wrap("flows", app.DuplicateFlow))
g.POST("/api/flows/sync", wrap("flows", app.SyncFlows))

// Bulk Campaigns
g.GET("/api/campaigns", wrap("campaigns", app.ListCampaigns))
g.POST("/api/campaigns", wrap("campaigns", app.CreateCampaign))
g.GET("/api/campaigns/{id}", wrap("campaigns", app.GetCampaign))
g.PUT("/api/campaigns/{id}", wrap("campaigns", app.UpdateCampaign))
g.DELETE("/api/campaigns/{id}", wrap("campaigns", app.DeleteCampaign))
g.POST("/api/campaigns/{id}/start", wrap("campaigns", app.StartCampaign))
g.POST("/api/campaigns/{id}/pause", wrap("campaigns", app.PauseCampaign))
g.POST("/api/campaigns/{id}/cancel", wrap("campaigns", app.CancelCampaign))
g.POST("/api/campaigns/{id}/retry-failed", wrap("campaigns", app.RetryFailed))
g.GET("/api/campaigns/{id}/progress", wrap("campaigns", app.GetCampaign))
g.POST("/api/campaigns/{id}/recipients/import", wrap("campaigns", app.ImportRecipients))
g.GET("/api/campaigns/{id}/recipients", wrap("campaigns", app.GetCampaignRecipients))
g.DELETE("/api/campaigns/{id}/recipients/{recipientId}", wrap("campaigns", app.DeleteCampaignRecipient))
g.POST("/api/campaigns/{id}/media", wrap("campaigns", app.UploadCampaignMedia))
g.GET("/api/campaigns/{id}/media", wrap("campaigns", app.ServeCampaignMedia))

// Chatbot Settings
g.GET("/api/chatbot/settings", wrap("chatbot", app.GetChatbotSettings))
g.PUT("/api/chatbot/settings", wrap("chatbot", app.UpdateChatbotSettings))

// Keyword Rules
g.GET("/api/chatbot/keywords", wrap("chatbot", app.ListKeywordRules))
g.POST("/api/chatbot/keywords", wrap("chatbot", app.CreateKeywordRule))
g.GET("/api/chatbot/keywords/{id}", wrap("chatbot", app.GetKeywordRule))
g.PUT("/api/chatbot/keywords/{id}", wrap("chatbot", app.UpdateKeywordRule))
g.DELETE("/api/chatbot/keywords/{id}", wrap("chatbot", app.DeleteKeywordRule))

// Chatbot Flows
g.GET("/api/chatbot/flows", wrap("chatbot", app.ListChatbotFlows))
g.POST("/api/chatbot/flows", wrap("chatbot", app.CreateChatbotFlow))
g.GET("/api/chatbot/flows/{id}", wrap("chatbot", app.GetChatbotFlow))
g.PUT("/api/chatbot/flows/{id}", wrap("chatbot", app.UpdateChatbotFlow))
g.DELETE("/api/chatbot/flows/{id}", wrap("chatbot", app.DeleteChatbotFlow))
g.POST("/api/chatbot/flows/{id}/send", wrap("chatbot", app.SendFlow))

// AI Contexts
g.GET("/api/chatbot/ai-contexts", wrap("chatbot", app.ListAIContexts))
g.POST("/api/chatbot/ai-contexts", wrap("chatbot", app.CreateAIContext))
g.GET("/api/chatbot/ai-contexts/{id}", wrap("chatbot", app.GetAIContext))
g.PUT("/api/chatbot/ai-contexts/{id}", wrap("chatbot", app.UpdateAIContext))
g.DELETE("/api/chatbot/ai-contexts/{id}", wrap("chatbot", app.DeleteAIContext))

// Agent Transfers (chat feature — agents need this)
g.GET("/api/chatbot/transfers", wrap("chat", app.ListAgentTransfers))
g.POST("/api/chatbot/transfers", wrap("chat", app.CreateAgentTransfer))
g.POST("/api/chatbot/transfers/pick", wrap("chat", app.PickNextTransfer))
g.PUT("/api/chatbot/transfers/{id}/resume", wrap("chat", app.ResumeFromTransfer))
g.PUT("/api/chatbot/transfers/{id}/assign", wrap("chat", app.AssignAgentTransfer))

// Teams
g.GET("/api/teams", wrap("teams", app.ListTeams))
g.POST("/api/teams", wrap("teams", app.CreateTeam))
g.GET("/api/teams/{id}", wrap("teams", app.GetTeam))
g.PUT("/api/teams/{id}", wrap("teams", app.UpdateTeam))
g.DELETE("/api/teams/{id}", wrap("teams", app.DeleteTeam))
g.GET("/api/teams/{id}/members", wrap("teams", app.ListTeamMembers))
g.POST("/api/teams/{id}/members", wrap("teams", app.AddTeamMember))
g.DELETE("/api/teams/{id}/members/{user_id}", wrap("teams", app.RemoveTeamMember))

// Canned Responses (chat feature)
g.GET("/api/canned-responses", wrap("chat", app.ListCannedResponses))
g.POST("/api/canned-responses", wrap("chat", app.CreateCannedResponse))
g.GET("/api/canned-responses/{id}", wrap("chat", app.GetCannedResponse))
g.PUT("/api/canned-responses/{id}", wrap("chat", app.UpdateCannedResponse))
g.DELETE("/api/canned-responses/{id}", wrap("chat", app.DeleteCannedResponse))
g.POST("/api/canned-responses/{id}/use", wrap("chat", app.IncrementCannedResponseUsage))

// Sessions
g.GET("/api/chatbot/sessions", wrap("chatbot", app.ListChatbotSessions))
g.GET("/api/chatbot/sessions/{id}", wrap("chatbot", app.GetChatbotSession))
g.PUT("/api/chatbot/sessions/{id}", wrap("chatbot", app.UpdateChatbotSession))
g.GET("/api/chatbot/api-logs", wrap("chatbot", app.ListApiLogs))

// Magic Flow
g.GET("/api/magic-flow/projects", wrap("flows", app.ListMagicFlowProjects))
g.POST("/api/magic-flow/projects", wrap("flows", app.CreateMagicFlowProject))
g.GET("/api/magic-flow/projects/{id}", wrap("flows", app.GetMagicFlowProject))
g.PUT("/api/magic-flow/projects/{id}", wrap("flows", app.UpdateMagicFlowProject))
g.DELETE("/api/magic-flow/projects/{id}", wrap("flows", app.DeleteMagicFlowProject))
g.GET("/api/magic-flow/projects/{id}/versions", wrap("flows", app.ListMagicFlowVersions))
g.POST("/api/magic-flow/projects/{id}/versions", wrap("flows", app.CreateMagicFlowVersion))
g.POST("/api/magic-flow/projects/{id}/versions/{version_id}/publish", wrap("flows", app.PublishMagicFlowVersion))
g.GET("/api/magic-flow/projects/{id}/draft", wrap("flows", app.GetMagicFlowDraft))
g.PUT("/api/magic-flow/projects/{id}/draft", wrap("flows", app.SaveMagicFlowDraft))
g.DELETE("/api/magic-flow/projects/{id}/draft", wrap("flows", app.DeleteMagicFlowDraft))

// Analytics
g.GET("/api/analytics/dashboard", wrap("analytics", app.GetDashboardStats))
g.GET("/api/analytics/messages", wrap("analytics", app.GetMessageAnalytics))
g.GET("/api/analytics/chatbot", wrap("analytics", app.GetChatbotAnalytics))
g.GET("/api/analytics/agents", wrap("analytics", app.GetAgentAnalytics))
g.GET("/api/analytics/agents/{id}", wrap("analytics", app.GetAgentDetails))
g.GET("/api/analytics/agents/comparison", wrap("analytics", app.GetAgentComparison))

// Organization Settings (no gate — all authenticated)
g.GET("/api/org/settings", app.GetOrganizationSettings)
g.PUT("/api/org/settings", app.UpdateOrganizationSettings)

// SSO Settings
g.GET("/api/settings/sso", wrap("users", app.GetSSOSettings))
g.PUT("/api/settings/sso/{provider}", wrap("users", app.UpdateSSOProvider))
g.DELETE("/api/settings/sso/{provider}", wrap("users", app.DeleteSSOProvider))

// Role permissions (no gate — handler checks admin internally)
g.GET("/api/settings/features", app.GetFeatures)
g.GET("/api/settings/role-permissions", app.GetRolePermissions)
g.PUT("/api/settings/role-permissions/{role_name}", app.UpdateRolePermissions)
g.GET("/api/auth/permissions", app.GetUserPermissions)

// Webhooks
g.GET("/api/webhooks", wrap("users", app.ListWebhooks))
g.POST("/api/webhooks", wrap("users", app.CreateWebhook))
g.GET("/api/webhooks/{id}", wrap("users", app.GetWebhook))
g.PUT("/api/webhooks/{id}", wrap("users", app.UpdateWebhook))
g.DELETE("/api/webhooks/{id}", wrap("users", app.DeleteWebhook))
g.POST("/api/webhooks/{id}/test", wrap("users", app.TestWebhook))

// Custom Actions
g.GET("/api/custom-actions", wrap("users", app.ListCustomActions))
g.POST("/api/custom-actions", wrap("users", app.CreateCustomAction))
g.GET("/api/custom-actions/{id}", wrap("users", app.GetCustomAction))
g.PUT("/api/custom-actions/{id}", wrap("users", app.UpdateCustomAction))
g.DELETE("/api/custom-actions/{id}", wrap("users", app.DeleteCustomAction))
g.POST("/api/custom-actions/{id}/execute", wrap("users", app.ExecuteCustomAction))
g.GET("/api/custom-actions/redirect/{token}", app.CustomActionRedirect) // no gate — uses one-time token

// Catalogs
g.GET("/api/catalogs", wrap("campaigns", app.ListCatalogs))
g.POST("/api/catalogs", wrap("campaigns", app.CreateCatalog))
g.GET("/api/catalogs/{id}", wrap("campaigns", app.GetCatalog))
g.DELETE("/api/catalogs/{id}", wrap("campaigns", app.DeleteCatalog))
g.POST("/api/catalogs/sync", wrap("campaigns", app.SyncCatalogs))
g.GET("/api/catalogs/{id}/products", wrap("campaigns", app.ListCatalogProducts))
g.POST("/api/catalogs/{id}/products", wrap("campaigns", app.CreateCatalogProduct))
g.GET("/api/products/{id}", wrap("campaigns", app.GetCatalogProduct))
g.PUT("/api/products/{id}", wrap("campaigns", app.UpdateCatalogProduct))
g.DELETE("/api/products/{id}", wrap("campaigns", app.DeleteCatalogProduct))
```

- [ ] **Step 4: Remove unused imports**

Remove `strings` if no longer needed (was used by old RBAC middleware), remove `middleware` import if no longer referenced.

- [ ] **Step 5: Build and verify**

```bash
go build ./...
go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add cmd/fs-chat/main.go
git commit -m "feat(casbin): replace RBAC middleware with per-route withRBAC wrappers"
```

---

## Task 6: Update Handlers to Use Casbin

**Files:**
- Modify: `internal/handlers/role_permissions.go`
- Modify: `internal/handlers/auth.go`
- Modify: `internal/handlers/users.go`

- [ ] **Step 1: Update role_permissions.go — use Casbin API**

Replace `GetRolePermissions` to query Casbin:

```go
func (a *App) GetRolePermissions(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	// Get all policies for this org, grouped by role
	type RolePermissions struct {
		Role     string   `json:"role"`
		Features []string `json:"features"`
	}

	roleMap := make(map[string][]string)
	policies := a.Enforcer.GetFilteredPolicy(1, orgID.String())
	for _, p := range policies {
		if len(p) >= 3 {
			role, resource := p[0], p[2]
			roleMap[role] = append(roleMap[role], resource)
		}
	}

	// Deduplicate features per role
	var result []RolePermissions
	for role, features := range roleMap {
		seen := make(map[string]bool)
		var unique []string
		for _, f := range features {
			if !seen[f] {
				seen[f] = true
				unique = append(unique, f)
			}
		}
		result = append(result, RolePermissions{Role: role, Features: unique})
	}

	return r.SendEnvelope(result)
}
```

Replace `UpdateRolePermissions` to use Casbin API:

```go
func (a *App) UpdateRolePermissions(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	role, _ := r.RequestCtx.UserValue("role").(models.Role)
	if role != models.RoleAdmin {
		return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Admin access required", nil, "")
	}

	targetRole, ok := r.RequestCtx.UserValue("role_name").(string)
	if !ok || targetRole == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Role name is required", nil, "")
	}

	var req struct {
		Features []string `json:"features"`
	}
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &req); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}

	for _, f := range req.Features {
		if !rbac.AllowedFeatures[f] {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid feature: "+f, nil, "")
		}
	}

	orgIDStr := orgID.String()

	// Remove all existing policies for this role in this org
	a.Enforcer.RemoveFilteredPolicy(0, targetRole, orgIDStr)

	// Add new policies
	var policies [][]string
	for _, f := range req.Features {
		policies = append(policies, []string{targetRole, orgIDStr, f, "*"})
	}
	if len(policies) > 0 {
		a.Enforcer.AddPolicies(policies)
	}

	return r.SendEnvelope(map[string]interface{}{"role": targetRole, "features": req.Features})
}
```

Add `GetUserPermissionsHandler`:

```go
func (a *App) GetUserPermissionsHandler(r *fastglue.Request) error {
	role, _ := r.RequestCtx.UserValue("role").(models.Role)
	orgID, _ := r.RequestCtx.UserValue("organization_id").(uuid.UUID)
	permissions := rbac.GetUserPermissions(a.Enforcer, string(role), orgID.String())
	return r.SendEnvelope(permissions)
}
```

- [ ] **Step 2: Update auth.go — seed via Casbin**

Replace the seeding block in `Register` handler:

```go
// Seed default role permissions via Casbin
if err := rbac.SeedOrgPolicies(app.Enforcer, org.ID.String()); err != nil {
    tx.Rollback()
    a.Log.Error("Failed to seed role permissions", "error", err, "org_id", org.ID)
    return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to create account", nil, "")
}
```

Remove the old `middleware` import and `org_role_permissions` seeding code.

- [ ] **Step 3: Update users.go — use Enforce()**

Replace `middleware.HasFeature` calls with `enforcer.Enforce`:

```go
// CreateUser
allowed, _ := a.Enforcer.Enforce(string(role), orgID.String(), "users", "POST")
if !allowed {
    return r.SendErrorEnvelope(fasthttp.StatusForbidden, "Access denied", nil, "")
}

// UpdateUser — check if user has write access to users
allowed, _ := a.Enforcer.Enforce(string(currentRole), orgID.String(), "users", "PUT")

// DeleteUser
allowed, _ := a.Enforcer.Enforce(string(currentRole), orgID.String(), "users", "DELETE")
```

- [ ] **Step 4: Register new endpoint in main.go**

```go
g.GET("/api/auth/permissions", app.GetUserPermissionsHandler)
```

- [ ] **Step 5: Build and test**

```bash
go build ./...
go test ./...
```

- [ ] **Step 6: Commit**

```bash
git add internal/handlers/role_permissions.go internal/handlers/auth.go internal/handlers/users.go cmd/fs-chat/main.go
git commit -m "feat(casbin): update handlers to use Casbin API for CRUD and seeding"
```

---

## Task 7: Frontend — Update Feature Names + Permissions Endpoint

**Files:**
- Modify: `magic-flow/lib/permissions.ts`
- Modify: `magic-flow/contexts/auth-context.tsx`
- Modify: `magic-flow/components/app-sidebar.tsx`
- Modify: `magic-flow/app/(dashboard)/settings/*/layout.tsx` (all 6)

- [ ] **Step 1: Update feature names in permissions.ts**

Remove `settings.` prefix from all features:

```typescript
export const FEATURES = [
  "flows", "templates", "chat", "campaigns", "contacts", "analytics",
  "accounts", "users", "teams", "chatbot", "api-keys",
] as const

export const DEFAULT_ROLE_FEATURES: Record<Role, Feature[]> = {
  admin: ["flows", "templates", "chat", "campaigns", "contacts", "analytics",
          "accounts", "users", "teams", "chatbot", "api-keys"],
  manager: ["flows", "templates", "chat", "campaigns", "contacts", "analytics",
            "accounts", "teams", "chatbot"],
  agent: ["chat", "contacts"],
}
```

- [ ] **Step 2: Update AuthProvider to fetch /api/auth/permissions**

In `contexts/auth-context.tsx`:

```typescript
const { data: apiPermissions } = useQuery({
  queryKey: ["auth", "permissions"],
  queryFn: () => apiClient.get<string[]>("/api/auth/permissions"),
  enabled: !!user,
  staleTime: 5 * 60 * 1000,
})

const permissions = useMemo(
  () => apiPermissions ?? DEFAULT_ROLE_FEATURES[role] ?? [],
  [apiPermissions, role]
)
```

Remove the old `rolePermissionKeys` import and the `find(r => r.role === user?.role)?.features` logic.

- [ ] **Step 3: Update sidebar feature names**

In `components/app-sidebar.tsx`, update all `feature` fields:

```typescript
const SETTINGS_CHILDREN = [
  { label: "Accounts", icon: Phone, path: "/settings/accounts", feature: "accounts" },
  { label: "Users", icon: Users, path: "/settings/users", feature: "users" },
  { label: "Teams", icon: Users, path: "/settings/teams", feature: "teams" },
  { label: "Chatbot", icon: Bot, path: "/settings/chatbot", feature: "chatbot" },
  { label: "API Keys", icon: Key, path: "/settings/api-keys", feature: "api-keys" },
  { label: "Roles", icon: Shield, path: "/settings/roles", feature: "users" },
]
```

- [ ] **Step 4: Update FeatureGate layout files**

Update all 8 layout files to use flat feature names:

- `settings/accounts/layout.tsx` → `feature="accounts"`
- `settings/users/layout.tsx` → `feature="users"`
- `settings/teams/layout.tsx` → `feature="teams"`
- `settings/chatbot/layout.tsx` → `feature="chatbot"`
- `settings/api-keys/layout.tsx` → `feature="api-keys"`
- `settings/roles/layout.tsx` → `feature="users"`
- `flows/layout.tsx` → `feature="flows"` (unchanged)
- `templates/layout.tsx` → `feature="templates"` (unchanged)
- `flow-templates/layout.tsx` → `feature="flows"` (unchanged)

- [ ] **Step 5: Update tests**

Update `lib/__tests__/permissions.test.ts` to use flat feature names.

- [ ] **Step 6: Build and test**

```bash
npx tsc --noEmit && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
git add lib/permissions.ts contexts/auth-context.tsx components/app-sidebar.tsx app/
git commit -m "feat(casbin): update frontend to flat feature names and /api/auth/permissions"
```

---

## Task 8: Integration Test

- [ ] **Step 1: Rebuild both containers**

```bash
# fs-whatsapp
cd /path/to/fs-whatsapp/docker && docker compose -f docker-compose.dev.yml up --build -d

# magic-flow
cd /path/to/magic-flow && docker compose down && docker compose up --build -V -d
```

- [ ] **Step 2: Verify migration ran**

Check logs for "Migration complete" and verify casbin_rule table has data.

- [ ] **Step 3: Test as admin**

- All sidebar items visible
- Roles page shows all features with flat names
- Toggle a feature, save, verify it persists

- [ ] **Step 4: Test as manager**

- Correct sidebar items
- Toggle removed features show "Access Restricted"
- API calls return 403 for removed features

- [ ] **Step 5: Test action-level (managers and users endpoint)**

- Manager can GET `/api/users` (for Teams page)
- Manager cannot POST `/api/users` (create user)
- Manager cannot DELETE `/api/users/{id}` (delete user)

- [ ] **Step 6: Run all lints and tests**

```bash
# Go
cd /path/to/fs-whatsapp && go test ./...

# React
cd /path/to/magic-flow && npx tsc --noEmit && npx vitest run
```

---

## Task 9: Cleanup (Phase 4 — After Verification)

Only after 1-2 sprints of verification.

- [ ] **Step 1: Delete old RBAC code**

```bash
rm internal/middleware/rbac.go
rm internal/models/org_role_permission.go
```

- [ ] **Step 2: Remove from migration models**

In `internal/database/postgres.go`, remove `OrgRolePermission` from `GetMigrationModels()`.

- [ ] **Step 3: Drop old table**

```sql
DROP TABLE IF EXISTS org_role_permissions;
```

- [ ] **Step 4: Remove feature flag if added**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(casbin): remove legacy RBAC code and org_role_permissions table"
```

---

## Task 10 (Optional): Custom Role Creation UI

- [ ] **Step 1: Add "Create Role" button to Roles page**

- [ ] **Step 2: Dialog with name input + feature checkboxes**

Reuse existing table row UI. Role name input + checkbox grid.

- [ ] **Step 3: Save handler**

```typescript
const createRole = useMutation({
  mutationFn: ({ name, features }: { name: string; features: string[] }) =>
    apiClient.post("/api/settings/role-permissions", { role: name, features }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: rolePermissionKeys.all }),
})
```

- [ ] **Step 4: Backend — add POST endpoint for custom roles**

```go
func (a *App) CreateCustomRole(r *fastglue.Request) error {
    // Validate admin, parse name + features, AddPolicies
}
```

- [ ] **Step 5: Users page — show custom roles in role dropdown**

Fetch roles from `/api/settings/role-permissions` and include custom role names in the Select dropdown.
