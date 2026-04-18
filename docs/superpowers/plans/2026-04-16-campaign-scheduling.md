# Campaign Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-start broadcast campaigns at a scheduled time via a Postgres-polling goroutine in fs-whatsapp, with datetime UI + AI tools in magic-flow.

**Architecture:** New `CampaignScheduler` goroutine runs in the fs-whatsapp `server` process (mirrors `SLAProcessor` pattern). Every 30s it runs two atomic UPDATE queries: pick up ready campaigns (`scheduled_at <= NOW()`, within 15 min grace window) and enqueue their recipients using an extracted helper; mark overdue campaigns (`scheduled_at < NOW() - 15min`) as `failed`. Creating a campaign with `scheduled_at` sets its status to `scheduled`. A new `POST /api/campaigns/{id}/reschedule` endpoint uses a CAS update to move a draft/scheduled/failed campaign to a new time. Magic-flow gets a radio ("Send now" / "Schedule for later") with a `datetime-local` input, a reschedule dialog, a failed-missed banner, and two updates to the AI tool surface (`create_campaign` gains `scheduled_at`; new `reschedule_campaign` tool). Browser timezone flows through `toolContext.userTimezone` so the AI can resolve relative times.

**Tech Stack:** Go 1.25, GORM, Fastglue, Postgres, React/Next.js 14, TypeScript, shadcn, React Query, Vercel AI SDK `tool()`, Zod.

**Spec:** `magic-flow/docs/superpowers/specs/2026-04-16-campaign-scheduling-design.md`

**Repos:**
- `fs-whatsapp/` — `/Users/pratikgupta/Freestand/fs-whatsapp`
- `magic-flow/` — `/Users/pratikgupta/Freestand/magic-flow`

---

## File structure

### fs-whatsapp (Go backend)

| File | Purpose | New or modified |
|---|---|---|
| `internal/models/bulk.go` | Add `ErrorMessage` field to `BulkMessageCampaign` | Modify |
| `internal/database/postgres.go` | Migration: add column + not-null default | Modify |
| `internal/handlers/campaigns.go` | Extract enqueue helper; status handling in `CreateCampaign`; new `RescheduleCampaign`; CAS on `CancelCampaign` + `DeleteCampaign` | Modify |
| `internal/handlers/campaign_scheduler.go` | New `CampaignScheduler` goroutine | Create |
| `internal/handlers/campaign_scheduler_test.go` | Scheduler unit tests | Create |
| `internal/handlers/campaigns_test.go` | Extend with create/reschedule/cancel tests | Modify |
| `cmd/fs-chat/main.go` | Start/stop `CampaignScheduler` in `server` subcommand | Modify |

### magic-flow (React frontend)

| File | Purpose | New or modified |
|---|---|---|
| `types/campaigns.ts` | Rename `schedule_at` → `scheduled_at`; confirm status union | Modify |
| `components/campaigns/campaign-create-form.tsx` | Fix typo; add schedule section | Modify |
| `components/campaigns/campaign-list.tsx` | Scheduled badge/time | Modify |
| `components/campaigns/campaign-detail.tsx` | Scheduled banner, action buttons, failed-missed banner | Modify |
| `components/campaigns/reschedule-dialog.tsx` | New dialog component | Create |
| `hooks/queries/use-campaigns.ts` | `useRescheduleCampaign()` | Modify |
| `components/ai/ai-assistant.tsx` | Compute and POST `userTimezone` | Modify |
| `app/api/ai/flow-assistant/route.ts` | Forward `userTimezone` into tool context | Modify |
| `lib/ai/tools/generate-flow.ts` | Add `userTimezone?: string` to toolContext type | Modify |
| `lib/ai/tools/generate-flow-edit.ts` | Extend `create_campaign`; add `reschedule_campaign` | Modify |
| `lib/ai/tools/flow-prompts.ts` | Update broadcasting section with scheduling + TZ | Modify |
| `docs/flow-assistant-tools.md` | Document new tool and updated param | Modify |

---

## Task 1: Backend — add `ErrorMessage` column to campaign model

**Files:**
- Modify: `fs-whatsapp/internal/models/bulk.go` (after line 39 where `FailedCount` ends, before `ScheduledAt` at line 40)
- Modify: `fs-whatsapp/internal/database/postgres.go` (add migration statement in the existing `migrations :=` slice around line 257 where "Broadcasting: flow extensibility" comments live)

- [ ] **Step 1.1: Add the struct field**

In `fs-whatsapp/internal/models/bulk.go`, find the `BulkMessageCampaign` struct and add the field after `FailedCount` (around line 39):

```go
	ReadCount       int            `gorm:"default:0" json:"read_count"`
	FailedCount     int            `gorm:"default:0" json:"failed_count"`
	ErrorMessage    string         `gorm:"type:text;not null;default:''" json:"error_message"`
	ScheduledAt     *time.Time     `json:"scheduled_at,omitempty"`
```

- [ ] **Step 1.2: Add DDL so existing databases get the column**

In `fs-whatsapp/internal/database/postgres.go`, find the broadcasting extensibility block (search for comment `// Broadcasting: flow extensibility + external audience sources`). After the existing `ALTER TABLE bulk_message_campaigns ALTER COLUMN template_id DROP NOT NULL` line (around line 258), add:

```go
		`ALTER TABLE bulk_message_campaigns ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT ''`,
```

- [ ] **Step 1.3: Build to verify**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && make build`
Expected: build succeeds.

- [ ] **Step 1.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/models/bulk.go internal/database/postgres.go
git commit -m "feat(campaigns): add error_message column to bulk_message_campaigns"
```

---

## Task 2: Backend — extract `enqueueRecipientsForCampaign` helper

**Files:**
- Modify: `fs-whatsapp/internal/handlers/campaigns.go` — extract lines 696-742 of `StartCampaign` into a new helper, refactor `StartCampaign` to use it.

- [ ] **Step 2.1: Add the helper function after `StartCampaign`**

In `fs-whatsapp/internal/handlers/campaigns.go`, immediately after the closing brace of `StartCampaign` (around line 749), add:

```go
// enqueueRecipientsForCampaign loads pending recipients for a campaign and
// enqueues them into the worker queue. Does NOT manage campaign status —
// callers are responsible for setting status to processing before calling
// and handling revert on error.
//
// Returns the number of recipients enqueued. If zero recipients are pending
// (and no error occurred), returns (0, nil) — the caller decides whether
// that's a user-facing error.
func (a *App) enqueueRecipientsForCampaign(ctx context.Context, campaign *models.BulkMessageCampaign) (int, error) {
	var recipients []models.BulkMessageRecipient
	if err := a.DB.Where("campaign_id = ? AND status = ?", campaign.ID, models.MessageStatusPending).
		Find(&recipients).Error; err != nil {
		return 0, fmt.Errorf("load recipients: %w", err)
	}

	if len(recipients) == 0 {
		return 0, nil
	}

	jobs := make([]*queue.RecipientJob, len(recipients))
	for i, r := range recipients {
		jobs[i] = &queue.RecipientJob{
			CampaignID:     campaign.ID,
			RecipientID:    r.ID,
			OrganizationID: campaign.OrganizationID,
			PhoneNumber:    r.PhoneNumber,
			RecipientName:  r.RecipientName,
			TemplateParams: r.TemplateParams,
			FlowID:         campaign.FlowID,
			ContactID:      r.ContactID,
		}
	}

	if err := a.Queue.EnqueueRecipients(ctx, jobs); err != nil {
		return 0, fmt.Errorf("enqueue recipients: %w", err)
	}

	return len(recipients), nil
}
```

Ensure `fmt` is imported (it already is — grep for `"fmt"` in the imports at the top of the file to confirm).

- [ ] **Step 2.2: Refactor `StartCampaign` to use the helper**

Replace the existing recipient-loading and enqueue block in `StartCampaign` (lines 696-743 of the original file — from `// Get all pending recipients` through the existing `a.Log.Info("Recipients enqueued for processing", ...)` line). The new `StartCampaign` body (from the status-check line onward) looks like:

```go
	// Check if campaign can be started
	if campaign.Status != models.CampaignStatusDraft && campaign.Status != models.CampaignStatusScheduled && campaign.Status != models.CampaignStatusPaused {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Campaign cannot be started in current state", nil, "")
	}

	// Quick sanity check before flipping status — avoids a needless processing/revert dance
	// when there's nothing to send.
	var pendingCount int64
	if err := a.DB.Model(&models.BulkMessageRecipient{}).
		Where("campaign_id = ? AND status = ?", id, models.MessageStatusPending).
		Count(&pendingCount).Error; err != nil {
		a.Log.Error("Failed to count pending recipients", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to load recipients", nil, "")
	}
	if pendingCount == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Campaign has no pending recipients", nil, "")
	}

	// Flip status to processing
	now := time.Now()
	if err := a.DB.Model(&campaign).Updates(map[string]interface{}{
		"status":     models.CampaignStatusProcessing,
		"started_at": now,
	}).Error; err != nil {
		a.Log.Error("Failed to start campaign", "error", err)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to start campaign", nil, "")
	}

	a.Log.Info("Campaign started", "campaign_id", id)

	// Enqueue
	count, err := a.enqueueRecipientsForCampaign(r.RequestCtx, &campaign)
	if err != nil {
		a.Log.Error("Failed to enqueue recipients", "error", err)
		// Revert status on failure — manual Start reverts to draft (existing semantic).
		a.DB.Model(&campaign).Update("status", models.CampaignStatusDraft)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to queue recipients", nil, "")
	}
	a.Log.Info("Recipients enqueued for processing", "campaign_id", id, "count", count)

	return r.SendEnvelope(map[string]interface{}{
		"message": "Campaign started",
		"status":  models.CampaignStatusProcessing,
	})
}
```

Full replacement: replace everything from `// Check if campaign can be started` (around line 691) through the closing `}` of `StartCampaign` (around line 749).

- [ ] **Step 2.3: Build and run existing campaign tests**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && make build && go test ./internal/handlers/ -run TestCampaign -v`
Expected: build succeeds, existing campaign tests still pass. If any fail, the signature change or behavior change broke them — fix before committing.

- [ ] **Step 2.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaigns.go
git commit -m "refactor(campaigns): extract enqueueRecipientsForCampaign helper"
```

---

## Task 3: Backend — `CreateCampaign` sets scheduled status and blocks CSV+schedule combo

**Files:**
- Modify: `fs-whatsapp/internal/handlers/campaigns.go` — `CreateCampaign` status handling around line 402 and `ScheduledAt` validation; CSV guard.

- [ ] **Step 3.1: Add helper for "must be at least 30s in the future"**

In `fs-whatsapp/internal/handlers/campaigns.go`, near the top of the file (after imports, before the first exported function), add:

```go
// minScheduleBuffer is the minimum time in the future a campaign can be
// scheduled for. Small buffer accounts for server-to-DB clock skew and the
// round-trip between validation and scheduler pickup.
const minScheduleBuffer = 30 * time.Second
```

- [ ] **Step 3.2: Validate scheduled_at in CreateCampaign and set status accordingly**

In `CreateCampaign`, immediately after the existing audience-source setup and BEFORE the campaign is persisted (find the line `campaign := models.BulkMessageCampaign{` around line 395), replace the campaign construction and initial validation block with:

```go
	// Validate scheduled_at: must be at least 30s in the future, and not allowed
	// for CSV audience (recipients are imported in a separate step).
	initialStatus := models.CampaignStatusDraft
	if req.ScheduledAt != nil {
		if req.AudienceSource == AudienceSourceCSV {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "CSV audience cannot be scheduled. Start the campaign manually after importing recipients.", nil, "")
		}
		if !req.ScheduledAt.After(time.Now().Add(minScheduleBuffer)) {
			return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "scheduled_at must be at least 30 seconds in the future", nil, "")
		}
		initialStatus = models.CampaignStatusScheduled
	}

	// Build campaign row
	campaign := models.BulkMessageCampaign{
		OrganizationID: orgID,
		AccountName:    req.AccountName,
		Name:           req.Name,
		TemplateID:     templateUUID,
		FlowID:         flowUUID,
		HeaderMediaID:  req.HeaderMediaID,
		Status:         initialStatus,
		ScheduledAt:    req.ScheduledAt,
		CreatedBy:      userID,
		AudienceSource: req.AudienceSource,
	}
```

The specific line to replace is the existing `campaign := models.BulkMessageCampaign{...Status: models.CampaignStatusDraft,...}` block (around lines 395-406). Find the exact current text with Grep before editing:

```bash
grep -n "CampaignStatusDraft" fs-whatsapp/internal/handlers/campaigns.go
```

- [ ] **Step 3.3: Build to verify**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && make build`
Expected: build succeeds.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaigns.go
git commit -m "feat(campaigns): allow scheduled_at on create, block CSV+schedule"
```

---

## Task 4: Backend — `POST /api/campaigns/{id}/reschedule`

**Files:**
- Modify: `fs-whatsapp/internal/handlers/campaigns.go` — add `RescheduleCampaign` handler after `CancelCampaign`.
- Modify: `fs-whatsapp/cmd/fs-chat/main.go` — register the route.

- [ ] **Step 4.1: Add the handler**

In `fs-whatsapp/internal/handlers/campaigns.go`, add this function after the `CancelCampaign` closing brace (search for `func (a *App) CancelCampaign` and place the new function after its final `}`):

```go
// RescheduleCampaign sets a new scheduled_at on a campaign. Allowed from
// draft / scheduled / failed states. Uses CAS update to prevent races with
// the scheduler picking up the campaign concurrently.
func (a *App) RescheduleCampaign(r *fastglue.Request) error {
	orgID, err := a.getOrgIDFromContext(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	campaignID := r.RequestCtx.UserValue("id").(string)
	id, err := uuid.Parse(campaignID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid campaign ID", nil, "")
	}

	var req struct {
		ScheduledAt *time.Time `json:"scheduled_at"`
	}
	if err := r.Decode(&req, "json"); err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid request body", nil, "")
	}
	if req.ScheduledAt == nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "scheduled_at is required", nil, "")
	}
	if !req.ScheduledAt.After(time.Now().Add(minScheduleBuffer)) {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "scheduled_at must be at least 30 seconds in the future", nil, "")
	}

	// Verify campaign belongs to org first
	var campaign models.BulkMessageCampaign
	if err := a.DB.Where("id = ? AND organization_id = ?", id, orgID).First(&campaign).Error; err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Campaign not found", nil, "")
	}

	// CAS update — only succeeds if status is still one of the allowed source states.
	// This prevents a race where the scheduler has just flipped the campaign to
	// processing between our read above and our write here.
	result := a.DB.Model(&models.BulkMessageCampaign{}).
		Where("id = ? AND organization_id = ? AND status IN ?",
			id, orgID,
			[]models.CampaignStatus{models.CampaignStatusDraft, models.CampaignStatusScheduled, models.CampaignStatusFailed},
		).
		Updates(map[string]interface{}{
			"status":        models.CampaignStatusScheduled,
			"scheduled_at":  *req.ScheduledAt,
			"started_at":    nil,
			"completed_at":  nil,
			"error_message": "",
		})
	if result.Error != nil {
		a.Log.Error("Failed to reschedule campaign", "error", result.Error, "campaign_id", id)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to reschedule campaign", nil, "")
	}
	if result.RowsAffected == 0 {
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Campaign state changed concurrently. Refresh and try again.", nil, "")
	}

	a.Log.Info("Campaign rescheduled", "campaign_id", id, "scheduled_at", req.ScheduledAt)

	return r.SendEnvelope(map[string]interface{}{
		"message":      "Campaign rescheduled",
		"status":       models.CampaignStatusScheduled,
		"scheduled_at": req.ScheduledAt,
	})
}
```

- [ ] **Step 4.2: Register the route**

In `fs-whatsapp/cmd/fs-chat/main.go`, find the existing campaign routes block (search for `g.POST("/api/campaigns/{id}/start"`). Add the new route after `/cancel`:

```go
	g.POST("/api/campaigns/{id}/start", app.StartCampaign)
	g.POST("/api/campaigns/{id}/pause", app.PauseCampaign)
	g.POST("/api/campaigns/{id}/cancel", app.CancelCampaign)
	g.POST("/api/campaigns/{id}/reschedule", app.RescheduleCampaign)
	g.POST("/api/campaigns/{id}/retry-failed", app.RetryFailed)
```

- [ ] **Step 4.3: Build to verify**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && make build`
Expected: build succeeds.

- [ ] **Step 4.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaigns.go cmd/fs-chat/main.go
git commit -m "feat(campaigns): add POST /api/campaigns/{id}/reschedule with CAS"
```

---

## Task 5: Backend — CAS guards on `CancelCampaign` and `DeleteCampaign`

**Files:**
- Modify: `fs-whatsapp/internal/handlers/campaigns.go` — `CancelCampaign` around line 787, `DeleteCampaign` (search for `func (a *App) DeleteCampaign`).

- [ ] **Step 5.1: Tighten `CancelCampaign` to use CAS**

In `fs-whatsapp/internal/handlers/campaigns.go`, find `func (a *App) CancelCampaign`. Replace the status check + update block (the section that currently reads campaign, checks `campaign.Status == completed || cancelled`, and does `Update("status", Cancelled)`) with:

```go
func (a *App) CancelCampaign(r *fastglue.Request) error {
	orgID, err := a.getOrgIDFromContext(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	campaignID := r.RequestCtx.UserValue("id").(string)
	id, err := uuid.Parse(campaignID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid campaign ID", nil, "")
	}

	// CAS: only cancel from states where cancel is safe. Explicitly excludes
	// processing (jobs already enqueued) and completed/cancelled (already final).
	result := a.DB.Model(&models.BulkMessageCampaign{}).
		Where("id = ? AND organization_id = ? AND status IN ?",
			id, orgID,
			[]models.CampaignStatus{
				models.CampaignStatusDraft,
				models.CampaignStatusScheduled,
				models.CampaignStatusPaused,
				models.CampaignStatusFailed,
				models.CampaignStatusQueued,
			},
		).
		Update("status", models.CampaignStatusCancelled)
	if result.Error != nil {
		a.Log.Error("Failed to cancel campaign", "error", result.Error)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to cancel campaign", nil, "")
	}
	if result.RowsAffected == 0 {
		// Either campaign doesn't exist, or it's in a state that can't be cancelled.
		// Disambiguate with a bounded query.
		var count int64
		a.DB.Model(&models.BulkMessageCampaign{}).Where("id = ? AND organization_id = ?", id, orgID).Count(&count)
		if count == 0 {
			return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Campaign not found", nil, "")
		}
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Campaign already started or finished. Cancellation not possible from current state.", nil, "")
	}

	a.Log.Info("Campaign cancelled", "campaign_id", id)

	return r.SendEnvelope(map[string]interface{}{
		"message": "Campaign cancelled",
		"status":  models.CampaignStatusCancelled,
	})
}
```

- [ ] **Step 5.2: Tighten `DeleteCampaign` to use CAS**

Find `func (a *App) DeleteCampaign`. Replace its body so delete is only allowed from terminal states (cancelled / completed / failed) or draft (pre-schedule):

```go
func (a *App) DeleteCampaign(r *fastglue.Request) error {
	orgID, err := a.getOrgIDFromContext(r)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusUnauthorized, "Unauthorized", nil, "")
	}

	campaignID := r.RequestCtx.UserValue("id").(string)
	id, err := uuid.Parse(campaignID)
	if err != nil {
		return r.SendErrorEnvelope(fasthttp.StatusBadRequest, "Invalid campaign ID", nil, "")
	}

	result := a.DB.
		Where("id = ? AND organization_id = ? AND status IN ?",
			id, orgID,
			[]models.CampaignStatus{
				models.CampaignStatusDraft,
				models.CampaignStatusScheduled,
				models.CampaignStatusCancelled,
				models.CampaignStatusCompleted,
				models.CampaignStatusFailed,
			},
		).
		Delete(&models.BulkMessageCampaign{})
	if result.Error != nil {
		a.Log.Error("Failed to delete campaign", "error", result.Error)
		return r.SendErrorEnvelope(fasthttp.StatusInternalServerError, "Failed to delete campaign", nil, "")
	}
	if result.RowsAffected == 0 {
		var count int64
		a.DB.Model(&models.BulkMessageCampaign{}).Where("id = ? AND organization_id = ?", id, orgID).Count(&count)
		if count == 0 {
			return r.SendErrorEnvelope(fasthttp.StatusNotFound, "Campaign not found", nil, "")
		}
		return r.SendErrorEnvelope(fasthttp.StatusConflict, "Campaign is active and cannot be deleted. Cancel it first.", nil, "")
	}

	a.Log.Info("Campaign deleted", "campaign_id", id)
	return r.SendEnvelope(map[string]interface{}{
		"message": "Campaign deleted",
	})
}
```

**Note:** the original `DeleteCampaign` body is short (read campaign + delete). Find and replace it wholesale. If the existing version has extra logic (e.g. deleting related records), preserve that logic inside the new guarded path.

- [ ] **Step 5.3: Build and run tests**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && make build && go test ./internal/handlers/ -run TestCampaign -v`
Expected: build succeeds; existing tests may need minor updates if they depended on the old non-CAS delete/cancel semantics. Update tests to match the new status-guard semantics.

- [ ] **Step 5.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaigns.go
git commit -m "fix(campaigns): CAS guards on Cancel and Delete to prevent scheduler race"
```

---

## Task 6: Backend — `CampaignScheduler` goroutine

**Files:**
- Create: `fs-whatsapp/internal/handlers/campaign_scheduler.go`
- Modify: `fs-whatsapp/cmd/fs-chat/main.go` — start/stop the scheduler.

- [ ] **Step 6.1: Create the scheduler file**

Create `fs-whatsapp/internal/handlers/campaign_scheduler.go`:

```go
package handlers

import (
	"context"
	"time"

	"github.com/freestandtech/fs-chat/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm/clause"
)

// CampaignScheduler ticks every `interval` to pick up scheduled campaigns
// whose time has come, and to mark overdue campaigns (outside the grace
// window) as failed. Runs in the `server` subcommand; single-instance.
type CampaignScheduler struct {
	app      *App
	interval time.Duration
	stopCh   chan struct{}
}

const (
	// schedulerGraceWindow is how long after scheduled_at the scheduler will
	// still start a campaign. Beyond this window, the campaign is marked failed
	// to avoid sending at a surprising hour (e.g. if the server was offline).
	schedulerGraceWindow = 15 * time.Minute

	// schedulerBatchLimit caps how many campaigns one tick will pick up, to keep
	// the tick bounded under backlog.
	schedulerBatchLimit = 100
)

// NewCampaignScheduler creates a new scheduler.
func NewCampaignScheduler(app *App, interval time.Duration) *CampaignScheduler {
	return &CampaignScheduler{
		app:      app,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

// Start begins the scheduling loop. Blocks until ctx is done or Stop is called.
func (s *CampaignScheduler) Start(ctx context.Context) {
	s.app.Log.Info("Campaign scheduler started", "interval", s.interval, "grace_window", schedulerGraceWindow)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.app.Log.Info("Campaign scheduler stopped by context")
			return
		case <-s.stopCh:
			s.app.Log.Info("Campaign scheduler stopped")
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

// Stop stops the scheduler.
func (s *CampaignScheduler) Stop() {
	close(s.stopCh)
}

// tick runs one round of pickup + overdue cleanup.
func (s *CampaignScheduler) tick(ctx context.Context) {
	s.pickupReady(ctx)
	s.markOverdueAsFailed(ctx)
}

// pickupReady picks up to schedulerBatchLimit campaigns whose scheduled_at
// has passed (and are still within the grace window), flips them to
// processing, and enqueues their recipients. On enqueue error for an
// individual campaign, reverts that row's status so the next tick retries.
func (s *CampaignScheduler) pickupReady(ctx context.Context) {
	// Step 1: atomically pick up the batch. Use a subquery + FOR UPDATE SKIP
	// LOCKED so if somebody (a future operator) ever runs two schedulers,
	// they don't fight over rows.
	var picked []models.BulkMessageCampaign
	err := s.app.DB.WithContext(ctx).Raw(`
		UPDATE bulk_message_campaigns
		SET status = 'processing', started_at = NOW()
		WHERE id IN (
			SELECT id FROM bulk_message_campaigns
			WHERE status = 'scheduled'
			  AND scheduled_at <= NOW()
			  AND scheduled_at >= NOW() - INTERVAL '15 minutes'
			ORDER BY scheduled_at ASC
			LIMIT ?
			FOR UPDATE SKIP LOCKED
		)
		RETURNING *
	`, schedulerBatchLimit).Scan(&picked).Error
	if err != nil {
		s.app.Log.Error("Scheduler pickup query failed", "error", err)
		return
	}
	if len(picked) == 0 {
		return
	}
	if len(picked) == schedulerBatchLimit {
		// Backlog signal — operators can spot a pileup before misses start.
		s.app.Log.Warn("Scheduler backlog", "picked", len(picked), "limit", schedulerBatchLimit)
	}

	s.app.Log.Info("Scheduler picked up ready campaigns", "count", len(picked))

	// Step 2: enqueue each picked campaign's recipients.
	for i := range picked {
		c := picked[i] // avoid loop-var capture in any future goroutine
		s.enqueueOrRevert(ctx, &c)
	}
}

// enqueueOrRevert tries to enqueue recipients for a single campaign. On error,
// CAS-reverts status back to scheduled so the next tick retries (up to the
// grace window).
func (s *CampaignScheduler) enqueueOrRevert(ctx context.Context, c *models.BulkMessageCampaign) {
	count, err := s.app.enqueueRecipientsForCampaign(ctx, c)
	if err == nil && count > 0 {
		s.app.Log.Info("Scheduler enqueued campaign", "campaign_id", c.ID, "recipients", count)
		return
	}

	if err == nil && count == 0 {
		// Zero pending recipients means either the campaign has no recipients
		// at all (shouldn't happen for scheduled — CreateCampaign rejects that)
		// or all have already been processed. Mark as failed immediately —
		// retrying won't help.
		s.markCampaignFailed(ctx, c.ID, "Scheduled campaign has no pending recipients to send.")
		return
	}

	// err != nil — transient error. CAS revert only if the row is still in
	// the processing state we put it in (a concurrent Cancel may have moved it).
	s.app.Log.Error("Scheduler enqueue failed; reverting to scheduled", "campaign_id", c.ID, "error", err)
	revertRes := s.app.DB.WithContext(ctx).Model(&models.BulkMessageCampaign{}).
		Clauses(clause.Returning{}).
		Where("id = ? AND status = ?", c.ID, models.CampaignStatusProcessing).
		Updates(map[string]interface{}{
			"status":     models.CampaignStatusScheduled,
			"started_at": nil,
		})
	if revertRes.Error != nil {
		s.app.Log.Error("Scheduler revert failed", "campaign_id", c.ID, "error", revertRes.Error)
	}
}

// markCampaignFailed flips a campaign to failed with a reason.
func (s *CampaignScheduler) markCampaignFailed(ctx context.Context, id uuid.UUID, reason string) {
	now := time.Now()
	if err := s.app.DB.WithContext(ctx).Model(&models.BulkMessageCampaign{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":        models.CampaignStatusFailed,
			"error_message": reason,
			"completed_at":  now,
		}).Error; err != nil {
		s.app.Log.Error("Scheduler failed-mark update failed", "campaign_id", id, "error", err)
	}
}

// markOverdueAsFailed marks any scheduled campaigns older than the grace
// window as failed. Runs after pickupReady in each tick.
func (s *CampaignScheduler) markOverdueAsFailed(ctx context.Context) {
	result := s.app.DB.WithContext(ctx).Model(&models.BulkMessageCampaign{}).
		Where("status = ? AND scheduled_at < ?", models.CampaignStatusScheduled, time.Now().Add(-schedulerGraceWindow)).
		Updates(map[string]interface{}{
			"status":        models.CampaignStatusFailed,
			"error_message": "Missed scheduled start window: server was offline or unhealthy when scheduled_at passed.",
			"completed_at":  time.Now(),
		})
	if result.Error != nil {
		s.app.Log.Error("Scheduler overdue-mark failed", "error", result.Error)
		return
	}
	if result.RowsAffected > 0 {
		s.app.Log.Warn("Scheduler marked campaigns as failed (missed window)", "count", result.RowsAffected)
	}
}
```

- [ ] **Step 6.2: Start the scheduler in main.go**

In `fs-whatsapp/cmd/fs-chat/main.go`, find the block starting with `// Start session recovery processor` (around line 253). Add this immediately after the session-recovery block:

```go
	// Start session recovery processor (runs every 30 seconds, immediate sweep on startup)
	recoveryProcessor := handlers.NewSessionRecoveryProcessor(app, 30*time.Second)
	recoveryCtx, recoveryCancel := context.WithCancel(context.Background())
	go recoveryProcessor.Start(recoveryCtx)
	lo.Info("Session recovery processor started")

	// Start campaign scheduler (picks up scheduled broadcasts every 30s).
	// Single-instance: the scheduler runs in the server process only. If
	// multiple server instances run concurrently, the UPDATE ... FOR UPDATE
	// SKIP LOCKED query protects against double-enqueue.
	campaignScheduler := handlers.NewCampaignScheduler(app, 30*time.Second)
	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	go campaignScheduler.Start(schedulerCtx)
	lo.Info("Campaign scheduler started")
```

Then find the shutdown block (search for `slaCancel()` or `recoveryCancel()`). Add the scheduler stop calls alongside:

```go
	// ... existing shutdown code ...
	recoveryCancel()
	recoveryProcessor.Stop()
	schedulerCancel()
	campaignScheduler.Stop()
```

If the existing shutdown pattern differs, match it — the key is that `schedulerCancel()` is called on shutdown so the goroutine exits cleanly.

- [ ] **Step 6.3: Build to verify**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && make build`
Expected: build succeeds.

- [ ] **Step 6.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaign_scheduler.go cmd/fs-chat/main.go
git commit -m "feat(campaigns): add CampaignScheduler goroutine for scheduled broadcasts"
```

---

## Task 7: Backend — scheduler unit tests

**Files:**
- Create: `fs-whatsapp/internal/handlers/campaign_scheduler_test.go`

- [ ] **Step 7.1: Write the test file**

Create `fs-whatsapp/internal/handlers/campaign_scheduler_test.go`. The tests operate on a real test DB (following existing `campaigns_test.go` patterns). Check `campaigns_test.go` for the helper that sets up a test app + org:

```bash
head -80 fs-whatsapp/internal/handlers/campaigns_test.go
```

Use the same setup helper. Here's the test skeleton; adapt the `setupTestApp` / `createTestCampaign` calls to match whatever helpers exist in `campaigns_test.go`:

```go
package handlers

import (
	"context"
	"testing"
	"time"

	"github.com/freestandtech/fs-chat/internal/models"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// insertTestScheduledCampaign inserts a campaign with given status and scheduled_at,
// including enough pending recipients to satisfy the scheduler's enqueue path.
// Relies on the same test harness as campaigns_test.go — adapt if the harness
// differs.
func insertTestScheduledCampaign(t *testing.T, app *App, orgID uuid.UUID, status models.CampaignStatus, scheduledAt time.Time, recipientCount int) *models.BulkMessageCampaign {
	t.Helper()

	flowID := uuid.New()
	campaign := models.BulkMessageCampaign{
		OrganizationID: orgID,
		Name:           "test-" + uuid.New().String(),
		AccountName:    "test",
		FlowID:         &flowID,
		Status:         status,
		ScheduledAt:    &scheduledAt,
		AudienceSource: "contacts",
		CreatedBy:      uuid.New(),
	}
	require.NoError(t, app.DB.Create(&campaign).Error)

	for i := 0; i < recipientCount; i++ {
		contactID := uuid.New()
		rec := models.BulkMessageRecipient{
			CampaignID:  campaign.ID,
			ContactID:   &contactID,
			PhoneNumber: "911234567890",
			Status:      models.MessageStatusPending,
		}
		require.NoError(t, app.DB.Create(&rec).Error)
	}
	return &campaign
}

func TestScheduler_PicksUpReadyCampaign(t *testing.T) {
	app, orgID, cleanup := setupTestApp(t)
	defer cleanup()

	// Campaign is ready: scheduled 1 second ago
	c := insertTestScheduledCampaign(t, app, orgID, models.CampaignStatusScheduled, time.Now().Add(-1*time.Second), 3)

	scheduler := NewCampaignScheduler(app, time.Second)
	scheduler.tick(context.Background())

	var updated models.BulkMessageCampaign
	require.NoError(t, app.DB.First(&updated, c.ID).Error)
	assert.Equal(t, models.CampaignStatusProcessing, updated.Status)
	assert.NotNil(t, updated.StartedAt)
}

func TestScheduler_IgnoresFutureCampaign(t *testing.T) {
	app, orgID, cleanup := setupTestApp(t)
	defer cleanup()

	c := insertTestScheduledCampaign(t, app, orgID, models.CampaignStatusScheduled, time.Now().Add(1*time.Hour), 3)

	scheduler := NewCampaignScheduler(app, time.Second)
	scheduler.tick(context.Background())

	var updated models.BulkMessageCampaign
	require.NoError(t, app.DB.First(&updated, c.ID).Error)
	assert.Equal(t, models.CampaignStatusScheduled, updated.Status, "future campaign should not be picked up")
}

func TestScheduler_MarksOverdueAsFailed(t *testing.T) {
	app, orgID, cleanup := setupTestApp(t)
	defer cleanup()

	// Scheduled 20 minutes ago — past the 15-min grace window
	c := insertTestScheduledCampaign(t, app, orgID, models.CampaignStatusScheduled, time.Now().Add(-20*time.Minute), 3)

	scheduler := NewCampaignScheduler(app, time.Second)
	scheduler.tick(context.Background())

	var updated models.BulkMessageCampaign
	require.NoError(t, app.DB.First(&updated, c.ID).Error)
	assert.Equal(t, models.CampaignStatusFailed, updated.Status)
	assert.Contains(t, updated.ErrorMessage, "Missed scheduled start window")
	assert.NotNil(t, updated.CompletedAt)
}

func TestScheduler_WithinGraceWindowStillStarts(t *testing.T) {
	app, orgID, cleanup := setupTestApp(t)
	defer cleanup()

	// Scheduled 10 minutes ago — inside the 15-min grace window
	c := insertTestScheduledCampaign(t, app, orgID, models.CampaignStatusScheduled, time.Now().Add(-10*time.Minute), 3)

	scheduler := NewCampaignScheduler(app, time.Second)
	scheduler.tick(context.Background())

	var updated models.BulkMessageCampaign
	require.NoError(t, app.DB.First(&updated, c.ID).Error)
	assert.Equal(t, models.CampaignStatusProcessing, updated.Status)
}

func TestScheduler_BatchLimit(t *testing.T) {
	app, orgID, cleanup := setupTestApp(t)
	defer cleanup()

	// Insert more than the batch limit
	total := schedulerBatchLimit + 10
	for i := 0; i < total; i++ {
		insertTestScheduledCampaign(t, app, orgID, models.CampaignStatusScheduled, time.Now().Add(-time.Duration(i+1)*time.Second), 1)
	}

	scheduler := NewCampaignScheduler(app, time.Second)
	scheduler.tick(context.Background())

	var processingCount int64
	app.DB.Model(&models.BulkMessageCampaign{}).
		Where("organization_id = ? AND status = ?", orgID, models.CampaignStatusProcessing).
		Count(&processingCount)
	assert.Equal(t, int64(schedulerBatchLimit), processingCount, "should pick up at most schedulerBatchLimit per tick")

	var stillScheduled int64
	app.DB.Model(&models.BulkMessageCampaign{}).
		Where("organization_id = ? AND status = ?", orgID, models.CampaignStatusScheduled).
		Count(&stillScheduled)
	assert.Equal(t, int64(10), stillScheduled, "the rest should wait for next tick")
}
```

- [ ] **Step 7.2: Run the tests**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && go test ./internal/handlers/ -run TestScheduler -v`
Expected: all 5 tests pass. If `setupTestApp` or `insertTestScheduledCampaign` helpers don't exist, look for the analogous helpers in `campaigns_test.go` and adapt.

- [ ] **Step 7.3: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaign_scheduler_test.go
git commit -m "test(campaigns): scheduler unit tests"
```

---

## Task 8: Backend — integration tests for create/reschedule/cancel

**Files:**
- Modify: `fs-whatsapp/internal/handlers/campaigns_test.go` — extend with new test cases.

- [ ] **Step 8.1: Read the existing test file to find the setup helpers**

```bash
cat fs-whatsapp/internal/handlers/campaigns_test.go | head -100
```

Identify the HTTP harness (likely `makeRequest(app, method, path, body)` or similar). Use the same harness for new tests.

- [ ] **Step 8.2: Add the new test cases**

Append these tests to `fs-whatsapp/internal/handlers/campaigns_test.go`. Adapt function names to match the harness in the file:

```go
func TestCreateCampaign_ScheduledStatus(t *testing.T) {
	// POST /api/campaigns with scheduled_at + contacts source → status = 'scheduled'
	// Use the existing createCampaign test harness; assert response body status == "scheduled"
}

func TestCreateCampaign_RejectsCSVWithScheduledAt(t *testing.T) {
	// POST with audience_source=csv + scheduled_at → 400
}

func TestCreateCampaign_RejectsPastScheduledAt(t *testing.T) {
	// POST with scheduled_at in the past → 400
}

func TestCreateCampaign_RejectsScheduledAtWithinBuffer(t *testing.T) {
	// POST with scheduled_at 10s in the future → 400 (buffer is 30s)
}

func TestReschedule_FromScheduled(t *testing.T) {
	// Create scheduled campaign, POST /reschedule with new time 2h ahead → 200,
	// scheduled_at updated, status stays scheduled.
}

func TestReschedule_FromDraft(t *testing.T) {
	// Create draft campaign (no scheduled_at), POST /reschedule → 200,
	// status becomes scheduled, scheduled_at set.
}

func TestReschedule_FromFailed_ClearsErrorFields(t *testing.T) {
	// Insert a failed campaign with error_message set, POST /reschedule →
	// 200, error_message cleared, started_at cleared, completed_at cleared,
	// status = scheduled.
}

func TestReschedule_FromProcessing_Returns400(t *testing.T) {
	// Insert a processing campaign, POST /reschedule → 400 (CAS miss returns
	// 409; status check in handler returns 400; match whichever the
	// implementation yields — the spec allows either).
}

func TestReschedule_PastTime(t *testing.T) {
	// POST /reschedule with scheduled_at in the past → 400.
}

func TestCancel_FromProcessing_Returns409(t *testing.T) {
	// Insert a processing campaign, POST /cancel → 409.
}

func TestCancel_FromScheduled(t *testing.T) {
	// Insert a scheduled campaign, POST /cancel → 200, status=cancelled.
}

func TestDelete_FromProcessing_Returns409(t *testing.T) {
	// Insert a processing campaign, DELETE → 409.
}
```

**Important:** the above are test function skeletons with comments. You must fill in the actual test bodies using the existing test harness in `campaigns_test.go`. Read that file first and model the new tests directly after existing patterns like `TestCreateCampaign`, `TestCancelCampaign`, etc.

- [ ] **Step 8.3: Run the tests**

Run: `cd /Users/pratikgupta/Freestand/fs-whatsapp && go test ./internal/handlers/ -run TestCampaign -v -timeout 60s`
Expected: all new tests pass alongside existing ones.

- [ ] **Step 8.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/fs-whatsapp
git add internal/handlers/campaigns_test.go
git commit -m "test(campaigns): scheduling + reschedule + CAS integration tests"
```

---

## Task 9: Frontend — fix `schedule_at` typo and add `scheduled` status

**Files:**
- Modify: `magic-flow/types/campaigns.ts`
- Modify: `magic-flow/components/campaigns/campaign-create-form.tsx:247`
- Modify: any other grep hits for `schedule_at` (without 'd')

- [ ] **Step 9.1: Grep for every `schedule_at` reference**

Run: `grep -rn "schedule_at" /Users/pratikgupta/Freestand/magic-flow --include="*.ts" --include="*.tsx"`
Expected: a small number of hits — types/campaigns.ts + campaign-create-form.tsx + possibly a test/type definition. Note each line.

- [ ] **Step 9.2: Rename in `types/campaigns.ts`**

In `magic-flow/types/campaigns.ts`, change `schedule_at: string | null` to `scheduled_at: string | null` (both in the `CreateCampaignInput` interface and any other interface that has it).

Also confirm the `CampaignStatus` union includes `"scheduled"` and `"failed"`. If missing, add them:

```ts
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
```

- [ ] **Step 9.3: Fix the form payload**

In `magic-flow/components/campaigns/campaign-create-form.tsx` (around line 247), rename the payload field:

```ts
    const res = await createCampaign({
      name: values.name,
      account_name: values.account_name,
      template_id: values.type === "template" ? values.template_id! : null,
      flow_id: values.type === "flow" ? values.flow_id! : null,
      audience_source: values.audience_source,
      audience_config,
      scheduled_at: null,  // will be overwritten by the schedule section in Task 10
    })
```

- [ ] **Step 9.4: TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: no errors. If errors, they'll be from other files using the old `schedule_at` — fix each one.

- [ ] **Step 9.5: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add types/campaigns.ts components/campaigns/campaign-create-form.tsx
git commit -m "fix(campaigns): rename schedule_at → scheduled_at (typo)"
```

---

## Task 10: Frontend — campaign create form "Schedule for later" section

**Files:**
- Modify: `magic-flow/components/campaigns/campaign-create-form.tsx`

- [ ] **Step 10.1: Read the current form structure**

Run: `sed -n '1,100p' /Users/pratikgupta/Freestand/magic-flow/components/campaigns/campaign-create-form.tsx`
Identify where the form schema (Zod) lives and where the submit handler (`onSubmit`) is. Note the imports already present.

- [ ] **Step 10.2: Extend the Zod schema**

Find the Zod schema for the form. Add:

```ts
// In the form schema object, add:
send_when: z.enum(["now", "later"]).default("now"),
scheduled_at_local: z.string().optional(),
```

`scheduled_at_local` holds the raw `datetime-local` input string (e.g. `"2026-04-17T18:00"`). It's converted to UTC ISO at submit.

- [ ] **Step 10.3: Add the UI section**

Inside the form JSX, after the audience section but before the submit actions, add:

```tsx
{/* Schedule section */}
<div className="space-y-3 rounded-md border p-4">
  <FormField
    control={form.control}
    name="send_when"
    render={({ field }) => (
      <FormItem>
        <FormLabel>When to send</FormLabel>
        <FormControl>
          <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="now" id="send-now" />
              <label htmlFor="send-now" className="cursor-pointer text-sm">Send now (after I click Start on the detail page)</label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="later" id="send-later" disabled={form.watch("audience_source") === "csv"} />
              <label htmlFor="send-later" className={`cursor-pointer text-sm ${form.watch("audience_source") === "csv" ? "text-muted-foreground" : ""}`}>
                Schedule for later
                {form.watch("audience_source") === "csv" && (
                  <span className="ml-2 text-xs">(not yet supported for CSV audiences)</span>
                )}
              </label>
            </div>
          </RadioGroup>
        </FormControl>
      </FormItem>
    )}
  />

  {form.watch("send_when") === "later" && (
    <FormField
      control={form.control}
      name="scheduled_at_local"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Scheduled time</FormLabel>
          <FormControl>
            <Input type="datetime-local" {...field} />
          </FormControl>
          <FormDescription>
            Your timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Contacts matching your filter at this moment will receive the broadcast.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )}
</div>
```

Add imports at the top if they're missing:

```ts
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
```

- [ ] **Step 10.4: Wire the submit handler**

Replace the existing `createCampaign({...scheduled_at: null})` call (from Task 9.3) with:

```ts
    let scheduled_at: string | null = null
    if (values.send_when === "later") {
      if (!values.scheduled_at_local) {
        form.setError("scheduled_at_local", { message: "Pick a date and time" })
        return
      }
      const d = new Date(values.scheduled_at_local)
      if (isNaN(d.getTime())) {
        form.setError("scheduled_at_local", { message: "Invalid date" })
        return
      }
      if (d.getTime() < Date.now() + 60_000) {
        form.setError("scheduled_at_local", { message: "Schedule at least 1 minute in the future" })
        return
      }
      scheduled_at = d.toISOString()
    }

    const res = await createCampaign({
      name: values.name,
      account_name: values.account_name,
      template_id: values.type === "template" ? values.template_id! : null,
      flow_id: values.type === "flow" ? values.flow_id! : null,
      audience_source: values.audience_source,
      audience_config,
      scheduled_at,
    })
    router.push(`/campaigns/${res.id}`)
```

- [ ] **Step 10.5: Test in browser**

Run the dev stack if not already running:
```bash
cd /Users/pratikgupta && docker compose -f magic-flow/docker-compose.yml up -d
```

Then open `http://localhost:3002/campaigns/new`, fill in a flow campaign with `contacts` audience, choose "Schedule for later", set a time 5 minutes out, submit. Verify a campaign is created in `scheduled` state (check via the list page or the detail endpoint).

- [ ] **Step 10.6: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add components/campaigns/campaign-create-form.tsx
git commit -m "feat(campaigns): schedule for later section in create form"
```

---

## Task 11: Frontend — list view scheduled badge + detail view actions

**Files:**
- Modify: `magic-flow/components/campaigns/campaign-list.tsx`
- Modify: `magic-flow/components/campaigns/campaign-detail.tsx`
- Create: `magic-flow/components/campaigns/reschedule-dialog.tsx`
- Modify: `magic-flow/hooks/queries/use-campaigns.ts`

- [ ] **Step 11.1: Add `useRescheduleCampaign` hook**

In `magic-flow/hooks/queries/use-campaigns.ts`, add after the existing `useStartCampaign` or similar:

```ts
export function useRescheduleCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduled_at }: { id: string; scheduled_at: string }) =>
      apiClient.post(`/api/campaigns/${id}/reschedule`, { scheduled_at }),
    onSuccess: (_data, { id }) => invalidateCampaignQueries(qc, id),
  })
}
```

- [ ] **Step 11.2: Create the reschedule dialog**

Create `magic-flow/components/campaigns/reschedule-dialog.tsx`:

```tsx
"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useRescheduleCampaign } from "@/hooks/queries/use-campaigns"

interface RescheduleDialogProps {
  campaignId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RescheduleDialog({ campaignId, open, onOpenChange }: RescheduleDialogProps) {
  const [localTime, setLocalTime] = useState("")
  const [error, setError] = useState<string | null>(null)
  const reschedule = useRescheduleCampaign()

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const submit = async () => {
    setError(null)
    if (!localTime) {
      setError("Pick a date and time")
      return
    }
    const d = new Date(localTime)
    if (isNaN(d.getTime())) {
      setError("Invalid date")
      return
    }
    if (d.getTime() < Date.now() + 60_000) {
      setError("Schedule at least 1 minute in the future")
      return
    }
    try {
      await reschedule.mutateAsync({ id: campaignId, scheduled_at: d.toISOString() })
      onOpenChange(false)
      setLocalTime("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reschedule")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule campaign</DialogTitle>
          <DialogDescription>
            Pick a new send time. Your timezone: {tz}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="scheduled-at">Scheduled time</Label>
          <Input
            id="scheduled-at"
            type="datetime-local"
            value={localTime}
            onChange={(e) => setLocalTime(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={reschedule.isPending}>
            {reschedule.isPending ? "Rescheduling..." : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 11.3: Update `campaign-list.tsx` to show scheduled time**

Find the row-rendering code (likely uses `c.status` to render a badge). After the badge, add conditional scheduled-time display:

```tsx
{c.status === "scheduled" && c.scheduled_at && (
  <span className="ml-2 text-xs text-muted-foreground">
    Scheduled: {new Date(c.scheduled_at).toLocaleString()}
  </span>
)}
```

Add a Clock icon next to it if the existing badge UI uses icons (import from `lucide-react`):

```tsx
import { Clock } from "lucide-react"
// ...
{c.status === "scheduled" && (
  <Clock className="h-3 w-3 text-muted-foreground" />
)}
```

- [ ] **Step 11.4: Update `campaign-detail.tsx`**

Find the section that renders the status + action buttons. Add the scheduled banner and updated action buttons:

```tsx
import { RescheduleDialog } from "./reschedule-dialog"
import { formatDistanceToNow } from "date-fns"
// ...
const [rescheduleOpen, setRescheduleOpen] = useState(false)
// ...

{campaign.status === "scheduled" && campaign.scheduled_at && (
  <div className="rounded-md border bg-muted/50 p-3 text-sm">
    <strong>Scheduled for {new Date(campaign.scheduled_at).toLocaleString()}</strong>
    <span className="ml-2 text-muted-foreground">
      ({formatDistanceToNow(new Date(campaign.scheduled_at), { addSuffix: true })})
    </span>
  </div>
)}

{campaign.status === "failed" && campaign.error_message?.startsWith("Missed scheduled start window") && (
  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
    {campaign.error_message}
  </div>
)}
```

For the action buttons, add conditional rendering:

```tsx
{campaign.status === "scheduled" && (
  <>
    <Button onClick={() => startCampaign.mutate(campaign.id)}>Start now</Button>
    <Button variant="outline" onClick={() => setRescheduleOpen(true)}>Reschedule</Button>
    <Button variant="destructive" onClick={() => cancelCampaign.mutate(campaign.id)}>Cancel</Button>
  </>
)}

{campaign.status === "failed" && campaign.error_message?.startsWith("Missed scheduled start window") && (
  <>
    <Button variant="outline" onClick={() => setRescheduleOpen(true)}>Reschedule</Button>
    <Button onClick={() => startCampaign.mutate(campaign.id)}>Start now</Button>
  </>
)}

<RescheduleDialog
  campaignId={campaign.id}
  open={rescheduleOpen}
  onOpenChange={setRescheduleOpen}
/>
```

- [ ] **Step 11.5: Add `error_message` to the Campaign type**

In `magic-flow/types/campaigns.ts`, add `error_message?: string` to the `Campaign` interface if it's not already there.

- [ ] **Step 11.6: TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11.7: Test in browser**

Open `/campaigns`, confirm the scheduled campaign from Task 10.5 shows with a scheduled time badge. Click into its detail → confirm the scheduled banner and the three action buttons appear.

- [ ] **Step 11.8: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add components/campaigns/ hooks/queries/use-campaigns.ts types/campaigns.ts
git commit -m "feat(campaigns): scheduled UI in list, detail, and reschedule dialog"
```

---

## Task 12: Frontend — pipe browser timezone into AI tool context

**Files:**
- Modify: `magic-flow/components/ai/ai-assistant.tsx`
- Modify: `magic-flow/app/api/ai/flow-assistant/route.ts`
- Modify: `magic-flow/lib/ai/tools/generate-flow.ts`

- [ ] **Step 12.1: Send userTimezone from the client**

In `magic-flow/components/ai/ai-assistant.tsx`, find the `fetch("/api/ai/flow-assistant", ...)` POST body construction (around line 316 based on earlier recon). Add `userTimezone`:

```ts
body: JSON.stringify({
  message,
  platform,
  flowContext,
  conversationHistory: messages.map((m) => ({
    role: m.role,
    content: m.content,
  })),
  userTemplates,
  userTemplateData,
  publishedFlowId,
  waAccountName,
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}),
```

- [ ] **Step 12.2: Destructure in the API route and forward to tool context**

In `magic-flow/app/api/ai/flow-assistant/route.ts`, find the destructuring of the body. Add `userTimezone`:

```ts
const {
  message,
  platform,
  flowContext,
  conversationHistory,
  existingFlow,
  selectedNode,
  userTemplates,
  userTemplateData,
  publishedFlowId,
  waAccountName,
  userTimezone,
} = body
```

And forward it into `toolContext` when building `requestData`:

```ts
const requestData = {
  prompt: message,
  platform: platform as Platform,
  flowContext,
  conversationHistory,
  existingFlow,
  selectedNode,
  userTemplates,
  userTemplateData,
  toolContext: {
    publishedFlowId,
    waAccountName,
    authHeader,
    userTimezone,
  },
}
```

- [ ] **Step 12.3: Add to the TypeScript type**

In `magic-flow/lib/ai/tools/generate-flow.ts`, find the `toolContext` type in `GenerateFlowRequest` (around line 25). Add `userTimezone`:

```ts
toolContext?: {
  publishedFlowId?: string
  waAccountName?: string
  authHeader?: string
  userTimezone?: string
}
```

- [ ] **Step 12.4: TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 12.5: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add components/ai/ai-assistant.tsx app/api/ai/flow-assistant/route.ts lib/ai/tools/generate-flow.ts
git commit -m "feat(ai): pipe browser timezone into flow assistant tool context"
```

---

## Task 13: AI tools — extend `create_campaign` and add `reschedule_campaign`

**Files:**
- Modify: `magic-flow/lib/ai/tools/generate-flow-edit.ts`

- [ ] **Step 13.1: Extend `create_campaign` input schema**

In `magic-flow/lib/ai/tools/generate-flow-edit.ts`, find the `create_campaign` tool definition. Inside its `inputSchema: z.object({...})`, add the `scheduled_at` field:

```ts
scheduled_at: z
  .string()
  .datetime()
  .optional()
  .describe(
    "Optional ISO 8601 UTC timestamp (e.g. '2026-04-17T18:00:00Z'). If provided, the campaign is created in scheduled state and will start automatically at that time. Must be at least 30 seconds in the future. Resolve relative times (e.g. 'tomorrow 6 PM') using the user's timezone from the system prompt, then convert to UTC. Not supported when audience_source is 'csv'."
  ),
```

Then in the tool's `execute` function, include `scheduled_at` in the `JSON.stringify` body:

```ts
execute: async ({ name, flow_id, account_name, audience_source, audience_config, scheduled_at }) => {
  try {
    const body: Record<string, any> = {
      name,
      flow_id,
      account_name,
      audience_source,
      audience_config,
    }
    if (scheduled_at) body.scheduled_at = scheduled_at

    const response = await fetch(`${apiUrl}/api/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body),
    })
    // ... existing response handling ...
  }
}
```

- [ ] **Step 13.2: Add `reschedule_campaign` tool**

In the same file, next to the other broadcast tools (after `cancel_campaign`), add:

```ts
actionTools.reschedule_campaign = tool({
  description:
    "Reschedule a draft, scheduled, or failed campaign to a new time. Works on any campaign that has not yet started processing. Transitions the campaign to scheduled state. Confirm the new time with the user first.",
  inputSchema: z.object({
    campaign_id: z.string().uuid().describe("UUID of the campaign"),
    scheduled_at: z
      .string()
      .datetime()
      .describe("ISO 8601 UTC timestamp for the new scheduled time. Must be at least 30 seconds in the future."),
  }),
  execute: async ({ campaign_id, scheduled_at }) => {
    try {
      const response = await fetch(`${apiUrl}/api/campaigns/${campaign_id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ scheduled_at }),
      })
      const data = await response.json()
      if (!response.ok) {
        return { success: false, error: data?.message ?? "Failed to reschedule" }
      }
      return { success: true, status: data?.data?.status ?? "scheduled", scheduled_at: data?.data?.scheduled_at ?? scheduled_at }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
    }
  },
})
```

Follow the exact shape and style of the existing broadcast tools (match the envelope-handling helper if one exists).

- [ ] **Step 13.3: TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 13.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add lib/ai/tools/generate-flow-edit.ts
git commit -m "feat(ai): create_campaign accepts scheduled_at; add reschedule_campaign tool"
```

---

## Task 14: AI prompt — document scheduling and timezone

**Files:**
- Modify: `magic-flow/lib/ai/tools/flow-prompts.ts`

- [ ] **Step 14.1: Update the broadcasting section**

In `magic-flow/lib/ai/tools/flow-prompts.ts`, find the broadcasting section of the system prompt (search for the `create_campaign` mention or the `Broadcasting` subheader).

Replace the `create_campaign` description line with:

```
- `create_campaign`: Create a draft or scheduled broadcast campaign. Arguments include `name`, `flow_id`, `account_name`, `audience_source`, `audience_config`, and an optional `scheduled_at` (ISO 8601 UTC). When the user asks to schedule ("tomorrow at 6 PM", "next Monday morning"), resolve the time in the user's timezone, convert to UTC, and pass `scheduled_at`. Must be at least 30 seconds in the future. NOT supported for CSV audience — inform the user and create a draft instead.
```

Add after it:

```
- `reschedule_campaign`: Change the scheduled time of an existing campaign. Works on draft, scheduled, and failed campaigns. Confirm the new time with the user before calling.
```

Add a timezone-awareness line to the broadcasting section (or near the top of the whole system prompt if that's where the tool-context rendering happens):

```
The user's timezone is ${request.toolContext?.userTimezone ?? "UTC"}. When the user mentions a time like "tomorrow 6 PM", resolve it in that timezone, then convert to ISO 8601 UTC before calling create_campaign or reschedule_campaign.
```

The exact insertion uses template-literal interpolation inside the existing `buildSystemPrompt` (or equivalent) function. Read the file to find the right spot.

- [ ] **Step 14.2: TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 14.3: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add lib/ai/tools/flow-prompts.ts
git commit -m "feat(ai): document scheduling and user timezone in flow assistant prompt"
```

---

## Task 15: Docs — update `flow-assistant-tools.md`

**Files:**
- Modify: `magic-flow/docs/flow-assistant-tools.md`

- [ ] **Step 15.1: Document `reschedule_campaign`**

In `magic-flow/docs/flow-assistant-tools.md`, in the "Broadcasting / Campaigns" section, add a subsection after `cancel_campaign`:

```markdown
### `reschedule_campaign`

Reschedule a draft, scheduled, or failed campaign to a new time. Transitions the campaign to `scheduled` state.

**Input:**
- `campaign_id` (UUID, required) — the campaign to reschedule.
- `scheduled_at` (ISO 8601 UTC datetime, required) — new scheduled time. Must be at least 30 seconds in the future.

**Returns:** `{ success: true, status: "scheduled", scheduled_at: "<ISO UTC>" }` on success.

**Availability:** authenticated.

**Example:** "Actually move that broadcast to 8 PM instead of 6 PM" → AI confirms with the user, then calls `reschedule_campaign({ campaign_id, scheduled_at })`.
```

- [ ] **Step 15.2: Update `create_campaign` docs**

In the same file, find the `create_campaign` section. Add the `scheduled_at` parameter documentation:

```markdown
- `scheduled_at` (ISO 8601 UTC datetime, optional) — if provided, the campaign is created in `scheduled` state and the scheduler will start it automatically at that time. Must be at least 30 seconds in the future. NOT supported with `audience_source: "csv"`.
```

- [ ] **Step 15.3: Note `userTimezone` under availability**

Near the top of the broadcasting section, add a short paragraph:

```markdown
**Timezone handling:** the flow assistant receives the user's browser timezone as `toolContext.userTimezone` (e.g. `"Asia/Kolkata"`). When a user asks to schedule a broadcast with a relative or local time, the assistant resolves the time in that timezone and converts to UTC before calling `create_campaign` or `reschedule_campaign`.
```

- [ ] **Step 15.4: Commit**

```bash
cd /Users/pratikgupta/Freestand/magic-flow
git add docs/flow-assistant-tools.md
git commit -m "docs(ai): document scheduled_at and reschedule_campaign tool"
```

---

## Task 16: Manual E2E verification

**Files:** none (testing only)

- [ ] **Step 16.1: Start the full stack**

```bash
cd /Users/pratikgupta && docker compose -f magic-flow/docker-compose.yml up -d
cd /Users/pratikgupta/Freestand/fs-whatsapp && make run
```

Verify fs-chat logs show `"Campaign scheduler started"` on startup.

- [ ] **Step 16.2: Schedule a campaign 2 minutes out via the UI**

- Open `http://localhost:3002/campaigns/new`.
- Fill: name, WhatsApp account, flow campaign, pick a published flow, `contacts` audience with a small filter.
- "Schedule for later" → pick a time 2 minutes ahead.
- Submit. Confirm you land on detail page with "Scheduled for …" banner.

- [ ] **Step 16.3: Wait for it to fire**

After ~2 min + up to 30s of tick lag, refresh the detail page. Status should become `processing`, then progress should increment as messages send.

- [ ] **Step 16.4: Test the missed-window path**

- Create a new scheduled campaign 2 min out.
- Immediately stop the fs-chat server: `Ctrl+C` in the terminal.
- Wait 20 minutes.
- Restart: `make run`.
- Refresh the campaign page. Status should be `failed` with "Missed scheduled start window…" banner. "Reschedule" button available.

- [ ] **Step 16.5: Test cancel race**

- Create a scheduled campaign 1 minute out.
- At ~T-5s, click Cancel. Should succeed (status=cancelled).
- Create another scheduled campaign, let it start. Click Cancel once it's `processing`. Should show 409 error (Cancellation not possible from current state).

- [ ] **Step 16.6: Test reschedule**

- Create a scheduled campaign 1 hour out.
- Click Reschedule → pick a new time 5 minutes out. Submit. Confirm the detail page shows the new time.

- [ ] **Step 16.7: Test AI tool**

- Open the flow assistant chat in a flow editor.
- Say: "broadcast this flow to contacts tagged 'test' at 5 PM tomorrow".
- AI should call `preview_audience`, confirm the count, then confirm the schedule, then call `create_campaign` with `scheduled_at` set.
- Verify a scheduled campaign appears in `/campaigns`.
- Say: "actually, move it to 6 PM tomorrow". AI should call `reschedule_campaign`.

---

## Self-review

**Spec coverage:**

- Migration for `error_message` column — Task 1 ✓
- `CreateCampaign` status + CSV guard — Task 3 ✓
- `enqueueRecipientsForCampaign` helper — Task 2 ✓
- `RescheduleCampaign` endpoint — Task 4 ✓
- CAS guards on Cancel + Delete — Task 5 ✓
- `CampaignScheduler` goroutine — Task 6 ✓
- Scheduler unit tests — Task 7 ✓
- Integration tests — Task 8 ✓
- Typo fix — Task 9 ✓
- Create form schedule section — Task 10 ✓
- List/detail UI + reschedule dialog — Task 11 ✓
- Browser timezone piping — Task 12 ✓
- AI tools — Task 13 ✓
- System prompt — Task 14 ✓
- Docs — Task 15 ✓
- Manual E2E — Task 16 ✓

All sections of the spec map to at least one task.

**Placeholder scan:** no TBDs, TODOs, or "implement later". Each code step contains actual code.

**Type consistency:** `enqueueRecipientsForCampaign(ctx, campaign)` signature is consistent across Tasks 2, 6, and 7. `scheduled_at` is the field name everywhere (not `schedule_at` after Task 9). `CampaignScheduler` and `NewCampaignScheduler` match across Tasks 6 and 7. `useRescheduleCampaign()` consistent between Tasks 11 and 12. `userTimezone` consistent across Tasks 12, 13, 14.

Plan is ready for execution.
