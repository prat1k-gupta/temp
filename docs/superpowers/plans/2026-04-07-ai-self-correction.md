# AI Self-Correction Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI flow generation self-correcting — when the AI produces a flow with warnings (skipped nodes, trimmed buttons, missing connections, variable mismatches), feed the issues back to the AI and let it fix them before returning to the user.

**Architecture:** Add a `validateGeneratedFlow()` function that runs the converter + variable validation on AI output. In CREATE mode, if issues are found, re-call Haiku with the issues as feedback (max 2 retries). In EDIT mode, add a `validate_result` tool so Sonnet can validate its own edits and self-correct within the same tool-use session.

**Tech Stack:** TypeScript, Vercel AI SDK, Zod, existing converter (`whatsapp-converter.ts`) and validator (`flow-variables.ts`)

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `utils/flow-validator.ts` | New. Validates AI-generated flow nodes/edges — runs converter trial, variable check, connectivity check. Returns structured issues. | Create |
| `lib/ai/tools/generate-flow.ts` | Core flow generation. Add self-correction loop in CREATE mode, add `validate_result` tool in EDIT mode. | Modify |
| `utils/__tests__/flow-validator.test.ts` | Tests for the validator. | Create |
| `lib/ai/tools/__tests__/generate-flow.test.ts` | Tests for the self-correction integration. | Modify |

---

### Task 1: Create `flow-validator.ts` — the validation engine

This is the core new module. It takes AI-generated nodes/edges and returns a structured list of issues the AI can understand and fix.

**Files:**
- Create: `utils/flow-validator.ts`
- Test: `utils/__tests__/flow-validator.test.ts`

**What it does:**
1. **Connectivity check** — finds orphaned nodes (no incoming edges), dead-end nodes (no outgoing edges, except flowComplete), and disconnected subgraphs.
2. **Variable consistency** — calls `validateFlowVariables()` to find references to undefined variables.
3. **Converter trial** — runs `convertToFsWhatsApp()` in a try/catch to detect conversion failures (invalid node types, missing data).
4. **Button/option limits** — checks if any quickReply exceeds platform button limits before the builder silently trims them.
5. **Empty content** — checks for nodes with no question/text/message content.

Returns a `FlowValidationResult` with categorized issues and a human-readable summary string suitable for injection into an AI prompt.

- [ ] **Step 1: Write the failing tests**

```typescript
// utils/__tests__/flow-validator.test.ts
import { describe, it, expect } from "vitest"
import { validateGeneratedFlow } from "../flow-validator"
import type { Node, Edge } from "@xyflow/react"

function makeNode(id: string, type: string, data: Record<string, any> = {}, position = { x: 0, y: 0 }): Node {
  return { id, type, position, data: { platform: "whatsapp", label: type, ...data } }
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return { id: `e-${source}-${target}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) }
}

describe("validateGeneratedFlow", () => {
  it("returns no issues for a valid linear flow", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "What is your name?", storeAs: "name" }),
      makeNode("q2", "whatsappQuestion", { question: "Hello {{name}}, what is your email?", storeAs: "email" }),
    ]
    const edges = [
      makeEdge("1", "q1"),
      makeEdge("q1", "q2"),
    ]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues).toHaveLength(0)
    expect(result.isValid).toBe(true)
  })

  it("detects orphaned nodes with no incoming edges", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Name?" }),
      makeNode("q2", "whatsappQuestion", { question: "Email?" }), // orphaned — no edge pointing to it
    ]
    const edges = [
      makeEdge("1", "q1"),
    ]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "orphaned_node" && i.nodeId === "q2")).toBe(true)
  })

  it("detects undefined variable references", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "Hello {{customer_name}}", storeAs: "name" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "undefined_variable")).toBe(true)
  })

  it("detects button count exceeding platform limit", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("qr1", "whatsappQuickReply", {
        question: "Pick one",
        buttons: [
          { id: "b0", text: "A" },
          { id: "b1", text: "B" },
          { id: "b2", text: "C" },
          { id: "b3", text: "D" },
          { id: "b4", text: "E" },
        ],
      }),
    ]
    const edges = [makeEdge("1", "qr1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "button_limit_exceeded")).toBe(true)
  })

  it("detects empty message content", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "", storeAs: "name" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "empty_content")).toBe(true)
  })

  it("detects apiFetch with unconnected success/error handles", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("api1", "apiFetch", { url: "https://example.com", label: "Fetch CRM" }),
    ]
    const edges = [makeEdge("1", "api1")]
    // No success or error edges from api1
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.issues.some(i => i.type === "unconnected_handle" && i.nodeId === "api1")).toBe(true)
  })

  it("formats issues into AI-readable summary", () => {
    const nodes = [
      makeNode("1", "start"),
      makeNode("q1", "whatsappQuestion", { question: "" }),
    ]
    const edges = [makeEdge("1", "q1")]
    const result = validateGeneratedFlow(nodes, edges, "whatsapp")
    expect(result.summary).toContain("empty_content")
    expect(typeof result.summary).toBe("string")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd magic-flow && npx vitest run utils/__tests__/flow-validator.test.ts`
Expected: FAIL — module `../flow-validator` not found

- [ ] **Step 3: Implement `flow-validator.ts`**

```typescript
// utils/flow-validator.ts
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { validateFlowVariables } from "./flow-variables"
import { convertToFsWhatsApp } from "./whatsapp-converter"
import { BUTTON_LIMITS } from "@/constants/platform-limits"
import { isMultiOutputType, getFixedHandles, getBaseNodeType } from "./platform-helpers"

export interface FlowIssue {
  type:
    | "orphaned_node"
    | "dead_end"
    | "undefined_variable"
    | "button_limit_exceeded"
    | "empty_content"
    | "unconnected_handle"
    | "converter_error"
  nodeId?: string
  nodeLabel?: string
  detail: string
}

export interface FlowValidationResult {
  isValid: boolean
  issues: FlowIssue[]
  summary: string
}

const SKIP_TYPES = new Set(["start", "comment", "flowComplete"])
const CONTENT_FIELDS = ["question", "text", "message"]

export function validateGeneratedFlow(
  nodes: Node[],
  edges: Edge[],
  platform: Platform
): FlowValidationResult {
  const issues: FlowIssue[] = []
  const contentNodes = nodes.filter(n => !SKIP_TYPES.has(n.type || ""))

  // 1. Connectivity: orphaned nodes (no incoming edges except start's first target)
  const incomingTargets = new Set(edges.map(e => e.target))
  const startTargets = new Set(
    edges.filter(e => e.source === "1").map(e => e.target)
  )
  for (const node of contentNodes) {
    if (startTargets.has(node.id)) continue // connected to start
    if (!incomingTargets.has(node.id)) {
      issues.push({
        type: "orphaned_node",
        nodeId: node.id,
        nodeLabel: (node.data as any)?.label || node.type || "",
        detail: `Node "${(node.data as any)?.label || node.id}" has no incoming connections — it will never be reached.`,
      })
    }
  }

  // 2. Unconnected handles on multi-output nodes (apiFetch success/error, buttons)
  const outgoingByNode = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!outgoingByNode.has(edge.source)) outgoingByNode.set(edge.source, new Set())
    outgoingByNode.get(edge.source)!.add(edge.sourceHandle || "default")
  }

  for (const node of contentNodes) {
    const nodeType = node.type || ""
    const fixedHandles = getFixedHandles(nodeType)
    if (fixedHandles) {
      // e.g. apiFetch must have "success" and "error" handles connected
      const connectedHandles = outgoingByNode.get(node.id) || new Set()
      for (const handle of fixedHandles) {
        if (!connectedHandles.has(handle)) {
          issues.push({
            type: "unconnected_handle",
            nodeId: node.id,
            nodeLabel: (node.data as any)?.label || nodeType,
            detail: `Node "${(node.data as any)?.label || node.id}" (${nodeType}) has no connection from its "${handle}" handle.`,
          })
        }
      }
    }
  }

  // 3. Variable consistency
  const varErrors = validateFlowVariables(nodes)
  for (const err of varErrors) {
    issues.push({
      type: "undefined_variable",
      nodeId: err.nodeId,
      nodeLabel: err.nodeLabel,
      detail: `Node "${err.nodeLabel}" references undefined variables: ${err.unknownVars.map(v => `{{${v}}}`).join(", ")}. Either add a prior step that stores this variable, or fix the reference.`,
    })
  }

  // 4. Button/option limits
  const buttonLimit = BUTTON_LIMITS[platform] || 3
  for (const node of contentNodes) {
    const baseType = getBaseNodeType(node.type || "")
    const data = node.data as Record<string, any>
    if (baseType === "quickReply" && Array.isArray(data.buttons)) {
      if (data.buttons.length > buttonLimit) {
        issues.push({
          type: "button_limit_exceeded",
          nodeId: node.id,
          nodeLabel: data.label || node.type || "",
          detail: `Node "${data.label || node.id}" has ${data.buttons.length} buttons but ${platform} allows max ${buttonLimit}. Either reduce to ${buttonLimit} buttons or use an interactiveList node instead.`,
        })
      }
    }
  }

  // 5. Empty content
  for (const node of contentNodes) {
    const data = node.data as Record<string, any>
    const baseType = getBaseNodeType(node.type || "")
    // Skip action nodes (they set variables, don't need message content)
    if (baseType === "action" || baseType === "condition" || baseType === "apiFetch") continue
    const hasContent = CONTENT_FIELDS.some(f => typeof data[f] === "string" && data[f].trim().length > 0)
    if (!hasContent) {
      issues.push({
        type: "empty_content",
        nodeId: node.id,
        nodeLabel: data.label || node.type || "",
        detail: `Node "${data.label || node.id}" has no message content. Add a question or text.`,
      })
    }
  }

  // 6. Converter trial (catch structural issues the above checks miss)
  try {
    const converted = convertToFsWhatsApp(nodes, edges, "validation_test")
    if (converted.steps.length === 0 && contentNodes.length > 0) {
      issues.push({
        type: "converter_error",
        detail: "Converter produced 0 steps from a non-empty flow. Nodes may be disconnected from the start node.",
      })
    }
  } catch (err) {
    issues.push({
      type: "converter_error",
      detail: `Converter failed: ${err instanceof Error ? err.message : "Unknown error"}. The flow structure may be invalid.`,
    })
  }

  const summary = issues.length === 0
    ? ""
    : `Found ${issues.length} issue(s) in the generated flow:\n${issues.map((i, idx) => `${idx + 1}. [${i.type}] ${i.detail}`).join("\n")}`

  return {
    isValid: issues.length === 0,
    issues,
    summary,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd magic-flow && npx vitest run utils/__tests__/flow-validator.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
cd magic-flow
git add utils/flow-validator.ts utils/__tests__/flow-validator.test.ts
git commit -m "feat: add flow-validator for AI self-correction"
```

---

### Task 2: Add self-correction loop to CREATE mode

In CREATE mode, after `buildFlowFromPlan()` returns nodes/edges/warnings, run `validateGeneratedFlow()`. If issues exist, feed them back to Haiku and ask it to regenerate. Max 2 retries.

**Files:**
- Modify: `lib/ai/tools/generate-flow.ts:718-737` (CREATE mode block)
- Test: `lib/ai/tools/__tests__/generate-flow.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `lib/ai/tools/__tests__/generate-flow.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest"
import { deduplicateEdges, buildFlowGraphString } from "../generate-flow"
import type { Edge, Node } from "@xyflow/react"

// ... existing deduplicateEdges tests ...

describe("buildFlowGraphString", () => {
  it("returns '(empty flow)' for empty nodes", () => {
    expect(buildFlowGraphString([], [])).toBe("(empty flow)")
  })
})
```

Note: The self-correction loop calls the AI client internally, so full integration testing requires mocking `getAIClient().generateJSON()`. We test the validator independently in Task 1, and here we verify the public surface (`generateFlow`) handles the retry plumbing correctly through a focused unit test on the retry helper.

Add a test for the retry feedback prompt builder:

```typescript
// In generate-flow.test.ts — test the correction prompt builder
import { buildCorrectionPrompt } from "../generate-flow"

describe("buildCorrectionPrompt", () => {
  it("includes all issues in the correction prompt", () => {
    const issues = [
      { type: "orphaned_node" as const, nodeId: "q2", detail: 'Node "q2" has no incoming connections.' },
      { type: "button_limit_exceeded" as const, nodeId: "qr1", detail: 'Node "qr1" has 5 buttons but whatsapp allows 3.' },
    ]
    const prompt = buildCorrectionPrompt(issues, "whatsapp")
    expect(prompt).toContain("orphaned_node")
    expect(prompt).toContain("button_limit_exceeded")
    expect(prompt).toContain("whatsapp")
    expect(prompt).toContain("5 buttons")
  })

  it("returns empty string when no issues", () => {
    expect(buildCorrectionPrompt([], "whatsapp")).toBe("")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd magic-flow && npx vitest run lib/ai/tools/__tests__/generate-flow.test.ts`
Expected: FAIL — `buildCorrectionPrompt` is not exported

- [ ] **Step 3: Implement the self-correction loop**

Modify `lib/ai/tools/generate-flow.ts`. Add the import and helper, then modify the CREATE mode block.

**Add import at top of file (line 17):**
```typescript
import { validateGeneratedFlow, type FlowIssue } from "@/utils/flow-validator"
```

**Add the exported correction prompt builder (after `deduplicateEdges` function, around line 77):**

```typescript
/**
 * Build a correction prompt from validation issues.
 * Returns empty string if no issues.
 */
export function buildCorrectionPrompt(issues: FlowIssue[], platform: Platform): string {
  if (issues.length === 0) return ""
  const issueList = issues
    .map((i, idx) => `${idx + 1}. [${i.type}]${i.nodeId ? ` (node: ${i.nodeId})` : ""}: ${i.detail}`)
    .join("\n")
  return `Your previous flow plan had ${issues.length} issue(s) that need fixing for ${platform}:\n\n${issueList}\n\nPlease regenerate the flow plan with these issues fixed. Keep the same overall structure but correct the problems listed above.`
}
```

**Replace the CREATE mode block (lines 718-737) with:**

```typescript
      } else {
        // CREATE MODE: LLM outputs a semantic plan, code builds the flow
        // Use Haiku for speed — plan structure is simple and well-constrained by the schema
        const MAX_CORRECTION_RETRIES = 2
        let lastPlan: FlowPlan | null = null
        let lastWarnings: string[] = []
        let correctionAttempt = 0

        for (let attempt = 0; attempt <= MAX_CORRECTION_RETRIES; attempt++) {
          const isRetry = attempt > 0
          const correctionFeedback = isRetry && lastPlan
            ? buildCorrectionPrompt(
                validateGeneratedFlow(
                  buildFlowFromPlan(lastPlan, request.platform).nodes,
                  buildFlowFromPlan(lastPlan, request.platform).edges,
                  request.platform
                ).issues,
                request.platform
              )
            : ""

          const effectiveUserPrompt = isRetry
            ? `${userPrompt}\n\n--- CORRECTION FEEDBACK ---\n${correctionFeedback}`
            : userPrompt

          const plan = await aiClient.generateJSON<FlowPlan>({
            systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
            userPrompt: effectiveUserPrompt,
            schema: flowPlanSchema,
            model: 'claude-haiku',
          })

          const { nodes, edges, nodeOrder, warnings } = buildFlowFromPlan(plan, request.platform)
          const validation = validateGeneratedFlow(nodes, edges, request.platform)

          if (validation.isValid || attempt === MAX_CORRECTION_RETRIES) {
            // Either clean or we've exhausted retries — return what we have
            const allWarnings = [
              ...warnings,
              ...(validation.issues.length > 0 ? [`Self-correction: ${validation.issues.length} issue(s) remain after ${attempt} correction attempt(s)`] : []),
              ...(attempt > 0 && validation.isValid ? [`Self-correction: fixed ${correctionAttempt} issue(s) in ${attempt} attempt(s)`] : []),
            ]
            return {
              message: plan.message || "Flow generated successfully",
              flowData: { nodes, edges, nodeOrder },
              action: "create" as const,
              warnings: allWarnings.length > 0 ? allWarnings : undefined,
              debugData: { rawPlan: plan, correctionAttempts: attempt },
            }
          }

          // Issues found — retry
          console.log(`[generate-flow] Self-correction attempt ${attempt + 1}: ${validation.issues.length} issues found`, validation.summary)
          lastPlan = plan
          lastWarnings = warnings
          correctionAttempt = validation.issues.length
        }

        // TypeScript needs this but it's unreachable (the loop always returns)
        return { message: "Flow generated", action: "create" as const }
      }
```

**Important:** The above code calls `buildFlowFromPlan` twice on retries (once for validation, once implicit). Optimize by caching:

Replace the retry block's correction feedback section with this optimized version:

```typescript
        let cachedBuild: { nodes: Node[]; edges: Edge[]; nodeOrder: string[]; warnings: string[] } | null = null

        for (let attempt = 0; attempt <= MAX_CORRECTION_RETRIES; attempt++) {
          const isRetry = attempt > 0
          const correctionFeedback = isRetry && cachedBuild
            ? buildCorrectionPrompt(
                validateGeneratedFlow(cachedBuild.nodes, cachedBuild.edges, request.platform).issues,
                request.platform
              )
            : ""

          const effectiveUserPrompt = isRetry
            ? `${userPrompt}\n\n--- CORRECTION FEEDBACK ---\n${correctionFeedback}`
            : userPrompt

          const plan = await aiClient.generateJSON<FlowPlan>({
            systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
            userPrompt: effectiveUserPrompt,
            schema: flowPlanSchema,
            model: 'claude-haiku',
          })

          const build = buildFlowFromPlan(plan, request.platform)
          const validation = validateGeneratedFlow(build.nodes, build.edges, request.platform)

          if (validation.isValid || attempt === MAX_CORRECTION_RETRIES) {
            const allWarnings = [
              ...build.warnings,
              ...(attempt > 0 && validation.isValid ? [`Self-corrected ${correctionAttempt} issue(s) in ${attempt} retry(s)`] : []),
              ...(attempt > 0 && !validation.isValid ? [`${validation.issues.length} issue(s) remain after ${attempt} correction retry(s)`] : []),
            ]
            return {
              message: plan.message || "Flow generated successfully",
              flowData: { nodes: build.nodes, edges: build.edges, nodeOrder: build.nodeOrder },
              action: "create" as const,
              warnings: allWarnings.length > 0 ? allWarnings : undefined,
              debugData: { rawPlan: plan, correctionAttempts: attempt, remainingIssues: validation.issues.length },
            }
          }

          console.log(`[generate-flow] Self-correction attempt ${attempt + 1}: ${validation.issues.length} issues`, validation.summary)
          cachedBuild = build
          correctionAttempt = validation.issues.length
        }

        return { message: "Flow generated", action: "create" as const }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd magic-flow && npx vitest run lib/ai/tools/__tests__/generate-flow.test.ts`
Expected: All tests PASS (existing deduplicateEdges + new buildCorrectionPrompt)

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd magic-flow && npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd magic-flow
git add lib/ai/tools/generate-flow.ts lib/ai/tools/__tests__/generate-flow.test.ts
git commit -m "feat: add self-correction loop to AI CREATE mode

Validates AI-generated flows after buildFlowFromPlan and feeds issues
back to Haiku for correction (max 2 retries). Catches orphaned nodes,
undefined variables, button limit violations, and empty content."
```

---

### Task 3: Add `validate_result` tool to EDIT mode

In EDIT mode, Sonnet already has 3 tools (`get_node_details`, `get_node_connections`, `apply_edit`). Add a 4th tool: `validate_result`. After calling `apply_edit`, Sonnet can call `validate_result` to check its work and self-correct.

**Files:**
- Modify: `lib/ai/tools/generate-flow.ts:539-717` (EDIT mode block)

- [ ] **Step 1: Add the `validate_result` tool registration**

Inside the EDIT mode `generateText` call (around line 545), in the `tools` object (after the `apply_edit` tool definition, around line 651), add:

```typescript
            validate_result: tool({
              description: 'Validate the current state of the flow after applying edits. Call this after apply_edit to check for issues like orphaned nodes, missing connections, undefined variables, or button limit violations. If issues are found, call apply_edit again to fix them.',
              inputSchema: z.object({}),
              execute: async () => {
                // Build current flow state: existing nodes/edges + applied edits
                const currentNodes = [...existingNodes]
                const currentEdges = [...existingEdges]

                if (finalEditResult) {
                  // Add new nodes
                  currentNodes.push(...finalEditResult.newNodes)
                  // Add new edges
                  currentEdges.push(...finalEditResult.newEdges)
                  // Apply node updates
                  for (const update of finalEditResult.nodeUpdates) {
                    const idx = currentNodes.findIndex(n => n.id === update.nodeId)
                    if (idx !== -1) {
                      currentNodes[idx] = {
                        ...currentNodes[idx],
                        type: update.newType || currentNodes[idx].type,
                        data: { ...currentNodes[idx].data, ...update.data },
                      }
                    }
                  }
                  // Remove deleted nodes
                  const removeIds = new Set(finalEditResult.removeNodeIds)
                  const filteredNodes = currentNodes.filter(n => !removeIds.has(n.id))
                  // Remove deleted edges
                  const removeEdgeKeys = new Set(
                    finalEditResult.removeEdges.map(e => `${e.source}-${e.target}-${e.sourceHandle || ""}`)
                  )
                  const filteredEdges = currentEdges.filter(e =>
                    !removeEdgeKeys.has(`${e.source}-${e.target}-${e.sourceHandle || ""}`)
                  )

                  const validation = validateGeneratedFlow(filteredNodes, filteredEdges, request.platform)
                  return {
                    valid: validation.isValid,
                    issueCount: validation.issues.length,
                    issues: validation.issues.map(i => ({ type: i.type, nodeId: i.nodeId, detail: i.detail })),
                    suggestion: validation.isValid
                      ? "Flow looks good — no issues found."
                      : "Issues found. Call apply_edit to fix them, then validate_result again.",
                  }
                }

                return {
                  valid: false,
                  issueCount: 0,
                  issues: [],
                  suggestion: "No edits applied yet. Call apply_edit first.",
                }
              },
            }),
```

- [ ] **Step 2: Update the system prompt to instruct Sonnet to validate**

In `buildSystemPrompt()` (around line 822), find the edit-mode instructions section. Add this to the edit-mode system prompt (inside the `if (isEdit)` block):

```typescript
// Add to the edit system prompt, after the tool descriptions
prompt += `\n\n**SELF-CORRECTION:** After calling apply_edit, ALWAYS call validate_result to check your work. If issues are found, call apply_edit again to fix them. Do not return to the user with unresolved issues.`
```

- [ ] **Step 3: Increase step limit from 8 to 12**

The `validate_result` + correction cycle needs extra steps. Change line 653:

```typescript
          stopWhen: stepCountIs(12),  // was 8 — increased for validate+correct cycle
```

- [ ] **Step 4: Run full test suite**

Run: `cd magic-flow && npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd magic-flow
git add lib/ai/tools/generate-flow.ts
git commit -m "feat: add validate_result tool to AI EDIT mode

Sonnet can now validate its own edits after apply_edit. Catches
orphaned nodes, variable mismatches, and unconnected handles.
System prompt instructs AI to always validate before returning."
```

---

### Task 4: Wire up the text-fallback path

The text-generation fallback path (lines 740-814) also builds flows from plans but has no validation. Add the same correction loop there.

**Files:**
- Modify: `lib/ai/tools/generate-flow.ts:758-806` (fallback plan parsing)

- [ ] **Step 1: Add validation to the CREATE fallback path**

In the fallback section (around line 798), after `buildFlowFromPlan` is called, add validation:

```typescript
          } else {
            const plan = flowPlanSchema.parse(rawPlan)
            const { nodes, edges, nodeOrder, warnings } = buildFlowFromPlan(plan, request.platform)

            // Validate — but no retry in fallback path (already a fallback, don't compound latency)
            const validation = validateGeneratedFlow(nodes, edges, request.platform)
            const allWarnings = [
              ...warnings,
              ...(validation.issues.length > 0 ? validation.issues.map(i => `[${i.type}] ${i.detail}`) : []),
            ]

            return {
              message: plan.message || "Flow generated successfully",
              flowData: { nodes, edges, nodeOrder },
              action: "create",
              warnings: allWarnings.length > 0 ? allWarnings : undefined,
            }
          }
```

Note: No retry loop in the fallback path — this is already a fallback from structured output failure. Adding retries here would compound latency. Instead, just surface the issues as warnings so the user sees them.

- [ ] **Step 2: Run full test suite**

Run: `cd magic-flow && npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd magic-flow
git add lib/ai/tools/generate-flow.ts
git commit -m "feat: add validation to text-fallback flow generation path

Surfaces validation issues as warnings when the structured output
fallback is used. No retry loop — just transparent issue reporting."
```

---

### Task 5: Manual end-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `cd magic-flow && docker compose up` (or however the dev server starts)

- [ ] **Step 2: Test CREATE mode self-correction**

1. Open MagicFlow in browser
2. Create a new WhatsApp flow
3. In the AI chat panel, type: "Create a flow that asks for the customer's name, then sends a message saying Hello {{customer_name}}, please share your email"
   - The variable `{{customer_name}}` doesn't match the storeAs (which will be `name`)
   - The self-correction loop should detect this and fix it to `{{name}}`
4. Verify the generated flow has correct variable references

- [ ] **Step 3: Test CREATE mode with button limits**

1. In the AI chat panel, type: "Create a flow that asks the user to pick from 5 product categories: Electronics, Clothing, Food, Home, Sports"
   - WhatsApp only allows 3 buttons
   - The AI should either split into an interactiveList or reduce to 3 buttons
4. Verify no warnings toast appears (issues were self-corrected)

- [ ] **Step 4: Test EDIT mode validation**

1. Create a flow with a quickReply node manually
2. Use AI to edit: "Add an API call after the first question that checks our inventory"
3. Verify the API node has both success and error handles connected
4. Check browser console for `[generate-flow] Self-correction` or `validate_result` tool call logs

- [ ] **Step 5: Commit verification notes** (optional — only if issues found that need documenting)
