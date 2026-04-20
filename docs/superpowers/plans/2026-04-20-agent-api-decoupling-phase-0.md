# Phase 0 — Template-First Prompt Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relax the broadcast "template-first" system prompt rule in magic-flow so the AI walks past server-side nodes (`apiFetch`, `action`, `transfer`, `condition`, `flowComplete`, integrations) when checking whether a flow's first user-facing message is a `templateMessage`. Matches backend behavior, which doesn't care about node position.

**Architecture:** Prompt-only change in `magic-flow/lib/ai/tools/flow-prompts.ts`. Replace the rigid "node immediately after Start" block (lines 61-66) with a walk-based rule listing 15 skip types and 16 user-facing types. Unit-test `buildSystemPrompt()` output via string assertions.

**Tech Stack:** TypeScript, Vitest.

**Spec reference:** `docs/superpowers/specs/2026-04-20-agent-api-decoupling.md` — Phase 0.

---

## Scope Check

Single-file prompt change. No subsystems. No dependencies. One commit.

## File Structure

- `magic-flow/lib/ai/tools/flow-prompts.ts` — replace the broadcast template rule block.
- `magic-flow/lib/ai/tools/__tests__/flow-prompts.test.ts` — new test file; `buildSystemPrompt` is not currently covered. Single-responsibility: prompt-string assertions.

Why a new test file rather than appending to `generate-flow.test.ts`: the latter tests `applyNodeUpdates`, `deduplicateEdges`, `recoverUnvalidatedEdit`, `EDIT_STEP_BUDGET`, etc. Mixing prompt snapshot assertions into it would muddy a file already at 544 lines.

---

## Task 1: Confirm current state

**Files:**
- Read: `magic-flow/lib/ai/tools/flow-prompts.ts:60-67`

- [ ] **Step 1: Open the file and locate the rule block**

Run: `npx grep -n "Template-first rule" magic-flow/lib/ai/tools/flow-prompts.ts` (or use editor line jump).

Expected: one match, inside a template-literal around line 61-66.

- [ ] **Step 2: Confirm the exact text to replace**

The current block inside the `isEdit && request.toolContext?.authHeader` conditional is:

```
**Template-first rule for broadcasts.** WhatsApp only permits initiating messages outside the 24-hour session window via approved templates. Broadcasts almost always target cold recipients, so any flow intended for broadcast MUST start (the node immediately after Start) with a \`templateMessage\` node referencing an approved template — otherwise WhatsApp will reject every send. When the user asks to broadcast a new flow or an existing flow whose entry node is not a template:
1. Call \`list_templates\` first (defaults to APPROVED) to see what's available.
2. Pick the template that best matches the user's stated goal (feedback → a feedback template, promo → a promo template, etc.) and confirm the choice with the user.
3. If no approved template fits, offer to draft one using \`create_template\` and submit it via \`submit_template\` — or tell the user the broadcast has to wait until Meta approves it.
4. Only skip this rule if the user explicitly says something like "skip the template" or "send without a template" — and in that case warn them the broadcast will fail on cold recipients.
Do NOT create a campaign for a flow that starts with a plain \`whatsappMessage\` node. Check the entry node before calling \`create_campaign\`.
```

No code change in this task. Verify the above exactly matches what's in the file so the Task 4 replacement lands cleanly.

---

## Task 2: Create failing test — new skip list present

**Files:**
- Create: `magic-flow/lib/ai/tools/__tests__/flow-prompts.test.ts`

- [ ] **Step 1: Create the test file with fixture and first test**

Write this file:

```typescript
import { describe, it, expect } from "vitest"
import { buildSystemPrompt } from "../flow-prompts"
import type { GenerateFlowRequest } from "../generate-flow"

function makeEditBroadcastRequest(): GenerateFlowRequest {
  return {
    prompt: "Broadcast this flow to contacts in Delhi",
    platform: "whatsapp",
    existingFlow: { nodes: [], edges: [] },
    toolContext: {
      authHeader: "Bearer whm_test",
      publishedFlowId: "f_test",
      waAccountName: "Test Account",
      userTimezone: "Asia/Kolkata",
      currentTime: "2026-04-20T10:00:00Z",
    },
  }
}

describe("buildSystemPrompt — broadcast template-first rule", () => {
  it("lists every server-side node type to skip when walking", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    const skipTypes = [
      "apiFetch",
      "action",
      "transfer",
      "condition",
      "flowComplete",
      "shopify",
      "stripe",
      "zapier",
      "google",
      "salesforce",
      "mailchimp",
      "twilio",
      "slack",
      "airtable",
      "metaAudience",
    ]

    for (const type of skipTypes) {
      expect(prompt, `skip list missing "${type}"`).toContain(type)
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd magic-flow && npx vitest run lib/ai/tools/__tests__/flow-prompts.test.ts`

Expected: FAIL on at least one skip-list type (current prompt mentions a few node types in other sections but not all 15 in a single block).

---

## Task 3: Add second failing test — three-branch rule structure

**Files:**
- Modify: `magic-flow/lib/ai/tools/__tests__/flow-prompts.test.ts`

- [ ] **Step 1: Append the test**

Add inside the existing `describe(...)`:

```typescript
  it("describes all three branches: template-first, other-user-facing, no-user-facing", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    // Branch 1: first user-facing IS a templateMessage → proceed.
    expect(prompt).toMatch(/templateMessage.*proceed/i)

    // Branch 2: first user-facing is some other type → warn about cold recipients.
    expect(prompt).toMatch(/warm.*24-hour/i)

    // Branch 3: no user-facing messages → proceed (action-only flow).
    expect(prompt).toMatch(/no user-facing messages/i)
  })

  it("lists every user-facing node type so the AI knows what to count as a message", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    const userFacingTypes = [
      "templateMessage",
      "whatsappMessage",
      "instagramDM",
      "instagramStory",
      "question",
      "quickReply",
      "interactiveList",
      "whatsappFlow",
      "name",
      "email",
      "dob",
      "address",
      "homeDelivery",
      "trackingNotification",
      "event",
      "retailStore",
    ]

    for (const type of userFacingTypes) {
      expect(prompt, `user-facing list missing "${type}"`).toContain(type)
    }
  })
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd magic-flow && npx vitest run lib/ai/tools/__tests__/flow-prompts.test.ts`

Expected: all three tests FAIL (current prompt has none of these substrings).

---

## Task 4: Add third failing test — old rigid wording is gone

**Files:**
- Modify: `magic-flow/lib/ai/tools/__tests__/flow-prompts.test.ts`

- [ ] **Step 1: Append the regression test**

Add inside the existing `describe(...)`:

```typescript
  it("no longer demands templateMessage be immediately after Start", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    // These phrases rejected valid apiFetch → templateMessage flows. The fix
    // removes them; this test fails if they creep back in.
    expect(prompt).not.toMatch(/immediately after Start/i)
    expect(prompt).not.toMatch(
      /Do NOT create a campaign for a flow that starts with a plain .?whatsappMessage/i
    )
  })
```

- [ ] **Step 2: Run the test — this one should currently PASS in reverse**

Run: `cd magic-flow && npx vitest run lib/ai/tools/__tests__/flow-prompts.test.ts`

Expected: this specific test FAILS because the current prompt contains "immediately after Start". Other tests (from Tasks 2 and 3) also fail. Total: 4 failing tests.

---

## Task 5: Replace the prompt block

**Files:**
- Modify: `magic-flow/lib/ai/tools/flow-prompts.ts:61-66`

- [ ] **Step 1: Replace the old block with the new walk-based rule**

Find the block identified in Task 1. Replace it with:

```
**Template-first rule for broadcasts.** WhatsApp only permits initiating messages outside the 24-hour session window via approved templates. Walk the flow from Start and find the first **user-facing message node** — skip these server-side types: \`apiFetch\`, \`action\`, \`transfer\`, \`condition\`, \`flowComplete\`, \`shopify\`, \`stripe\`, \`zapier\`, \`google\`, \`salesforce\`, \`mailchimp\`, \`twilio\`, \`slack\`, \`airtable\`, \`metaAudience\`.

User-facing node types are: \`templateMessage\`, \`whatsappMessage\`, \`instagramDM\`, \`instagramStory\`, \`question\`, \`quickReply\`, \`interactiveList\`, \`whatsappFlow\`, \`name\`, \`email\`, \`dob\`, \`address\`, \`homeDelivery\`, \`trackingNotification\`, \`event\`, \`retailStore\`.

- **First user-facing = \`templateMessage\`** → proceed normally (still verify approval status per the rules below).
- **First user-facing = any other type** → warn the user: "The first user-facing message in this flow isn't a template. Meta rejects non-template first messages to cold recipients, so this broadcast will only work for warm 24-hour-window recipients. Add a templateMessage at the top or confirm you want to proceed."
- **No user-facing messages at all** (pure action/integration flow) → proceed. It's a data-pipeline broadcast.

If no approved template fits the user's stated goal, offer to draft one using \`create_template\` and submit it via \`submit_template\`. The backend enforces only template-APPROVED-status on existing \`templateMessage\` nodes — it does NOT check position or existence, so don't refuse a campaign it would accept.
```

The block sits inside a template literal (backticks), so `${...}` expressions and `\`` escapes in surrounding code are unchanged. The replacement text uses `\`` to escape backticks for node-type names, matching the surrounding style.

No other edits to this file.

- [ ] **Step 2: Run the 4 tests, all should now PASS**

Run: `cd magic-flow && npx vitest run lib/ai/tools/__tests__/flow-prompts.test.ts`

Expected: all 4 tests PASS.

---

## Task 6: Confirm no regressions in the wider test suite

**Files:** none modified.

- [ ] **Step 1: Run the full vitest suite**

Run: `cd magic-flow && npx vitest run`

Expected: all tests pass. The existing `generate-flow.test.ts` does not assert on prompt text, so it is unaffected.

If anything fails that isn't from the new file, investigate. Do NOT proceed to Task 7 until the suite is green.

- [ ] **Step 2: TypeScript check**

Run: `cd magic-flow && npx tsc --noEmit`

Expected: zero errors.

---

## Task 7: Manual AI behavior sanity check

**Files:** none modified. Smoke-test in the running dev environment.

This is a non-automated sanity test, because prompt behavior is enforced by the LLM, not by the code. Skip if the dev stack is not running locally; the Task 6 unit tests are sufficient gate for the PR.

- [ ] **Step 1: Start the dev stack**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && docker compose up -d`

Wait for the app to be accessible at `http://localhost:3002`.

- [ ] **Step 2: Case A — `apiFetch → templateMessage` flow**

In the builder UI, create a flow: `start → apiFetch → templateMessage(approved)`. Publish it. In the AI chat, ask: "Broadcast this flow to contacts in Delhi."

Expected: AI proceeds with `preview_audience` and `create_campaign` without complaining that the template isn't immediately after Start.

If it complains: the prompt wasn't picked up (Docker hot-reload didn't catch the file change); restart the container.

- [ ] **Step 3: Case B — action-only flow**

Create a flow with only server-side nodes: `start → apiFetch → action`. Publish. Ask the AI to broadcast.

Expected: AI proceeds without demanding a template.

- [ ] **Step 4: Case C — `start → whatsappMessage` flow**

Create a flow: `start → whatsappMessage`. Publish. Ask the AI to broadcast.

Expected: AI warns that the broadcast will only work for warm 24-hour-window recipients, and asks for confirmation. Does not block outright.

---

## Task 8: Commit

**Files:** already modified in Tasks 2-5.

- [ ] **Step 1: Review the diff**

Run: `cd magic-flow && git status && git diff lib/ai/tools/flow-prompts.ts lib/ai/tools/__tests__/flow-prompts.test.ts`

Expected:
- `flow-prompts.ts` has exactly the 6-line replacement described in Task 5.
- `flow-prompts.test.ts` is a new file with 4 tests.
- Nothing else is modified.

- [ ] **Step 2: Stage both files**

Run: `cd magic-flow && git add lib/ai/tools/flow-prompts.ts lib/ai/tools/__tests__/flow-prompts.test.ts`

- [ ] **Step 3: Create the commit**

Run:

```bash
cd magic-flow && git commit -m "$(cat <<'EOF'
feat(prompt): relax template-first rule to walk past server-side nodes

The broadcast template-first rule previously required templateMessage
immediately after Start. That rejected legitimate flows like
start -> apiFetch -> templateMessage (apiFetch runs server-side, the
template is still the first user-facing message) and action-only flows
with no messages at all.

Backend already accepts both cases: checkBroadcastTemplateStatus in
fs-whatsapp only validates template approval status, never position or
existence. Prompt now matches: walk past 15 server-side types to find
the first user-facing message; warn (not refuse) if it's non-template;
allow action-only flows.

Adds lib/ai/tools/__tests__/flow-prompts.test.ts covering the skip list,
three-branch rule structure, full user-facing type list, and regression
guard against the old rigid wording.

Spec: docs/superpowers/specs/2026-04-20-agent-api-decoupling.md
EOF
)"
```

Expected: commit succeeds. Note: no `Co-Authored-By` watermark per project convention.

- [ ] **Step 4: Verify the commit**

Run: `cd magic-flow && git log -1 --stat`

Expected: one commit showing two files changed, exactly the two files above.

---

## Self-Review Checklist

- [ ] Spec coverage — every bullet in Phase 0's Acceptance Criteria has a corresponding task:
  - Prompt no longer says "node immediately after Start" → Task 4 test + Task 5 replacement.
  - Skip list matches 15 server-side types → Task 2 test + Task 5 replacement.
  - Manual test of `apiFetch → templateMessage` → Task 7 Step 2.
  - Manual test of action-only flow → Task 7 Step 3.
  - Manual test of plain `whatsappMessage` → Task 7 Step 4.
  - Tests cover all three cases → Tasks 2-4.
- [ ] No placeholders — every code block is complete and runnable.
- [ ] Type consistency — `buildSystemPrompt`, `GenerateFlowRequest`, `makeEditBroadcastRequest` are used with the same shapes across tasks.
- [ ] File paths — all absolute or clearly `magic-flow/`-relative with the `cd magic-flow` prefix where needed.

---

## Rollback

If Phase 0 causes any regression, revert the commit:

```bash
cd magic-flow && git revert <commit-sha>
```

The prompt change is pure prose — no data migration, no schema change. Reverting restores the old rigid rule cleanly.
