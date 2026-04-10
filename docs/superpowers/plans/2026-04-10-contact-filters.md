# Contact Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cascader-based contact filtering by tags, flow membership, and flow variables — with a reusable backend API.

**Architecture:** Backend-first (fs-whatsapp): new handler with `POST /api/contacts/filter`, `GET /api/contacts/tags`, `GET /api/contacts/variables`, plus required indexes. Frontend (magic-flow): cascader filter component in chat sidebar, React Query hooks, filter chips.

**Tech Stack:** Go (Fastglue, GORM, PostgreSQL JSONB), React 18, TanStack React Query, shadcn/ui (Popover, Command, Badge).

**Spec:** `docs/superpowers/specs/2026-04-10-contact-filters-design.md`

---

## File Map

### Backend (fs-whatsapp):
- **Create:** `internal/handlers/contact_filters.go` — FilterContacts, ListContactTags, ListContactVariables handlers
- **Modify:** `internal/database/postgres.go` — add GIN index on tags, composite index on sessions
- **Modify:** `cmd/fs-chat/main.go` — register 3 new routes
- **Test:** `internal/handlers/contact_filters_test.go` — handler tests

### Frontend (magic-flow):
- **Create:** `components/chat/contact-list/contact-filter.tsx` — filter button, cascader, chips
- **Create:** `hooks/queries/use-contact-filters.ts` — useContactTags, useContactVariables, useFilteredContacts
- **Modify:** `hooks/queries/query-keys.ts` — add filter keys
- **Modify:** `components/chat/contact-list/contact-list.tsx` — integrate filter, switch to POST when active
- **Modify:** `types/chat.ts` — add ContactFilter type

---

## Task 1: Backend — Indexes

**Files:**
- Modify: `fs-whatsapp/internal/database/postgres.go`

- [ ] **Step 1: Add new indexes to CreateIndexes()**

In the `indexes` slice inside `CreateIndexes()`, add after the existing contacts indexes block (after line 266):

```go
		// Contact filter indexes
		`CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON contacts USING GIN (tags)`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_contact_flow ON chatbot_sessions(contact_id, current_flow_id, status)`,
```

Also add them to the `getIndexes()` function (the duplicate list used during migration) in the same position.

- [ ] **Step 2: Build and verify**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && go build ./...`
Expected: Success

- [ ] **Step 3: Restart backend to apply indexes**

Run: `docker restart fschat_app_dev`

Check logs for any migration errors: `docker logs fschat_app_dev --tail 20 2>&1 | grep -i "index\|error"`

- [ ] **Step 4: Commit**

```bash
git add internal/database/postgres.go
git commit -m "feat: add GIN index on contacts.tags and session contact-flow index for filters"
```

---

## Task 2: Backend — Tags & Variables Endpoints

**Files:**
- Create: `fs-whatsapp/internal/handlers/contact_filters.go`
- Modify: `fs-whatsapp/cmd/fs-chat/main.go`

- [ ] **Step 1: Create contact_filters.go with tags and variables handlers**

```go
package handlers

import (
	"github.com/freestandtech/fs-chat/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
)

// ListContactTags returns all unique tags across contacts in the org.
func (a *App) ListContactTags(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	var tags []string
	if err := a.DB.Raw(`
		SELECT DISTINCT jsonb_array_elements_text(tags) AS tag
		FROM contacts
		WHERE organization_id = ?
			AND tags IS NOT NULL
			AND tags != '[]'::jsonb
			AND jsonb_typeof(tags) = 'array'
			AND deleted_at IS NULL
		ORDER BY tag
	`, orgID).Scan(&tags).Error; err != nil {
		a.Log.Error("Failed to list contact tags", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list tags", nil, "")
	}

	return r.SendEnvelope(map[string]any{
		"tags": tags,
	})
}

// ListContactVariables returns unique variable names for a flow in the org.
func (a *App) ListContactVariables(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	flowSlug := string(r.RequestCtx.QueryArgs().Peek("flow_slug"))
	if flowSlug == "" {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "flow_slug is required", nil, "")
	}

	var variables []string
	if err := a.DB.Raw(`
		SELECT DISTINCT cv.variable_name
		FROM contact_variables cv
		JOIN contacts c ON cv.contact_id = c.id
		WHERE c.organization_id = ? AND cv.flow_slug = ? AND c.deleted_at IS NULL
		ORDER BY cv.variable_name
	`, orgID, flowSlug).Scan(&variables).Error; err != nil {
		a.Log.Error("Failed to list contact variables", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to list variables", nil, "")
	}

	return r.SendEnvelope(map[string]any{
		"variables": variables,
	})
}
```

- [ ] **Step 2: Register routes in main.go**

Add after the existing contacts routes (after line 611):

```go
	g.GET("/api/contacts/tags", app.ListContactTags)
	g.GET("/api/contacts/variables", app.ListContactVariables)
```

**Important:** These must be registered BEFORE the `g.GET("/api/contacts/{id}", ...)` route, otherwise `/api/contacts/tags` would match as `{id} = "tags"`. Check the existing order and place these new routes between `g.GET("/api/contacts", ...)` and `g.GET("/api/contacts/{id}", ...)`.

- [ ] **Step 3: Build and test manually**

Run: `go build ./...`
Expected: Success

Run: `docker restart fschat_app_dev`

Test:
```bash
# Replace TOKEN with a valid JWT
curl -H "Authorization: Bearer TOKEN" http://localhost:8080/api/contacts/tags
curl -H "Authorization: Bearer TOKEN" "http://localhost:8080/api/contacts/variables?flow_slug=YOUR_FLOW_SLUG"
```

- [ ] **Step 4: Commit**

```bash
git add internal/handlers/contact_filters.go cmd/fs-chat/main.go
git commit -m "feat: add GET /api/contacts/tags and /api/contacts/variables endpoints"
```

---

## Task 3: Backend — Filter Contacts Endpoint

**Files:**
- Modify: `fs-whatsapp/internal/handlers/contact_filters.go`
- Modify: `fs-whatsapp/cmd/fs-chat/main.go`

- [ ] **Step 1: Add FilterContacts handler**

Add to `contact_filters.go`:

```go
import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/freestandtech/fs-chat/internal/models"
	"github.com/valyala/fasthttp"
	"github.com/zerodha/fastglue"
	"gorm.io/gorm"
)

// FilterContactsRequest represents the request body for filtering contacts.
type FilterContactsRequest struct {
	Search  string          `json:"search"`
	Channel string          `json:"channel"`
	Filters []ContactFilter `json:"filters"`
	Page    int             `json:"page"`
	Limit   int             `json:"limit"`
	Sort    string          `json:"sort"`
}

// ContactFilter represents a single filter condition.
type ContactFilter struct {
	Type     string   `json:"type"`                // "tag", "flow", "variable"
	Op       string   `json:"op"`                  // operator
	Value    string   `json:"value,omitempty"`      // variable value
	Values   []string `json:"values,omitempty"`     // tag names (multi-select)
	FlowSlug string   `json:"flow_slug,omitempty"`  // for flow and variable filters
	Name     string   `json:"name,omitempty"`       // variable name
}

// Valid sort fields (whitelist to prevent SQL injection)
var validSortFields = map[string]string{
	"last_message_at": "last_message_at DESC NULLS LAST, created_at DESC",
	"created_at":      "created_at DESC",
	"profile_name":    "profile_name ASC",
}

// FilterContacts handles POST /api/contacts/filter
func (a *App) FilterContacts(r *fastglue.Request) error {
	orgID, err := getOrganizationID(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}
	userID, _ := r.RequestCtx.UserValue("user_id").(uuid.UUID)
	userRole, _ := r.RequestCtx.UserValue("role").(models.Role)

	var req FilterContactsRequest
	if err := json.Unmarshal(r.RequestCtx.PostBody(), &req); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}

	// Defaults
	if req.Page < 1 {
		req.Page = 1
	}
	if req.Limit < 1 || req.Limit > 100 {
		req.Limit = 20
	}

	// Validate sort
	sortOrder, ok := validSortFields[req.Sort]
	if !ok {
		sortOrder = validSortFields["last_message_at"]
	}

	// Validate filters
	if err := validateFilters(req.Filters); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, err.Error(), nil, "")
	}

	offset := (req.Page - 1) * req.Limit

	// Build query
	query := a.DB.Where("organization_id = ? AND deleted_at IS NULL", orgID)

	// Role-based scoping
	if userRole == models.RoleAgent {
		query = query.Where("assigned_user_id = ?", userID)
	}

	// Channel filter
	if req.Channel != "" {
		query = query.Where("channel = ?", req.Channel)
	}

	// Search
	if req.Search != "" {
		searchPattern := "%" + req.Search + "%"
		query = query.Where("phone_number ILIKE ? OR profile_name ILIKE ? OR channel_identifier ILIKE ?",
			searchPattern, searchPattern, searchPattern)
	}

	// Apply filters
	for _, f := range req.Filters {
		query = applyFilter(query, f, orgID)
	}

	// Count total
	var total int64
	query.Model(&models.Contact{}).Count(&total)

	// Fetch contacts
	var contacts []models.Contact
	if err := query.Order(sortOrder).Offset(offset).Limit(req.Limit).Find(&contacts).Error; err != nil {
		a.Log.Error("Failed to filter contacts", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to filter contacts", nil, "")
	}

	// Check if phone masking is enabled
	shouldMask := a.ShouldMaskPhoneNumbers(orgID)

	// Convert to response (same format as ListContacts)
	response := make([]ContactResponse, len(contacts))
	for i, c := range contacts {
		var unreadCount int64
		a.DB.Model(&models.Message{}).
			Where("contact_id = ? AND direction = ? AND status != ?", c.ID, models.DirectionIncoming, models.MessageStatusRead).
			Count(&unreadCount)

		tags := []string{}
		if c.Tags != nil {
			for _, t := range c.Tags {
				if s, ok := t.(string); ok {
					tags = append(tags, s)
				}
			}
		}

		phoneNumber := c.PhoneNumber
		profileName := c.ProfileName
		if shouldMask {
			phoneNumber = MaskPhoneNumber(phoneNumber)
			profileName = MaskIfPhoneNumber(profileName)
		}

		contactChannel := c.Channel
		if contactChannel == "" {
			contactChannel = models.ChannelWhatsApp
		}

		response[i] = ContactResponse{
			ID:                 c.ID,
			Channel:            contactChannel,
			ChannelIdentifier:  c.ChannelIdentifier,
			PhoneNumber:        phoneNumber,
			Name:               profileName,
			ProfileName:        c.ProfileName,
			AvatarURL:          c.AvatarURL,
			Status:             c.Status,
			Tags:               tags,
			CustomFields:       c.Metadata,
			LastMessageAt:      c.LastMessageAt,
			LastMessagePreview: c.LastMessagePreview,
			UnreadCount:        int(unreadCount),
			AssignedUserID:     c.AssignedUserID,
			CreatedAt:          c.CreatedAt,
			UpdatedAt:          c.UpdatedAt,
		}
	}

	return r.SendEnvelope(map[string]any{
		"contacts": response,
		"total":    total,
		"page":     req.Page,
		"limit":    req.Limit,
	})
}

// applyFilter adds a single filter condition to the query.
func applyFilter(query *gorm.DB, f ContactFilter, orgID uuid.UUID) *gorm.DB {
	switch f.Type {
	case "tag":
		return applyTagFilter(query, f)
	case "flow":
		return applyFlowFilter(query, f, orgID)
	case "variable":
		return applyVariableFilter(query, f)
	default:
		return query
	}
}

func applyTagFilter(query *gorm.DB, f ContactFilter) *gorm.DB {
	if len(f.Values) == 0 {
		return query
	}

	switch f.Op {
	case "is":
		// OR: contact has ANY of these tags
		conditions := make([]string, len(f.Values))
		args := make([]any, len(f.Values))
		for i, tag := range f.Values {
			conditions[i] = "tags @> ?::jsonb"
			tagJSON, _ := json.Marshal([]string{tag})
			args[i] = string(tagJSON)
		}
		return query.Where("("+strings.Join(conditions, " OR ")+")", args...)

	case "isnt":
		// AND: contact has NONE of these tags
		for _, tag := range f.Values {
			tagJSON, _ := json.Marshal([]string{tag})
			query = query.Where("NOT (tags @> ?::jsonb)", string(tagJSON))
		}
		return query

	default:
		return query
	}
}

func applyFlowFilter(query *gorm.DB, f ContactFilter, orgID uuid.UUID) *gorm.DB {
	if f.FlowSlug == "" {
		return query
	}

	subquery := `
		SELECT 1 FROM chatbot_sessions cs
		JOIN chatbot_flows cf ON cs.current_flow_id = cf.id
		WHERE cs.contact_id = contacts.id
			AND cf.flow_slug = ?
			AND cs.organization_id = ?
			AND cs.deleted_at IS NULL
	`

	switch f.Op {
	case "is_in":
		return query.Where("EXISTS ("+subquery+" AND cs.status = 'active')", f.FlowSlug, orgID)
	case "was_in":
		return query.Where("EXISTS ("+subquery+")", f.FlowSlug, orgID)
	case "isnt_in":
		return query.Where("NOT EXISTS ("+subquery+")", f.FlowSlug, orgID)
	default:
		return query
	}
}

func applyVariableFilter(query *gorm.DB, f ContactFilter) *gorm.DB {
	if f.FlowSlug == "" || f.Name == "" {
		return query
	}

	base := "SELECT 1 FROM contact_variables cv WHERE cv.contact_id = contacts.id AND cv.flow_slug = ? AND cv.variable_name = ?"

	switch f.Op {
	case "is":
		return query.Where("EXISTS ("+base+" AND cv.value = ?)", f.FlowSlug, f.Name, f.Value)
	case "isnt":
		return query.Where("NOT EXISTS ("+base+" AND cv.value = ?)", f.FlowSlug, f.Name, f.Value)
	case "has_any_value":
		return query.Where("EXISTS ("+base+" AND cv.value != '')", f.FlowSlug, f.Name)
	case "contains":
		return query.Where("EXISTS ("+base+" AND cv.value ILIKE ?)", f.FlowSlug, f.Name, "%"+f.Value+"%")
	case "is_unknown":
		return query.Where("NOT EXISTS ("+base+" AND cv.value != '')", f.FlowSlug, f.Name)
	default:
		return query
	}
}

// validateFilters validates all filters in the request.
func validateFilters(filters []ContactFilter) error {
	for i, f := range filters {
		switch f.Type {
		case "tag":
			if f.Op != "is" && f.Op != "isnt" {
				return fmt.Errorf("filter[%d]: tag operator must be 'is' or 'isnt', got '%s'", i, f.Op)
			}
			if len(f.Values) == 0 {
				return fmt.Errorf("filter[%d]: tag filter requires at least one value in 'values'", i)
			}
		case "flow":
			validOps := map[string]bool{"is_in": true, "was_in": true, "isnt_in": true}
			if !validOps[f.Op] {
				return fmt.Errorf("filter[%d]: flow operator must be 'is_in', 'was_in', or 'isnt_in', got '%s'", i, f.Op)
			}
			if f.FlowSlug == "" {
				return fmt.Errorf("filter[%d]: flow filter requires 'flow_slug'", i)
			}
		case "variable":
			validOps := map[string]bool{"is": true, "isnt": true, "has_any_value": true, "contains": true, "is_unknown": true}
			if !validOps[f.Op] {
				return fmt.Errorf("filter[%d]: variable operator must be 'is', 'isnt', 'has_any_value', 'contains', or 'is_unknown', got '%s'", i, f.Op)
			}
			if f.FlowSlug == "" || f.Name == "" {
				return fmt.Errorf("filter[%d]: variable filter requires 'flow_slug' and 'name'", i)
			}
			if (f.Op == "is" || f.Op == "isnt" || f.Op == "contains") && f.Value == "" {
				return fmt.Errorf("filter[%d]: variable operator '%s' requires 'value'", i, f.Op)
			}
		default:
			return fmt.Errorf("filter[%d]: unknown filter type '%s'", i, f.Type)
		}
	}
	return nil
}
```

- [ ] **Step 2: Register the filter route in main.go**

Add after the tags/variables routes:

```go
	g.POST("/api/contacts/filter", app.FilterContacts)
```

- [ ] **Step 3: Build and test**

Run: `go build ./...`
Expected: Success

Run: `go test ./internal/handlers/ -run TestFilter -v` (if tests exist) or manual curl:
```bash
curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"filters":[{"type":"tag","op":"is","values":["sampled"]}],"page":1,"limit":20}' \
  http://localhost:8080/api/contacts/filter
```

- [ ] **Step 4: Run all tests**

Run: `go test ./... 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add internal/handlers/contact_filters.go cmd/fs-chat/main.go
git commit -m "feat: add POST /api/contacts/filter with tag, flow, and variable filters"
```

---

## Task 4: Backend — Tests

**Files:**
- Create: `fs-whatsapp/internal/handlers/contact_filters_test.go`

- [ ] **Step 1: Write validation tests**

```go
package handlers

import (
	"testing"
)

func TestValidateFilters(t *testing.T) {
	tests := []struct {
		name    string
		filters []ContactFilter
		wantErr bool
	}{
		{
			name:    "empty filters is valid",
			filters: []ContactFilter{},
			wantErr: false,
		},
		{
			name:    "valid tag filter",
			filters: []ContactFilter{{Type: "tag", Op: "is", Values: []string{"sampled"}}},
			wantErr: false,
		},
		{
			name:    "tag filter without values",
			filters: []ContactFilter{{Type: "tag", Op: "is"}},
			wantErr: true,
		},
		{
			name:    "tag filter with invalid op",
			filters: []ContactFilter{{Type: "tag", Op: "is_in", Values: []string{"x"}}},
			wantErr: true,
		},
		{
			name:    "valid flow filter",
			filters: []ContactFilter{{Type: "flow", Op: "is_in", FlowSlug: "test"}},
			wantErr: false,
		},
		{
			name:    "flow filter without slug",
			filters: []ContactFilter{{Type: "flow", Op: "is_in"}},
			wantErr: true,
		},
		{
			name:    "valid variable filter with value",
			filters: []ContactFilter{{Type: "variable", Op: "is", FlowSlug: "test", Name: "city", Value: "Mumbai"}},
			wantErr: false,
		},
		{
			name:    "variable filter is without value",
			filters: []ContactFilter{{Type: "variable", Op: "is", FlowSlug: "test", Name: "city"}},
			wantErr: true,
		},
		{
			name:    "variable filter has_any_value without value is ok",
			filters: []ContactFilter{{Type: "variable", Op: "has_any_value", FlowSlug: "test", Name: "city"}},
			wantErr: false,
		},
		{
			name:    "variable filter without name",
			filters: []ContactFilter{{Type: "variable", Op: "is", FlowSlug: "test", Value: "x"}},
			wantErr: true,
		},
		{
			name:    "unknown filter type",
			filters: []ContactFilter{{Type: "unknown", Op: "is"}},
			wantErr: true,
		},
		{
			name: "multiple valid filters",
			filters: []ContactFilter{
				{Type: "tag", Op: "is", Values: []string{"sampled", "vip"}},
				{Type: "flow", Op: "was_in", FlowSlug: "registration"},
				{Type: "variable", Op: "contains", FlowSlug: "registration", Name: "city", Value: "Mum"},
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateFilters(tt.filters)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateFilters() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidSortFields(t *testing.T) {
	if _, ok := validSortFields["last_message_at"]; !ok {
		t.Error("last_message_at must be a valid sort field")
	}
	if _, ok := validSortFields["created_at"]; !ok {
		t.Error("created_at must be a valid sort field")
	}
	if _, ok := validSortFields["profile_name"]; !ok {
		t.Error("profile_name must be a valid sort field")
	}
	if _, ok := validSortFields["'; DROP TABLE contacts; --"]; ok {
		t.Error("SQL injection string should not be a valid sort field")
	}
}
```

- [ ] **Step 2: Run tests**

Run: `go test ./internal/handlers/ -run TestValidateFilters -v`
Expected: All PASS

Run: `go test ./internal/handlers/ -run TestValidSortFields -v`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add internal/handlers/contact_filters_test.go
git commit -m "test: add validation tests for contact filter handler"
```

---

## Task 5: Frontend — Types + Query Keys + Hooks

**Files:**
- Modify: `magic-flow/types/chat.ts`
- Modify: `magic-flow/hooks/queries/query-keys.ts`
- Create: `magic-flow/hooks/queries/use-contact-filters.ts`

- [ ] **Step 1: Add ContactFilter type to types/chat.ts**

Add at the end of the file:

```ts
export interface ContactFilter {
  type: "tag" | "flow" | "variable"
  op: string
  value?: string
  values?: string[]
  flowSlug?: string
  flowName?: string  // display only, not sent to API
  name?: string
}
```

- [ ] **Step 2: Add query keys**

In `hooks/queries/query-keys.ts`:

```ts
export const filterKeys = {
  all: ["filters"] as const,
  tags: () => [...filterKeys.all, "tags"] as const,
  variables: (flowSlug: string) => [...filterKeys.all, "variables", flowSlug] as const,
  contacts: (filters: any) => [...contactKeys.all, "filtered", filters] as const,
}
```

- [ ] **Step 3: Create use-contact-filters.ts**

```ts
import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { filterKeys } from "./query-keys"
import type { ContactFilter, ContactsResponse } from "@/types/chat"

const PAGE_SIZE = 20

export function useContactTags() {
  return useQuery({
    queryKey: filterKeys.tags(),
    queryFn: () => apiClient.get<{ tags: string[] }>("/api/contacts/tags"),
    staleTime: 60 * 1000, // 1 min — tags don't change often
  })
}

export function useContactVariables(flowSlug: string) {
  return useQuery({
    queryKey: filterKeys.variables(flowSlug),
    queryFn: () =>
      apiClient.get<{ variables: string[] }>(
        `/api/contacts/variables?flow_slug=${encodeURIComponent(flowSlug)}`
      ),
    enabled: !!flowSlug,
    staleTime: 60 * 1000,
  })
}

export function useFilteredContacts(
  filters: ContactFilter[],
  options: { search?: string; channel?: string | null }
) {
  const { search, channel } = options

  return useInfiniteQuery({
    queryKey: filterKeys.contacts({ filters, search, channel }),
    queryFn: async ({ pageParam = 1 }) => {
      // Strip display-only fields before sending
      const apiFilters = filters.map(({ flowName, ...rest }) => rest)

      return apiClient.fetch<ContactsResponse>("/api/contacts/filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: apiFilters,
          search: search || "",
          channel: channel || "",
          page: pageParam,
          limit: PAGE_SIZE,
          sort: "last_message_at",
        }),
      })
    },
    getNextPageParam: (lastPage) =>
      lastPage.contacts.length === PAGE_SIZE ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: filters.length > 0,
  })
}
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add types/chat.ts hooks/queries/query-keys.ts hooks/queries/use-contact-filters.ts
git commit -m "feat(chat): add ContactFilter type, query keys, and filter hooks"
```

---

## Task 6: Frontend — Contact Filter Component

**Files:**
- Create: `magic-flow/components/chat/contact-list/contact-filter.tsx`

This is the main cascader UI. It renders:
1. A "+ Filter" button (with count badge when active)
2. A cascader Popover for building filters
3. Removable filter chips

- [ ] **Step 1: Create contact-filter.tsx**

```tsx
"use client"

import { useState, useCallback } from "react"
import { Filter, X, ChevronRight, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useContactTags, useContactVariables } from "@/hooks/queries/use-contact-filters"
import { useChatbotFlows } from "@/hooks/queries/use-chatbot-flows"
import { cn } from "@/lib/utils"
import type { ContactFilter } from "@/types/chat"

// Cascader steps
type CascaderStep =
  | { type: "root" }
  | { type: "tag_op" }
  | { type: "tag_select"; op: string }
  | { type: "flow_op" }
  | { type: "flow_select"; op: string }
  | { type: "var_flow" }
  | { type: "var_name"; flowSlug: string; flowName: string }
  | { type: "var_op"; flowSlug: string; flowName: string; name: string }
  | { type: "var_value"; flowSlug: string; flowName: string; name: string; op: string }

interface ContactFilterProps {
  filters: ContactFilter[]
  onFiltersChange: (filters: ContactFilter[]) => void
}

export function ContactFilterBar({ filters, onFiltersChange }: ContactFilterProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<CascaderStep>({ type: "root" })
  const [search, setSearch] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const resetCascader = useCallback(() => {
    setStep({ type: "root" })
    setSearch("")
    setSelectedTags([])
  }, [])

  const addFilter = useCallback((filter: ContactFilter) => {
    onFiltersChange([...filters, filter])
    setOpen(false)
    resetCascader()
  }, [filters, onFiltersChange, resetCascader])

  const removeFilter = useCallback((index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index))
  }, [filters, onFiltersChange])

  const applyTagFilter = useCallback((op: string) => {
    if (selectedTags.length === 0) return
    addFilter({ type: "tag", op, values: selectedTags })
    setSelectedTags([])
  }, [selectedTags, addFilter])

  return (
    <div className="px-3 pb-2">
      <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetCascader() }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs cursor-pointer gap-1">
              <Filter className="h-3 w-3" />
              Filter
              {filters.length > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                  {filters.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="start" className="w-64 p-0">
            <CascaderPanel
              step={step}
              setStep={setStep}
              search={search}
              setSearch={setSearch}
              selectedTags={selectedTags}
              setSelectedTags={setSelectedTags}
              onAddFilter={addFilter}
              onApplyTagFilter={applyTagFilter}
            />
          </PopoverContent>
        </Popover>

        {filters.length > 0 && (
          <button
            onClick={() => onFiltersChange([])}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter chips */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {filters.map((filter, index) => (
            <FilterChip key={index} filter={filter} onRemove={() => removeFilter(index)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({ filter, onRemove }: { filter: ContactFilter; onRemove: () => void }) {
  let label = ""
  let tooltip = ""

  switch (filter.type) {
    case "tag":
      label = `Tag ${filter.op === "is" ? "is" : "isn't"} "${(filter.values ?? []).join(", ")}"`
      break
    case "flow":
      const flowOps: Record<string, string> = { is_in: "is in", was_in: "was in", isnt_in: "isn't in" }
      label = `Flow ${flowOps[filter.op] ?? filter.op} "${filter.flowName ?? filter.flowSlug}"`
      break
    case "variable":
      label = `${filter.name} ${filter.op} ${filter.value ? `"${filter.value}"` : ""}`
      tooltip = `${filter.flowSlug} / ${filter.name} ${filter.op} ${filter.value ?? ""}`
      break
  }

  return (
    <span
      className="inline-flex items-center gap-1 bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs"
      title={tooltip || label}
    >
      <span className="truncate max-w-[180px]">{label}</span>
      <button onClick={onRemove} className="hover:text-foreground cursor-pointer">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function CascaderPanel({
  step, setStep, search, setSearch, selectedTags, setSelectedTags, onAddFilter, onApplyTagFilter,
}: {
  step: CascaderStep
  setStep: (s: CascaderStep) => void
  search: string
  setSearch: (s: string) => void
  selectedTags: string[]
  setSelectedTags: (t: string[]) => void
  onAddFilter: (f: ContactFilter) => void
  onApplyTagFilter: (op: string) => void
}) {
  switch (step.type) {
    case "root":
      return (
        <CascaderList items={[
          { label: "Tag", onClick: () => setStep({ type: "tag_op" }) },
          { label: "Flow", onClick: () => setStep({ type: "flow_op" }) },
          { label: "Variable", onClick: () => setStep({ type: "var_flow" }) },
        ]} />
      )

    case "tag_op":
      return (
        <CascaderList items={[
          { label: "is", onClick: () => setStep({ type: "tag_select", op: "is" }) },
          { label: "isn't", onClick: () => setStep({ type: "tag_select", op: "isnt" }) },
        ]} />
      )

    case "tag_select":
      return (
        <TagSelector
          op={step.op}
          search={search}
          setSearch={setSearch}
          selectedTags={selectedTags}
          setSelectedTags={setSelectedTags}
          onApply={() => onApplyTagFilter(step.op)}
        />
      )

    case "flow_op":
      return (
        <CascaderList items={[
          { label: "is in", onClick: () => setStep({ type: "flow_select", op: "is_in" }) },
          { label: "was in", onClick: () => setStep({ type: "flow_select", op: "was_in" }) },
          { label: "isn't in", onClick: () => setStep({ type: "flow_select", op: "isnt_in" }) },
        ]} />
      )

    case "flow_select":
      return (
        <FlowSelector
          search={search}
          setSearch={setSearch}
          onSelect={(slug, name) => {
            onAddFilter({ type: "flow", op: step.op, flowSlug: slug, flowName: name })
          }}
        />
      )

    case "var_flow":
      return (
        <FlowSelector
          search={search}
          setSearch={setSearch}
          onSelect={(slug, name) => setStep({ type: "var_name", flowSlug: slug, flowName: name })}
        />
      )

    case "var_name":
      return (
        <VariableNameSelector
          flowSlug={step.flowSlug}
          search={search}
          setSearch={setSearch}
          onSelect={(name) => setStep({ type: "var_op", flowSlug: step.flowSlug, flowName: step.flowName, name })}
        />
      )

    case "var_op":
      return (
        <CascaderList items={[
          { label: "is", onClick: () => setStep({ type: "var_value", ...step, op: "is" }) },
          { label: "isn't", onClick: () => setStep({ type: "var_value", ...step, op: "isnt" }) },
          { label: "has any value", onClick: () => onAddFilter({ type: "variable", op: "has_any_value", flowSlug: step.flowSlug, flowName: step.flowName, name: step.name }) },
          { label: "contains", onClick: () => setStep({ type: "var_value", ...step, op: "contains" }) },
          { label: "is unknown", onClick: () => onAddFilter({ type: "variable", op: "is_unknown", flowSlug: step.flowSlug, flowName: step.flowName, name: step.name }) },
        ]} />
      )

    case "var_value":
      return (
        <ValueInput
          onApply={(value) => {
            onAddFilter({ type: "variable", op: step.op, flowSlug: step.flowSlug, flowName: step.flowName, name: step.name, value })
          }}
        />
      )

    default:
      return null
  }
}

function CascaderList({ items }: { items: { label: string; onClick: () => void }[] }) {
  return (
    <div className="py-1">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted cursor-pointer"
        >
          {item.label}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function TagSelector({
  op, search, setSearch, selectedTags, setSelectedTags, onApply,
}: {
  op: string; search: string; setSearch: (s: string) => void
  selectedTags: string[]; setSelectedTags: (t: string[]) => void
  onApply: () => void
}) {
  const { data, isLoading } = useContactTags()
  const tags = data?.tags ?? []
  const filtered = search ? tags.filter((t) => t.toLowerCase().includes(search.toLowerCase())) : tags

  const toggle = (tag: string) => {
    setSelectedTags(
      selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag]
    )
  }

  return (
    <div>
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tags..." className="pl-7 h-8 text-xs"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <ScrollArea className="max-h-[200px]">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">No tags found</div>
        ) : (
          <div className="py-1">
            {filtered.map((tag) => (
              <button
                key={tag} onClick={() => toggle(tag)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted cursor-pointer"
              >
                <div className={cn("h-4 w-4 rounded border flex items-center justify-center",
                  selectedTags.includes(tag) && "bg-primary border-primary"
                )}>
                  {selectedTags.includes(tag) && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                {tag}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
      {selectedTags.length > 0 && (
        <div className="p-2 border-t">
          <Button size="sm" className="w-full h-7 text-xs cursor-pointer" onClick={onApply}>
            Apply ({selectedTags.length} selected)
          </Button>
        </div>
      )}
    </div>
  )
}

function FlowSelector({
  search, setSearch, onSelect,
}: {
  search: string; setSearch: (s: string) => void
  onSelect: (slug: string, name: string) => void
}) {
  const { data, isLoading } = useChatbotFlows()
  const flows = data ?? []
  const filtered = search
    ? flows.filter((f: any) => f.name.toLowerCase().includes(search.toLowerCase()) || f.flow_slug?.toLowerCase().includes(search.toLowerCase()))
    : flows

  return (
    <div>
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search flows..." className="pl-7 h-8 text-xs"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <ScrollArea className="max-h-[200px]">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">No flows found</div>
        ) : (
          <div className="py-1">
            {filtered.map((flow: any) => (
              <button
                key={flow.id} onClick={() => onSelect(flow.flow_slug || flow.slug, flow.name)}
                className="w-full text-left px-3 py-2 hover:bg-muted cursor-pointer"
              >
                <div className="text-sm">{flow.name}</div>
                <div className="text-[10px] text-muted-foreground">{flow.flow_slug || flow.slug}</div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function VariableNameSelector({
  flowSlug, search, setSearch, onSelect,
}: {
  flowSlug: string; search: string; setSearch: (s: string) => void
  onSelect: (name: string) => void
}) {
  const { data, isLoading } = useContactVariables(flowSlug)
  const variables = data?.variables ?? []
  const filtered = search ? variables.filter((v) => v.toLowerCase().includes(search.toLowerCase())) : variables

  return (
    <div>
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search variables..." className="pl-7 h-8 text-xs"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <ScrollArea className="max-h-[200px]">
        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">No variables found</div>
        ) : (
          <div className="py-1">
            {filtered.map((v) => (
              <button key={v} onClick={() => onSelect(v)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer"
              >{v}</button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

function ValueInput({ onApply }: { onApply: (value: string) => void }) {
  const [value, setValue] = useState("")

  return (
    <div className="p-3">
      <Input
        value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="Enter value..."
        className="h-8 text-sm mb-2"
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter" && value.trim()) onApply(value.trim())
        }}
        autoFocus
      />
      <Button
        size="sm" className="w-full h-7 text-xs cursor-pointer"
        disabled={!value.trim()} onClick={() => onApply(value.trim())}
      >
        Apply
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Check if useChatbotFlows hook exists**

The component imports `useChatbotFlows`. Check if it exists at `hooks/queries/use-chatbot-flows.ts`. If not, check `lib/whatsapp-api.ts` for how chatbot flows are fetched. The data comes from `GET /api/chatbot/flows`. Create the hook if missing:

```ts
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export function useChatbotFlows() {
  return useQuery({
    queryKey: ["chatbotFlows"],
    queryFn: () => apiClient.get<any[]>("/api/chatbot/flows"),
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/chat/contact-list/contact-filter.tsx hooks/queries/use-chatbot-flows.ts
git commit -m "feat(chat): add ContactFilterBar cascader component"
```

---

## Task 7: Frontend — Wire Filters into Contact List

**Files:**
- Modify: `magic-flow/components/chat/contact-list/contact-list.tsx`

- [ ] **Step 1: Integrate filter into contact list**

Key changes:
- Import `ContactFilterBar` and `useFilteredContacts`
- Add `filters` state
- When filters are active, use `useFilteredContacts` instead of `useContacts`
- Add debouncing for filter changes
- Render `ContactFilterBar` between the channel filters and the contact list

Read the current file first. Add the filter state and conditional query:

```tsx
const [filters, setFilters] = useState<ContactFilter[]>([])
```

Import `ContactFilter` from `@/types/chat` and `useFilteredContacts` from `@/hooks/queries/use-contact-filters`.

Add the filtered query:
```tsx
const filteredQuery = useFilteredContacts(filters, {
  search: debouncedSearch || undefined,
  channel: channel ?? undefined,
})
```

Use the filtered query when filters are active:
```tsx
const activeQuery = filters.length > 0 ? filteredQuery : unfilteredQuery
const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = activeQuery
```

Render the filter bar after `ContactListFilters`:
```tsx
<ContactListFilters channel={channel} onChannelChange={setChannel} />
<ContactFilterBar filters={filters} onFiltersChange={setFilters} />
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass

- [ ] **Step 4: Manual test**

- Click "Filter" → cascader shows Tag/Flow/Variable
- Tag → is → select tags → chip appears → contacts filter
- Flow → is in → select flow → chip appears → contacts filter
- Variable → flow → variable name → operator → value → chip appears
- Remove chip → contacts reset
- Clear all → all chips removed

- [ ] **Step 5: Commit**

```bash
git add components/chat/contact-list/contact-list.tsx
git commit -m "feat(chat): wire contact filters into contact list with cascader"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Backend tests**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && go test ./... 2>&1 | tail -5`
Expected: All tests pass

- [ ] **Step 2: Frontend TypeScript + tests**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit && npm run test`
Expected: Zero errors, all tests pass

- [ ] **Step 3: Manual test all filter combinations**

- [ ] Tag: is "sampled" → only contacts with that tag
- [ ] Tag: isn't "blacklisted" → contacts without that tag
- [ ] Tag: multi-select "sampled", "vip" → contacts with either tag
- [ ] Flow: is in "Registration" → contacts with active session
- [ ] Flow: was in "Registration" → contacts who ran that flow
- [ ] Flow: isn't in "Registration" → contacts who never ran it
- [ ] Variable: city is "Mumbai" → exact match
- [ ] Variable: city isn't "Delhi" → contacts without Delhi (including no city set)
- [ ] Variable: city has any value → contacts who have city set
- [ ] Variable: city is unknown → contacts without city set
- [ ] Variable: city contains "Mum" → substring match
- [ ] Combine: Tag is "sampled" + Flow is in "Registration" → AND logic
- [ ] Search + Filter: search "pratik" + Tag is "vip" → both applied
- [ ] Remove filter chip → contacts update
- [ ] Clear all → back to full list
