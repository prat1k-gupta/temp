import { z } from "zod"
import { generateText, streamText, smoothStream, tool, stepCountIs } from "ai"
import { getModel } from "../core/models"
import { editFlowPlanSchema } from "@/types/flow-plan"
import type { EditFlowPlan } from "@/types/flow-plan"
import { buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import type { BuildEditFlowResult } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import { collectFlowVariablesRich } from "@/utils/flow-variables"
import { createNode } from "@/utils/node-factory"
import { getBaseNodeType } from "@/utils/platform-helpers"
import { normalizeAiNodeType } from "@/utils/ai-data-transform"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata, TemplateResolver } from "@/types"
import type {
  GenerateFlowRequest,
  GenerateFlowResponse,
  NodeBrief,
  StreamEvent,
  ToolStepDetails,
  UpdateBrief,
} from "./generate-flow"
import { buildToolStepPayload, nodeBrief } from "./generate-flow"
import { createListTemplatesTool } from "./list-templates"
import { createTemplateCrudTools } from "./template-crud"
import { flattenFlow } from "@/utils/flow-flattener"
import { convertToFsWhatsApp } from "@/utils/whatsapp-converter"

/**
 * Max tool-use steps the edit-mode agent may take before the runtime forces
 * a stop. Complex multi-branch edits often need one or two apply_edit retries
 * plus a validate_result call — too-tight a budget silently drops the final
 * apply_edit before it can be validated. See `recoverUnvalidatedEdit` for the
 * fail-safe that catches that edge case.
 */
export const EDIT_STEP_BUDGET = 20

/**
 * Fail-safe for the streaming edit path when the AI ran apply_edit but never
 * got to validate_result (usually because it exhausted the step budget mid-
 * iteration). Runs the same validation validate_result would have run, and
 * returns the editResult if it's actually valid. Returns null if there's
 * nothing to recover or the unvalidated state doesn't pass — in which case
 * the canvas correctly stays untouched.
 *
 * IMPORTANT: this MUST mirror what validate_result does exactly, otherwise
 * recovered edits could ship with subtly different semantics than they
 * would have through the normal path. We achieve that by calling the same
 * buildCurrentNodes/buildCurrentEdges helpers validate_result uses.
 */
export function recoverUnvalidatedEdit(
  finalEditResult: BuildEditFlowResult | null,
  existingNodes: Node[],
  existingEdges: Edge[],
  platform: Platform,
): BuildEditFlowResult | null {
  if (!finalEditResult) return null

  const filteredNodes = buildCurrentNodes(existingNodes, finalEditResult, platform)
  const filteredEdges = buildCurrentEdges(existingEdges, finalEditResult)
  const validation = validateGeneratedFlow(filteredNodes, filteredEdges, platform)
  return validation.isValid ? finalEditResult : null
}

/**
 * Merge a single nodeUpdate into an existing node. Shared by applyNodeUpdates
 * (the commit path) and buildCurrentNodes (the validator path) so both produce
 * the same shape for the same input.
 *
 * Same-type (or same-base-type) update: merges
 * `{ ...existing.data, ...update.data }` — preserves fields the AI didn't touch.
 * The AI prompt encourages base-type names like "interactiveList", while
 * existing nodes use platform-prefixed types like "whatsappInteractiveList".
 * Base-type normalization prevents false cross-type detection that would
 * factory-reset and drop user data.
 *
 * Cross-type change (base types differ): replaces data with factory defaults
 * from `createNode(baseType)` and overlays update.data on top. Drops stale
 * fields from the old type so quickReply → apiFetch leaves no choices
 * baggage. Node ID and position are preserved so incoming edges stay
 * connected.
 *
 * If createNode throws (unknown newType), falls back to merging data on top of
 * the EXISTING type — not the garbage newType — so the node doesn't end up
 * with a type the rest of the app can't render.
 */
function mergeNodeUpdate(
  existing: Node,
  update: { nodeId: string; data?: Record<string, any>; newType?: string },
  platform: Platform
): Node {
  const newBaseType = update.newType ? getBaseNodeType(update.newType) : undefined
  const existingBaseType = getBaseNodeType(existing.type || "")
  const isTypeChange = !!update.newType && newBaseType !== existingBaseType

  if (isTypeChange) {
    try {
      // getBaseNodeType normalizes list types to "list", but createNode
      // registers them as "interactiveList" — normalizeAiNodeType bridges
      // that mismatch. Use it for any AI-emitted newType.
      const factoryType = normalizeAiNodeType(update.newType!, platform)
      const factoryNode = createNode(factoryType, platform, existing.position, existing.id)
      return {
        ...existing,
        type: factoryNode.type,
        data: { ...factoryNode.data, ...update.data },
      }
    } catch {
      console.warn(
        `[applyNodeUpdates] createNode failed for newType "${update.newType}" (base "${newBaseType}") on platform "${platform}" — falling back to merge with existing type`
      )
      return {
        ...existing,
        data: { ...existing.data, ...update.data },
      }
    }
  }

  return {
    ...existing,
    data: { ...existing.data, ...update.data },
  }
}

/**
 * Convert nodeUpdates (partial updates) to full Node objects by merging with existing nodes.
 *
 * Outgoing edge topology (same-topology preserve / fan-out / collapse / refuse)
 * for cross-type changes is handled upstream in the edit builder; this function
 * only touches node data.
 */
export function applyNodeUpdates(
  nodeUpdates: Array<{ nodeId: string; data?: Record<string, any>; newType?: string }>,
  existingNodes: Node[],
  platform: Platform
): Node[] {
  return nodeUpdates.map((update) => {
    const existing = existingNodes.find((n) => n.id === update.nodeId)
    if (!existing) return null
    return mergeNodeUpdate(existing, update, platform)
  }).filter(Boolean) as Node[]
}

/**
 * Execute edit mode: tool-use agent loop with Sonnet.
 * The AI inspects nodes/edges, applies edits, validates, and self-corrects.
 */
export async function executeEditMode(
  request: GenerateFlowRequest,
  systemPrompt: string,
  userPrompt: string,
  templateResolver: TemplateResolver | undefined,
): Promise<GenerateFlowResponse> {
  const existingNodes = request.existingFlow?.nodes || []
  const existingEdges = request.existingFlow?.edges || []
  let finalEditResult: BuildEditFlowResult | null = null as BuildEditFlowResult | null
  let finalTemplateMetadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata } | null = null

  const result = await generateText({
    model: getModel('claude-sonnet'),
    system: systemPrompt,
    prompt: userPrompt,
    tools: createEditTools(existingNodes, existingEdges, request, templateResolver, {
      setEditResult: (r) => { finalEditResult = r },
      setTemplateMetadata: (m) => { finalTemplateMetadata = m },
      getEditResult: () => finalEditResult,
    }, request.toolContext),
    stopWhen: stepCountIs(EDIT_STEP_BUDGET),
    temperature: 0.3,
    onStepFinish: (step) => {
      const calls = step.toolCalls?.map((tc: any) => ({
        tool: tc.toolName,
        input: tc.toolName === 'apply_edit'
          ? { chains: tc.args?.chains?.length, nodeUpdates: tc.args?.nodeUpdates?.length, removeNodeIds: tc.args?.removeNodeIds?.length, addEdges: tc.args?.addEdges?.length }
          : tc.args,
      }))
      const results = step.toolResults?.map((tr: any) => ({
        tool: tr.toolName,
        result: tr.result,
      }))
      console.log(`[generate-flow] Step (${step.finishReason}):`, JSON.stringify({ calls, results }, null, 2))
    },
  })

  const aiMessage = result.text || 'Flow updated successfully'

  console.log("[generate-flow] Tool-use edit completed:", {
    steps: result.steps.length,
    hasEditResult: !!finalEditResult,
    message: aiMessage.substring(0, 100),
  })

  // AI called save_as_template — return metadata for confirmation
  if (finalTemplateMetadata) {
    return {
      message: aiMessage,
      action: "save_as_template",
      templateMetadata: finalTemplateMetadata,
    }
  }

  if (!finalEditResult) {
    return {
      message: aiMessage,
      action: "edit",
    }
  }

  const updatedNodes = applyNodeUpdates(finalEditResult.nodeUpdates, existingNodes, request.platform)

  return {
    message: aiMessage,
    updates: {
      nodes: [...updatedNodes, ...finalEditResult.newNodes],
      edges: finalEditResult.newEdges,
      removeNodeIds: finalEditResult.removeNodeIds.length > 0 ? finalEditResult.removeNodeIds : undefined,
      removeEdges: finalEditResult.removeEdges.length > 0 ? finalEditResult.removeEdges : undefined,
      positionShifts: finalEditResult.positionShifts.length > 0 ? finalEditResult.positionShifts : undefined,
    },
    action: "edit",
    warnings: finalEditResult.warnings.length > 0 ? finalEditResult.warnings : undefined,
    debugData: {
      toolSteps: result.steps.length,
      toolTrace: result.steps.map((s: any) => ({
        finishReason: s.finishReason,
        toolCalls: s.toolCalls?.map((tc: any) => tc.toolName),
        warnings: s.toolResults?.flatMap((tr: any) => tr.result?.warnings || []),
      })),
    },
  }
}

/**
 * Streaming variant of executeEditMode.
 * Uses streamText() and emits StreamEvents for tool steps, text deltas, and the final result.
 */
export async function executeEditModeStreaming(
  request: GenerateFlowRequest,
  systemPrompt: string,
  userPrompt: string,
  templateResolver: TemplateResolver | undefined,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const existingNodes = request.existingFlow?.nodes || []
  const existingEdges = request.existingFlow?.edges || []
  // `finalEditResult` is whatever the latest apply_edit produced (may be
  // invalid — it gets rejected later by validate_result). `validatedEditResult`
  // is only set when validate_result confirms the current finalEditResult
  // passes validation. The end-of-stream `result` event MUST gate on
  // validatedEditResult, not finalEditResult — otherwise an apply → validate
  // fail → give up sequence would ship the unvalidated state to the canvas.
  let finalEditResult: BuildEditFlowResult | null = null as BuildEditFlowResult | null
  let validatedEditResult: BuildEditFlowResult | null = null as BuildEditFlowResult | null
  // Tracks whether the current validatedEditResult has already been shipped
  // to the client via flow_ready. Reset on every apply_edit so a fresh edit
  // can re-emit; guards against the AI calling validate_result twice in a
  // row with the same successful state (which would otherwise re-apply the
  // edit to the canvas and double-track every change).
  let flowReadyEmittedForResult: BuildEditFlowResult | null = null
  let finalTemplateMetadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata } | null = null
  // Set by publish_flow tool when it saves a new version to the DB.
  // Edit route handlers check this to skip their own version save.
  let versionSavedByTool = false

  const result = streamText({
    model: getModel('claude-sonnet'),
    system: systemPrompt,
    prompt: userPrompt,
    tools: createEditTools(existingNodes, existingEdges, request, templateResolver, {
      setEditResult: (r) => {
        finalEditResult = r
        // New apply_edit invalidates any prior validation and clears the
        // flow_ready dedupe key.
        validatedEditResult = null
        flowReadyEmittedForResult = null
      },
      setValidatedEditResult: (r) => { validatedEditResult = r },
      markFlowReadyEmitted: (r) => { flowReadyEmittedForResult = r },
      hasFlowReadyBeenEmittedFor: (r) => flowReadyEmittedForResult === r,
      setTemplateMetadata: (m) => { finalTemplateMetadata = m },
      getEditResult: () => finalEditResult,
      markVersionSavedByTool: () => { versionSavedByTool = true },
    }, request.toolContext, emit),
    stopWhen: stepCountIs(EDIT_STEP_BUDGET),
    temperature: 0.3,
    // Character-level smoothing. The model emits text in bursts (sometimes
    // several words at once, sometimes a whole sentence); forwarding raw
    // deltas makes the chat "pop" instead of flow. smoothStream buffers and
    // drains one character at a time — feels like live typing. Delay tuned
    // so natural model speed still dictates pacing: when the model is slow,
    // the buffer is empty and the transform is a no-op; when the model
    // bursts, we stretch the burst across ~8ms per char.
    experimental_transform: smoothStream({
      delayInMs: 8,
      chunking: (buffer: string) => buffer[0] ?? null,
    }),
    experimental_onToolCallStart: ({ toolCall }) => {
      emit({ type: 'tool_step', tool: toolCall.toolName, status: 'running' })
    },
    experimental_onToolCallFinish: ({ toolCall, ...rest }) => {
      const output = 'output' in rest && rest.success ? rest.output : undefined
      const payload = buildToolStepPayload(toolCall.toolName, output)
      emit({
        type: 'tool_step',
        tool: toolCall.toolName,
        status: 'done',
        summary: payload.summary,
        details: payload.details,
      })
    },
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        emit({ type: 'text_delta', delta: chunk.text })
      }
    },
    onStepFinish: (step) => {
      const calls = step.toolCalls?.map((tc: any) => ({
        tool: tc.toolName,
        input: tc.toolName === 'apply_edit'
          ? { chains: tc.args?.chains?.length, nodeUpdates: tc.args?.nodeUpdates?.length, removeNodeIds: tc.args?.removeNodeIds?.length, addEdges: tc.args?.addEdges?.length }
          : tc.args,
      }))
      const results = step.toolResults?.map((tr: any) => ({
        tool: tr.toolName,
        result: tr.result,
      }))
      console.log(`[generate-flow] Streaming step (${step.finishReason}):`, JSON.stringify({ calls, results }, null, 2))
    },
  })

  const aiMessage = await result.text || 'Flow updated successfully'

  console.log("[generate-flow] Streaming tool-use edit completed:", {
    hasEditResult: !!finalEditResult,
    message: aiMessage.substring(0, 100),
  })

  if (finalTemplateMetadata) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: "save_as_template",
        templateMetadata: finalTemplateMetadata,
        versionSavedByTool,
      },
    })
    return
  }

  // Gate the final result event on VALIDATED state, not merely applied state.
  // If the AI ran apply_edit and then gave up without a passing validate_result
  // (or hit the step budget mid-fix), we must NOT ship that unvalidated editResult
  // to the canvas. validatedEditResult is only set inside validate_result's
  // execute on success, so its presence means "the AI's latest state is known
  // good".
  //
  // Fail-safe: if the AI exhausted its step budget with a successful
  // apply_edit still sitting in finalEditResult (common cause: a complex flow
  // that needed multiple apply_edit retries to reach a valid plan), run the
  // same validation validate_result would have run and adopt the result if it
  // passes. This keeps the canvas gate strict (broken intermediate states
  // still never ship) while preventing silent data loss on truncation.
  if (!validatedEditResult && finalEditResult) {
    const recovered = recoverUnvalidatedEdit(
      finalEditResult,
      existingNodes,
      existingEdges,
      request.platform,
    )
    if (recovered) {
      console.warn("[generate-flow] Recovered unvalidated apply_edit after step-budget exhaustion")
      validatedEditResult = recovered
    }
  }

  // If still nothing validated, send a message-only result — the AI's
  // explanatory text still reaches the user, but the canvas stays untouched.
  if (!validatedEditResult) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: "edit",
        versionSavedByTool,
      },
    })
    return
  }

  const updatedNodes = applyNodeUpdates(validatedEditResult.nodeUpdates, existingNodes, request.platform)

  emit({
    type: 'result',
    data: {
      message: aiMessage,
      updates: {
        nodes: [...updatedNodes, ...validatedEditResult.newNodes],
        edges: validatedEditResult.newEdges,
        removeNodeIds: validatedEditResult.removeNodeIds.length > 0 ? validatedEditResult.removeNodeIds : undefined,
        removeEdges: validatedEditResult.removeEdges.length > 0 ? validatedEditResult.removeEdges : undefined,
        positionShifts: validatedEditResult.positionShifts.length > 0 ? validatedEditResult.positionShifts : undefined,
      },
      action: "edit",
      warnings: validatedEditResult.warnings.length > 0 ? validatedEditResult.warnings : undefined,
      versionSavedByTool,
    },
  })
}

interface EditToolCallbacks {
  setEditResult: (result: BuildEditFlowResult | null) => void
  /** Called from validate_result only when validation passes. Gates the final result event. */
  setValidatedEditResult?: (result: BuildEditFlowResult | null) => void
  /** Record that flow_ready has been emitted for a specific editResult — dedupes repeat validate_result calls. */
  markFlowReadyEmitted?: (result: BuildEditFlowResult) => void
  /** Check whether flow_ready already fired for this editResult. */
  hasFlowReadyBeenEmittedFor?: (result: BuildEditFlowResult) => boolean
  setTemplateMetadata: (metadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata }) => void
  getEditResult: () => BuildEditFlowResult | null
  /** Called by publish_flow when it saves a version. Lets the edit endpoint skip its own createVersion call. */
  markVersionSavedByTool?: () => void
}

/**
 * Build the current flow state by merging existing nodes with applied edits.
 * Shared by validate_result and list_variables tools. Uses the same
 * mergeNodeUpdate helper as applyNodeUpdates so the validator sees the exact
 * shape that will eventually be committed.
 */
function buildCurrentNodes(
  existingNodes: Node[],
  editResult: BuildEditFlowResult | null,
  platform: Platform,
): Node[] {
  if (!editResult) return [...existingNodes]
  const nodes = [...existingNodes, ...editResult.newNodes]
  for (const update of editResult.nodeUpdates) {
    const idx = nodes.findIndex(n => n.id === update.nodeId)
    if (idx !== -1) {
      nodes[idx] = mergeNodeUpdate(nodes[idx], update, platform)
    }
  }
  const removeIds = new Set(editResult.removeNodeIds)
  return nodes.filter(n => !removeIds.has(n.id))
}

function buildCurrentEdges(
  existingEdges: Edge[],
  editResult: BuildEditFlowResult | null,
): Edge[] {
  if (!editResult) return [...existingEdges]
  const edges = [...existingEdges, ...editResult.newEdges]
  const removeEdgeKeys = new Set(
    editResult.removeEdges.map(e => `${e.source}-${e.target}-${e.sourceHandle || ""}`)
  )
  return edges.filter(e =>
    !removeEdgeKeys.has(`${e.source}-${e.target}-${e.sourceHandle || ""}`)
  )
}

function createEditTools(
  existingNodes: Node[],
  existingEdges: Edge[],
  request: GenerateFlowRequest,
  templateResolver: TemplateResolver | undefined,
  callbacks: EditToolCallbacks,
  toolContext?: GenerateFlowRequest['toolContext'],
  emit?: (event: StreamEvent) => void,
) {
  const baseTools = {
    get_node_details: tool({
      description: 'Get full details of a node including choice handle IDs, storeAs, and content. Call this before editing nodes with choices to get exact handle IDs for attachHandle and removeEdges.',
      inputSchema: z.object({
        nodeId: z.string().describe('The node ID (e.g. "plan-quickReply-2-x7f3")'),
      }),
      execute: async ({ nodeId }) => {
        const node = existingNodes.find(n => n.id === nodeId)
        if (!node) return { error: `Node "${nodeId}" not found` }
        const data = node.data as Record<string, any>
        const details: Record<string, any> = {
          id: node.id,
          type: node.type,
          label: data?.label,
        }
        if (data?.question) details.question = data.question
        if (data?.text) details.text = data.text
        if (data?.storeAs) details.storeAs = data.storeAs
        if (data?.choices) {
          details.choices = (data.choices as any[]).map((c: any, i: number) => ({
            index: i, text: c.text || c.label, id: c.id, handleId: c.id || `button-${i}`,
          }))
        }
        return details
      },
    }),

    get_node_connections: tool({
      description: 'Get all edges connected to a node (incoming and outgoing with handle IDs). Use this to know which edges to remove when rewiring.',
      inputSchema: z.object({
        nodeId: z.string().describe('The node ID to get connections for'),
      }),
      execute: async ({ nodeId }) => {
        const outgoing = existingEdges
          .filter(e => e.source === nodeId)
          .map(e => ({ target: e.target, sourceHandle: e.sourceHandle || 'default' }))
        const incoming = existingEdges
          .filter(e => e.target === nodeId)
          .map(e => ({ source: e.source, sourceHandle: e.sourceHandle || 'default' }))
        return { nodeId, outgoing, incoming }
      },
    }),

    apply_edit: tool({
      description: 'Apply an edit plan to the flow. Include ALL operations (chains, nodeUpdates, addEdges, removeNodeIds, removeEdges) in a SINGLE call. Do NOT split across multiple calls or call with an empty plan.',
      inputSchema: editFlowPlanSchema,
      execute: async (plan) => {
        try {
          const hasOperations = (plan.chains && plan.chains.length > 0) ||
            (plan.nodeUpdates && plan.nodeUpdates.length > 0) ||
            (plan.addEdges && plan.addEdges.length > 0) ||
            (plan.removeNodeIds && plan.removeNodeIds.length > 0) ||
            (plan.removeEdges && plan.removeEdges.length > 0)
          if (!hasOperations) {
            return {
              success: false,
              error: 'Empty plan — no operations provided. If your edit is complete, just respond with your message. Do NOT call apply_edit again.',
            }
          }

          const editResult = buildEditFlowFromPlan(
            plan as EditFlowPlan,
            request.platform,
            existingNodes,
            existingEdges,
            templateResolver,
            toolContext?.approvedTemplates,
          )

          console.log("[generate-flow] Tool apply_edit result:", {
            newNodes: editResult.newNodes.length,
            newEdges: editResult.newEdges.map(e => `${e.source} → ${e.target} (handle: ${e.sourceHandle || "default"})`),
            nodeUpdates: editResult.nodeUpdates.length,
            removeNodeIds: editResult.removeNodeIds,
            removeEdges: editResult.removeEdges,
            warnings: editResult.warnings,
          })

          // If the builder had to skip any operation (unresolved addEdge
          // source/target, self-loop, nodeUpdate targeting a missing ID,
          // etc.), fail the whole apply_edit so the AI sees the specific
          // reason and retries with a correct plan. This prevents a
          // half-applied edit from reaching validate_result / the canvas.
          //
          // IMPORTANT: match "nodeUpdate target " with the trailing literal
          // (not just "nodeUpdate ") — flow-plan-builder emits other
          // "nodeUpdate "-prefixed warnings for BENIGN events like the
          // quickReply → interactiveList auto-convert, which must pass
          // through as non-fatal. Only the "target not found — skipped"
          // case is a hard skip that must roll back.
          const skipWarnings = editResult.warnings.filter(
            (w) =>
              w.startsWith("addEdge ") ||
              w.startsWith("nodeUpdate target ") ||
              w.startsWith("ambiguous_type_change ")
          )
          if (skipWarnings.length > 0) {
            // Roll back: don't store this editResult as the canonical one.
            // Since callbacks.setEditResult replaces the stored result, we
            // simply don't store it — the previous (possibly null) state
            // remains the canonical editResult.
            console.warn("[generate-flow] Tool apply_edit has skipped operations, failing:", skipWarnings)
            return {
              success: false,
              error: `apply_edit plan was malformed — ${skipWarnings.length} operation(s) could not be applied`,
              skippedOperations: skipWarnings,
              suggestion: "Fix the plan and call apply_edit again. Common causes: (1) referencing a newly-created node by a made-up ID in addEdges — use nodeUpdate with newType to change an existing node's type in place instead; (2) referencing a node that was removed in the same plan; (3) self-referencing edges; (4) nodeUpdate target not found — call get_node_details first to confirm; (5) ambiguous_type_change — the new type has different outgoing handles than the old, and the edge mapping isn't unique. Ask the user which old targets should map to which new handles, then retry with explicit addEdges/removeEdges.",
            }
          }

          callbacks.setEditResult(editResult)

          // NOTE: Do not emit flow_ready here. The canvas should only commit
          // after validate_result has confirmed the edit has no structural
          // issues — otherwise a broken intermediate state paints first and
          // the AI's follow-up fix paints over it. validate_result is the
          // one that emits flow_ready on success.

          // Build chat-UI rendering details — who was added/removed/updated,
          // with short previews — so the tool step card shows concrete changes
          // instead of just counts.
          const addedBriefs = editResult.newNodes
            .map(n => nodeBrief(n))
            .filter(Boolean) as NodeBrief[]
          const removedBriefs = editResult.removeNodeIds
            .map(id => existingNodes.find(n => n.id === id))
            .map(n => nodeBrief(n))
            .filter(Boolean) as NodeBrief[]
          const updatedBriefs: UpdateBrief[] = editResult.nodeUpdates.map(u => {
            const existing = existingNodes.find(n => n.id === u.nodeId)
            return {
              type: (u.newType || existing?.type || 'node')
                .replace(/^whatsapp|^instagram|^web|^line/i, '')
                .replace(/([A-Z])/g, ' $1')
                .trim() || 'node',
              label: (existing?.data as any)?.label,
              fields: Object.keys(u.data || {}),
            }
          })

          return {
            success: true,
            summary: {
              newNodes: editResult.newNodes.length,
              newEdges: editResult.newEdges.length,
              nodeUpdates: editResult.nodeUpdates.length,
              removedNodes: editResult.removeNodeIds.length,
              removedEdges: editResult.removeEdges.length,
            },
            details: {
              kind: 'edit' as const,
              added: addedBriefs,
              removed: removedBriefs,
              updated: updatedBriefs,
              edgesAdded: editResult.newEdges.length,
              edgesRemoved: editResult.removeEdges.length,
            },
            warnings: editResult.warnings.length > 0 ? editResult.warnings : undefined,
          }
        } catch (error) {
          console.error("[generate-flow] Tool apply_edit error:", error)
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error building edit',
          }
        }
      },
    }),

    validate_result: tool({
      description: 'Validate the current state of the flow after applying edits. Call this after apply_edit to check for issues like orphaned nodes, missing connections, undefined variables, or button limit violations. If issues are found, call apply_edit again to fix them. On success, the canvas is committed with the validated edit.',
      inputSchema: z.object({}),
      execute: async () => {
        const finalEditResult = callbacks.getEditResult()
        if (!finalEditResult) {
          return {
            valid: false,
            issueCount: 0,
            issues: [],
            suggestion: "No edits applied yet. Call apply_edit first.",
          }
        }

        const filteredNodes = buildCurrentNodes(existingNodes, finalEditResult, request.platform)
        const filteredEdges = buildCurrentEdges(existingEdges, finalEditResult)

        const validation = validateGeneratedFlow(filteredNodes, filteredEdges, request.platform)
        console.log("[generate-flow] Tool validate_result:", {
          valid: validation.isValid,
          issueCount: validation.issues.length,
          issues: validation.issues.map(i => ({ type: i.type, nodeId: i.nodeId, detail: i.detail })),
        })

        // On success, mark the editResult as validated (gates the final
        // result event) and emit flow_ready so the canvas commits in
        // parallel with the rest of the text streaming. If validation
        // failed, do NOT mark validated and do NOT emit — the broken
        // state must not reach the canvas; the AI will call apply_edit
        // again to fix the issues.
        //
        // Dedupe: if the AI calls validate_result twice in a row with
        // the same successful editResult, emit flow_ready only once —
        // otherwise handleUpdateFlow re-tracks every change and the
        // stagger animation plays twice.
        if (validation.isValid) {
          callbacks.setValidatedEditResult?.(finalEditResult)
          const alreadyEmitted = callbacks.hasFlowReadyBeenEmittedFor?.(finalEditResult) ?? false
          if (emit && !alreadyEmitted) {
            const updatedNodes = applyNodeUpdates(finalEditResult.nodeUpdates, existingNodes, request.platform)
            emit({
              type: 'flow_ready',
              updates: {
                nodes: [...updatedNodes, ...finalEditResult.newNodes],
                edges: finalEditResult.newEdges,
                removeNodeIds: finalEditResult.removeNodeIds.length > 0 ? finalEditResult.removeNodeIds : undefined,
                removeEdges: finalEditResult.removeEdges.length > 0 ? finalEditResult.removeEdges : undefined,
                positionShifts: finalEditResult.positionShifts.length > 0 ? finalEditResult.positionShifts : undefined,
              },
              action: 'edit',
              warnings: finalEditResult.warnings.length > 0 ? finalEditResult.warnings : undefined,
            })
            callbacks.markFlowReadyEmitted?.(finalEditResult)
          }
        }

        // Issues sent back to the LLM: include the hint so the AI knows
        // how to fix. Issues for UI details: short detail only, no hint,
        // no remediation noise.
        const issuesForAI = validation.issues.map(i => ({
          type: i.type,
          nodeId: i.nodeId,
          nodeLabel: i.nodeLabel,
          detail: i.hint ? `${i.detail} ${i.hint}` : i.detail,
        }))
        const issuesForUI = validation.issues.map(i => ({
          type: i.type,
          nodeLabel: i.nodeLabel,
          detail: i.detail,
        }))
        return {
          valid: validation.isValid,
          issueCount: validation.issues.length,
          issues: issuesForAI,
          suggestion: validation.isValid
            ? "Flow looks good — no issues found."
            : "Issues found. Call apply_edit to fix them, then validate_result again.",
          details: {
            kind: 'validate' as const,
            valid: validation.isValid,
            issues: issuesForUI,
          } satisfies ToolStepDetails,
        }
      },
    }),

    save_as_template: tool({
      description: 'Save the current flow as a reusable template. Call this when the user asks to save, convert, or make the flow into a template. Generates AI metadata (name, description, when to use) and returns it for user confirmation.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { generateTemplateMetadata } = await import("./generate-template-metadata")
          const metadata = await generateTemplateMetadata(
            existingNodes,
            existingEdges,
            request.platform,
          )
          callbacks.setTemplateMetadata(metadata)
          console.log("[generate-flow] Tool save_as_template:", metadata)
          return {
            success: true,
            suggestedName: metadata.suggestedName,
            description: metadata.description,
            whenToUse: metadata.aiMetadata.whenToUse,
            selectionRule: metadata.aiMetadata.selectionRule,
          }
        } catch (error) {
          console.error("[generate-flow] Tool save_as_template error:", error)
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to generate template metadata",
          }
        }
      },
    }),

    undo_last: tool({
      description: 'Revert ALL your apply_edit changes and return the flow to its original state (before any edits this turn). Use this if validate_result found issues that are too complex to fix, or if the user asks to undo. After undoing, you can start fresh with a new apply_edit or just respond with a message.',
      inputSchema: z.object({
        reason: z.string().describe('Why you are undoing the edit'),
      }),
      execute: async ({ reason }) => {
        const currentResult = callbacks.getEditResult()
        if (!currentResult) {
          return { success: false, error: 'No edit to undo — apply_edit has not been called yet.' }
        }
        callbacks.setEditResult(null)
        console.log("[generate-flow] Tool undo_last:", { reason })
        return { success: true, message: `Edit reverted: ${reason}. The flow is back to its original state before any edits this turn.` }
      },
    }),

    list_variables: tool({
      description: 'List all available variables in the current flow, including any created by recent apply_edit calls. Returns flow variables (from storeAs, API response mapping, action nodes), system variables, and global variables. Use this AFTER apply_edit to check what new variables are available — the initial prompt already lists variables at conversation start.',
      inputSchema: z.object({}),
      execute: async () => {
        const currentNodes = buildCurrentNodes(existingNodes, callbacks.getEditResult(), request.platform)
        const flowVars = collectFlowVariablesRich(currentNodes)

        return {
          flowVariables: flowVars.map(v => ({
            name: v.name,
            reference: `{{${v.name}}}`,
            titleVariant: v.hasTitleVariant ? `{{${v.name}_title}}` : null,
            source: `${v.sourceNodeType}: "${v.sourceNodeLabel}"`,
          })),
          systemVariables: [
            { name: 'system.contact_name', reference: '{{system.contact_name}}', description: 'Contact display name' },
            { name: 'system.phone_number', reference: '{{system.phone_number}}', description: 'Contact phone number' },
          ],
          globalVariables: '(use {{global.variable_name}} syntax — available variables depend on org settings)',
          usage: {
            textInput: '{{variable_name}} — the raw response',
            buttonSelection: '{{variable_name}} — internal ID, {{variable_name_title}} — display text',
            system: '{{system.variable_name}} — always available',
            global: '{{global.variable_name}} — org-wide settings',
            crossFlow: '{{flow.slug.variable_name}} — from another flow',
          },
        }
      },
    }),
  }

  const apiUrl = process.env.FS_WHATSAPP_API_URL

  // --- Always-registered tools with runtime precondition checks ---
  // All tools are visible to the AI so it can reason about them.
  // Missing preconditions return actionable errors, not invisible absence.

  const authHeader = toolContext?.authHeader
  const authHeaders: Record<string, string> | undefined = authHeader
    ? (authHeader.startsWith('whm_')
        ? { 'X-API-Key': authHeader }
        : { 'Authorization': authHeader })
    : undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraTools: Record<string, any> = {}

  // list_templates — default APPROVED; pass status for DRAFT/PENDING/REJECTED/etc.
  extraTools.list_templates = (() => {
    if (request.platform !== 'whatsapp') {
      return tool({
        description: 'List WhatsApp message templates. Only available on WhatsApp flows.',
        inputSchema: z.object({}),
        execute: async () => ({ success: false, error: `Templates are only available for WhatsApp flows. This flow uses ${request.platform}.` }),
      })
    }
    const created = createListTemplatesTool(toolContext)
    if (created) return created
    return tool({
      description: 'List WhatsApp message templates.',
      inputSchema: z.object({}),
      execute: async () => ({ success: false, error: 'Cannot list templates — authentication context is missing.' }),
    })
  })()

  // Template CRUD tools — create, update, submit, get, sync, delete.
  // WhatsApp-only; on other platforms we still register them so the AI
  // gets a clear error instead of an undefined-tool crash.
  if (request.platform === 'whatsapp') {
    Object.assign(extraTools, createTemplateCrudTools(toolContext))
  } else {
    const notSupported = tool({
      description: `Templates are only available for WhatsApp flows. This flow uses ${request.platform}.`,
      inputSchema: z.object({}),
      execute: async () => ({ success: false, error: `Templates are only available for WhatsApp flows. This flow uses ${request.platform}.` }),
    })
    for (const name of ["create_template", "update_template", "submit_template", "get_template", "sync_templates", "delete_template"]) {
      extraTools[name] = notSupported
    }
  }

  // trigger_flow
  extraTools.trigger_flow = tool({
    description: 'Trigger a test run of the flow by sending it to a phone number via WhatsApp. Use when the user asks to test the flow.',
    inputSchema: z.object({
      phone_number: z.string().describe('Phone number in E.164 format (e.g. "+919876543210")'),
      variables: z.record(z.string()).optional().describe('Template parameter values if the flow starts with a template message'),
    }),
    execute: async ({ phone_number, variables }) => {
      if (request.platform !== 'whatsapp') {
        return { success: false, error: `Trigger is only available for WhatsApp flows. This flow uses ${request.platform}.` }
      }
      if (!toolContext?.publishedFlowId) {
        return { success: false, error: 'Flow is not published yet. Call publish_flow first to make it live, then try again.' }
      }
      if (!authHeaders || !apiUrl) {
        return { success: false, error: 'Cannot trigger flow — authentication context is missing.' }
      }

      const body: Record<string, any> = {
        phone_number,
        // Always force a new session on trigger_flow. This is a test-send
        // tool called interactively from chat — any prior session on the
        // contact is either a stuck leftover from a failed attempt or an
        // abandoned test. Without this, retries get blocked by fs-chat's
        // "active session" 409 guard and the AI has to report failure
        // instead of just working.
        force_new_session: true,
      }
      if (toolContext.waAccountName) body.whatsapp_account = toolContext.waAccountName
      if (variables && Object.keys(variables).length > 0) body.variables = variables

      try {
        const response = await fetch(`${apiUrl}/api/chatbot/flows/${toolContext.publishedFlowId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
        })
        const data = await response.json()

        if (!response.ok) {
          const msg = data?.message || data?.error || `HTTP ${response.status}`
          if (msg.toLowerCase().includes('active session')) {
            return { success: false, error: 'Cannot send: contact has an active session. The user needs to end it first or wait for it to expire.' }
          }
          return { success: false, error: msg }
        }
        console.log("[generate-flow] Tool trigger_flow: sent to", phone_number)
        return { success: true, message: `Flow sent to ${phone_number}` }
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Network error calling fs-whatsapp' }
      }
    },
  })

  // publish_flow — only registered when we have a project to publish against.
  // The public create endpoint (POST /api/v1/agent/flows) saves the project
  // AT the end of the stream, so `projectId` is unavailable during the AI
  // session. Registering the tool there causes the AI to call it, fail with
  // "project context is missing", emit a stream error, and short-circuit the
  // entire session (flow doesn't save, campaign doesn't get created).
  // Gating keeps the tool hidden from the AI in create contexts — the route
  // handler auto-publishes after the stream anyway.
  if (toolContext?.projectId) {
    extraTools.publish_flow = tool({
      description: 'Publish the current flow edits to make them live. Saves a new version, deploys to the runtime, and activates the flow. Call after validate_result confirms no issues.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!toolContext?.projectId) {
          return { success: false, error: 'Cannot publish — project context is missing.' }
        }
        if (!authHeaders || !apiUrl) {
          return { success: false, error: 'Cannot publish — authentication context is missing.' }
        }

        const projectId = toolContext.projectId

        try {
          // Step 1: Compute the intended publish state — existing canvas
          // merged with any in-session AI edits. For the internal UI this
          // includes draft changes the user already made; for the agent API
          // it's the latest version loaded by flow-loader plus tool edits.
          const editResult = callbacks.getEditResult()
          const intendedNodes = editResult
            ? buildCurrentNodes(existingNodes, editResult, request.platform)
            : existingNodes
          const intendedEdges = editResult
            ? buildCurrentEdges(existingEdges, editResult)
            : existingEdges

          // Step 2: Fetch the latest version from DB to compare.
          const latestRes = await fetch(`${apiUrl}/api/magic-flow/projects/${projectId}/versions?limit=1`, {
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
          })
          if (!latestRes.ok) {
            return { success: false, error: `Failed to fetch latest version: HTTP ${latestRes.status}` }
          }
          const latestBody = await latestRes.json()
          let latest = latestBody.data?.versions?.[0]
          if (!latest) {
            return { success: false, error: 'Flow has no versions to publish.' }
          }

          // Step 3: Save a new version if the intended state differs from
          // the latest DB version. Catches three cases:
          //   (a) AI just made edits (editResult exists, mergedNodes differs)
          //   (b) User has draft changes on canvas (existingNodes differs
          //       from latest version — draft is NOT a version)
          //   (c) Nothing changed → skip version save
          const intendedSnapshot = JSON.stringify({ nodes: intendedNodes, edges: intendedEdges })
          const latestSnapshot = JSON.stringify({ nodes: latest.nodes || [], edges: latest.edges || [] })
          if (intendedSnapshot !== latestSnapshot) {
            // Pull the draft's changes array to carry into the new version.
            // Matches the Update & Publish button path, which passes
            // changeTracker.getChanges() to createVersion. Without this the
            // version history shows "0 changes" for AI-published versions.
            let draftChanges: any[] = []
            try {
              const draftRes = await fetch(`${apiUrl}/api/magic-flow/projects/${projectId}/draft`, {
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
              })
              if (draftRes.ok) {
                const draftBody = await draftRes.json()
                draftChanges = draftBody.data?.draft?.changes || []
              }
            } catch { /* no draft — use empty changes */ }

            const versionRes = await fetch(`${apiUrl}/api/magic-flow/projects/${projectId}/versions`, {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: 'AI publish',
                nodes: intendedNodes,
                edges: intendedEdges,
                changes: draftChanges,
                platform: request.platform,
              }),
            })
            if (!versionRes.ok) {
              return { success: false, error: `Failed to save version: HTTP ${versionRes.status}` }
            }
            const newVersion = (await versionRes.json()).data?.version
            if (newVersion) {
              latest = newVersion // new version is now the target to publish
            }
            // Signal the edit endpoint not to create its own duplicate version.
            callbacks.markVersionSavedByTool?.()
          }

          const phoneDigits = toolContext.waPhoneNumber?.replace(/\D/g, '')
          const firstKeyword = (toolContext.triggerKeywords || [])[0]
          const testUrl = phoneDigits && firstKeyword
            ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(firstKeyword)}`
            : undefined

          // Step 3: If already published, nothing to do.
          if (latest.is_published) {
            return {
              success: true,
              already_published: true,
              message: `Version ${latest.version_number} is already published.`,
              version: latest.version_number,
              ...(testUrl ? { test_url: testUrl } : {}),
            }
          }

          // Step 4: Publish the latest unpublished version.
          const publishRes = await fetch(`${apiUrl}/api/magic-flow/projects/${projectId}/versions/${latest.id}/publish`, {
            method: 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: '{}',
          })
          if (!publishRes.ok) {
            return { success: false, error: `Failed to publish version: HTTP ${publishRes.status}` }
          }

          // Step 5: Flatten + convert + deploy to runtime.
          // Use intendedNodes/intendedEdges (what we just saved) rather than
          // latest.nodes which might be missing if the POST response doesn't
          // include the full payload.
          const flat = flattenFlow(intendedNodes, intendedEdges)
          const converted = convertToFsWhatsApp(
            flat.nodes,
            flat.edges,
            toolContext.projectName || 'Flow',
            undefined,
            [],
            toolContext.triggerKeywords || [],
            toolContext.triggerMatchType || 'exact',
            undefined,
            toolContext.flowSlug,
            toolContext.waAccountId,
          )

          const existingRuntimeId = toolContext.publishedFlowId
          const runtimeUrl = existingRuntimeId
            ? `${apiUrl}/api/chatbot/flows/${existingRuntimeId}`
            : `${apiUrl}/api/chatbot/flows`

          const runtimeRes = await fetch(runtimeUrl, {
            method: existingRuntimeId ? 'PUT' : 'POST',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...converted,
              trigger_keywords: toolContext.triggerKeywords || [],
              trigger_match_type: toolContext.triggerMatchType || 'exact',
            }),
          })
          if (!runtimeRes.ok) {
            return { success: false, error: `Failed to deploy to runtime: HTTP ${runtimeRes.status}` }
          }

          const runtimeBody = await runtimeRes.json()
          const runtimeFlowId = runtimeBody.data?.id || existingRuntimeId
          const runtimeFlowSlug: string | undefined = runtimeBody.data?.flow_slug

          // Step 6: Save published_flow_id (and first-time flow_slug) back
          // to the project + update toolContext so trigger_flow can use
          // publishedFlowId in the same session. flow_slug is immutable —
          // only write on first publish (matches UI onPublished behavior).
          if (runtimeFlowId) {
            toolContext.publishedFlowId = runtimeFlowId
            const projectUpdates: Record<string, unknown> = { published_flow_id: runtimeFlowId }
            if (runtimeFlowSlug && !toolContext.flowSlug) {
              projectUpdates.flow_slug = runtimeFlowSlug
              toolContext.flowSlug = runtimeFlowSlug
            }
            await fetch(`${apiUrl}/api/magic-flow/projects/${projectId}`, {
              method: 'PUT',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify(projectUpdates),
            }).catch(() => {})
          }

          // Step 7: Delete the draft — the draft represented unpublished
          // changes, and we just published them. Leaving the draft in place
          // causes the UI to reload old state on refresh and show stale
          // "unsaved changes" in the changes modal. Same behavior as the
          // normal publish-button flow (see use-version-manager.ts).
          await fetch(`${apiUrl}/api/magic-flow/projects/${projectId}/draft`, {
            method: 'DELETE',
            headers: authHeaders,
          }).catch(() => {})

          console.log("[generate-flow] Tool publish_flow: published version", latest.version_number, "for project", projectId)
          return {
            success: true,
            already_published: false,
            message: `Flow published! Version ${latest.version_number} is now live.`,
            version: latest.version_number,
            ...(testUrl ? { test_url: testUrl } : {}),
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Publish failed' }
        }
      },
    })
  }

  // Broadcast + lookup tools (from PR #74). Gated on auth availability
  // and use the same X-API-Key vs Authorization header routing as the
  // other tools in this file.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actionTools: Record<string, any> = {}

  if (apiUrl && authHeaders) {
    // Lookup tools — help the assistant find flow IDs and account names
    actionTools.list_flows = tool({
      description: 'List published chatbot flows in this organization. Use this to find the flow ID when the user wants to broadcast a flow.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const response = await fetch(`${apiUrl}/api/chatbot/flows`, {
            method: 'GET',
            headers: authHeaders,
          })
          const data = await response.json()
          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          const flows = (result.flows || result || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            status: f.status,
            account_name: f.account_name,
          }))
          return { success: true, flows }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.list_accounts = tool({
      description: 'List WhatsApp accounts configured for this organization. Use this to find the account name when creating a campaign.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const response = await fetch(`${apiUrl}/api/accounts`, {
            method: 'GET',
            headers: authHeaders,
          })
          const data = await response.json()
          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          const accounts = (result.accounts || result || []).map((a: any) => ({
            id: a.id,
            name: a.name,
            phone_number: a.phone_number,
            status: a.status,
          }))
          return { success: true, accounts }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.get_flow_variables = tool({
      description: 'Get the list of variables used by a published flow. Useful to understand what data a flow collects or requires before broadcasting it.',
      inputSchema: z.object({
        flow_id: z.string().uuid().describe('UUID of the published flow'),
      }),
      execute: async ({ flow_id }) => {
        try {
          const response = await fetch(`${apiUrl}/api/campaigns/flow-variables/${flow_id}`, {
            method: 'GET',
            headers: authHeaders,
          })
          const data = await response.json()
          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          return { success: true, variables: result.variables || [] }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    // Campaign / broadcast tools — available whenever authenticated
    actionTools.preview_audience = tool({
      description: 'Preview how many recipients match an audience BEFORE creating a campaign. Always call this first and show the count to the user so they can verify the audience is correct before proceeding with create_campaign. Supports both "contacts" (filter/search/channel) and "freestand-claimant" (audience_id) sources.',
      // Flat object instead of z.discriminatedUnion — Anthropic tool API
      // rejects schemas whose top-level isn't type:"object". Runtime branches
      // on `source` below; shape enforcement is per-source via description.
      inputSchema: z.object({
        source: z
          .enum(['contacts', 'freestand-claimant'])
          .describe('Audience source type. "contacts" uses filter/search/channel; "freestand-claimant" requires audience_id.'),
        audience_id: z
          .string()
          .uuid()
          .optional()
          .describe('UUID of the Freestand claimant audience. REQUIRED when source="freestand-claimant", omit otherwise.'),
        filter: z
          .object({
            type: z.enum(['tag', 'flow', 'variable']).optional(),
            op: z.string().optional(),
            values: z.array(z.string()).optional(),
            value: z.string().optional(),
            flow_slug: z.string().optional(),
            name: z.string().optional(),
            logic: z.enum(['and', 'or']).optional(),
            filters: z.array(z.any()).optional(),
          })
          .optional()
          .describe('Contact filter — only used when source="contacts" (same format as create_campaign).'),
        search: z.string().optional().describe('Free-text search — only used when source="contacts".'),
        channel: z.string().optional().describe('Channel filter (e.g. "whatsapp") — only used when source="contacts".'),
      }),
      execute: async (input) => {
        try {
          const body: Record<string, any> =
            input.source === 'freestand-claimant'
              ? { source: 'freestand-claimant', audience_id: input.audience_id }
              : {
                  source: 'contacts',
                  filter: input.filter,
                  search: input.search,
                  channel: input.channel,
                }
          const response = await fetch(`${apiUrl}/api/campaigns/preview-audience`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify(body),
          })
          const data = await response.json()
          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          return {
            success: true,
            total_count: result.total_count,
            audience_type: result.audience_type,
            audience_name: result.name,
            snapshot_date: result.snapshot_date,
            available_columns: result.available_columns,
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.create_campaign = tool({
      description:
        'Create a draft or scheduled broadcast campaign. Does NOT start sending immediately unless scheduled_at is provided. Always confirm details with user first. Supports audience sources "contacts" (filter/search/channel) and "freestand-claimant" (audience_id + column_mapping). For the freestand-claimant source, the campaign is returned with status "materializing" while a background goroutine fetches recipients from go-backend; poll get_campaign_status until it transitions to "draft" (or "scheduled" when scheduled_at is provided) before calling start_campaign.',
      inputSchema: z.object({
        name: z.string().describe('Campaign name'),
        flow_id: z.string().uuid().describe('UUID of the flow to broadcast'),
        account_name: z.string().describe('WhatsApp account name to send from'),
        audience_source: z
          .enum(['contacts', 'freestand-claimant'])
          .describe(
            'Audience source type. "contacts" = org contact filter; "freestand-claimant" = a Freestand claimant audience fetched from go-backend (requires column_mapping in audience_config). CSV is intentionally not exposed to the AI here — users upload CSVs manually.'
          ),
        // Flat object instead of z.union — nested unions convert to anyOf in
        // JSON Schema, which some tool-schema validators reject. Runtime
        // branches on audience_source to pick the correct fields.
        audience_config: z
          .object({
            // --- contacts source fields ---
            filter: z
              .object({
                type: z.enum(['tag', 'flow', 'variable']).optional().describe('Filter type for leaf conditions'),
                op: z
                  .string()
                  .optional()
                  .describe(
                    'Operator: for tags use "is" or "is_not", for flows use "active"/"any"/"never", for variables use "is"/"is_not"/"contains"/"has_any_value"/"is_unknown"'
                  ),
                values: z.array(z.string()).optional().describe('Tag names for tag filters (e.g. ["delhi", "mumbai"])'),
                value: z.string().optional().describe('Value for variable filters'),
                flow_slug: z.string().optional().describe('Flow slug for flow/variable filters'),
                name: z.string().optional().describe('Variable name for variable filters'),
                logic: z.enum(['and', 'or']).optional().describe('Group logic for combining multiple filters'),
                filters: z.array(z.any()).optional().describe('Nested filter conditions when using groups'),
              })
              .optional()
              .describe('ONLY for audience_source="contacts". Contact filter tree.'),
            search: z.string().optional().describe('ONLY for audience_source="contacts". Free-text search.'),
            channel: z.string().optional().describe('ONLY for audience_source="contacts". Channel filter (e.g. "whatsapp").'),
            // --- freestand-claimant source fields ---
            audience_id: z
              .string()
              .uuid()
              .optional()
              .describe('REQUIRED when audience_source="freestand-claimant". UUID of the claimant audience.'),
            column_mapping: z
              .record(
                z.string(),
                z.enum([
                  'name',
                  'city',
                  'state',
                  'pincode',
                  'country',
                  'address',
                  'status',
                  'claim_date',
                  'campaign_name',
                  'skus',
                  'utm_source',
                  'order_status',
                  'delivery_status',
                  'waybill_number',
                ])
              )
              .optional()
              .describe(
                'REQUIRED when audience_source="freestand-claimant". Maps flow-variable names to claimant audience columns. Keys are flow variable names (e.g. "first_name"); values are one of the 14 allowed claimant columns. Example: {"customer_name":"name","order_id":"waybill_number"}.'
              ),
          })
          .describe(
            'Audience configuration — fields vary by audience_source. For "contacts" use filter/search/channel. For "freestand-claimant" use audience_id + column_mapping. Unused fields are ignored.'
          ),
        scheduled_at: z
          .string()
          .datetime()
          .optional()
          .describe(
            "Optional ISO 8601 UTC timestamp (e.g. '2026-04-17T18:00:00Z'). If provided, the campaign is created in scheduled state and will start automatically at that time. Must be at least 30 seconds in the future. Resolve relative times (e.g. 'tomorrow 6 PM') using the user's timezone from the system prompt, then convert to UTC. Not supported when audience_source is 'csv'. For audience_source 'freestand-claimant', the campaign first transitions to status 'materializing' and then to 'scheduled' once recipients are fetched."
          ),
      }),
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
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify(body),
          })
          const data = await response.json()

          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          console.log("[generate-flow] Tool create_campaign: created", result.id || result.campaign_id, name)
          return {
            success: true,
            campaign_id: result.id || result.campaign_id,
            name: result.name,
            status: result.status,
            total_recipients: result.total_recipients,
            audience_total: result.audience_total,
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.start_campaign = tool({
      description: 'Start sending a draft campaign. Only call after user explicitly confirms.',
      inputSchema: z.object({
        campaign_id: z.string().uuid().describe('UUID of the campaign to start'),
      }),
      execute: async ({ campaign_id }) => {
        try {
          const response = await fetch(`${apiUrl}/api/campaigns/${campaign_id}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
          })
          const data = await response.json()

          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          console.log("[generate-flow] Tool start_campaign: started", campaign_id)
          return { success: true, status: result.status || 'processing', message: result.message || 'Campaign started' }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.get_campaign_status = tool({
      description:
        'Get current status and progress of a campaign. Status values: "draft", "materializing", "scheduled", "queued", "processing", "paused", "completed", "cancelled", "failed". "materializing" appears only for freestand-claimant broadcasts while the background goroutine is fetching recipients; it resolves to "draft" (or "scheduled" when scheduled_at was set) on success, or "failed" with error_message on error. Poll this tool until status leaves "materializing" before calling start_campaign.',
      inputSchema: z.object({
        campaign_id: z.string().uuid().describe('UUID of the campaign to check'),
      }),
      execute: async ({ campaign_id }) => {
        try {
          const response = await fetch(`${apiUrl}/api/campaigns/${campaign_id}`, {
            method: 'GET',
            headers: authHeaders,
          })
          const data = await response.json()

          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          return {
            success: true,
            campaign_id: result.id || result.campaign_id,
            name: result.name,
            status: result.status,
            total_recipients: result.total_recipients,
            materialized_count: result.materialized_count,
            audience_total: result.audience_total,
            recipients_completed: result.recipients_completed,
            sent_count: result.sent_count,
            delivered_count: result.delivered_count,
            read_count: result.read_count,
            failed_count: result.failed_count,
            started_at: result.started_at,
            completed_at: result.completed_at,
            error_message: result.error_message,
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.list_campaigns = tool({
      description: 'List recent broadcast campaigns. Optionally filter by status.',
      inputSchema: z.object({
        status: z
          .enum(['draft', 'materializing', 'scheduled', 'queued', 'processing', 'paused', 'completed', 'cancelled', 'failed'])
          .optional()
          .describe('Filter by campaign status. Matches the 9-state enum used by get_campaign_status.'),
      }),
      execute: async ({ status }) => {
        try {
          const url = status ? `${apiUrl}/api/campaigns?status=${encodeURIComponent(status)}` : `${apiUrl}/api/campaigns`
          const response = await fetch(url, {
            method: 'GET',
            headers: authHeaders,
          })
          const data = await response.json()

          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          return {
            success: true,
            campaigns: result.campaigns || result,
            total: result.total,
          }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.pause_campaign = tool({
      description: 'Pause a running campaign. Confirm with user first.',
      inputSchema: z.object({
        campaign_id: z.string().uuid().describe('UUID of the campaign to pause'),
      }),
      execute: async ({ campaign_id }) => {
        try {
          const response = await fetch(`${apiUrl}/api/campaigns/${campaign_id}/pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
          })
          const data = await response.json()

          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          console.log("[generate-flow] Tool pause_campaign: paused", campaign_id)
          return { success: true, status: result.status || 'paused', message: result.message || 'Campaign paused' }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

    actionTools.cancel_campaign = tool({
      description: 'Cancel a campaign permanently. Confirm with user first.',
      inputSchema: z.object({
        campaign_id: z.string().uuid().describe('UUID of the campaign to cancel'),
      }),
      execute: async ({ campaign_id }) => {
        try {
          const response = await fetch(`${apiUrl}/api/campaigns/${campaign_id}/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
          })
          const data = await response.json()

          if (!response.ok) {
            return { success: false, error: data?.message || data?.error || `HTTP ${response.status}` }
          }
          const result = data?.data || data
          console.log("[generate-flow] Tool cancel_campaign: cancelled", campaign_id)
          return { success: true, status: result.status || 'cancelled', message: result.message || 'Campaign cancelled' }
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : 'Network error' }
        }
      },
    })

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
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ scheduled_at }),
          })
          const data = await response.json()
          if (!response.ok) {
            const err = data?.message || data?.error || `HTTP ${response.status}`
            console.log("[generate-flow] Tool reschedule_campaign: failed", campaign_id, err)
            return { success: false, error: err }
          }
          const result = data?.data || data
          console.log("[generate-flow] Tool reschedule_campaign: rescheduled", campaign_id, "to", scheduled_at)
          return {
            success: true,
            status: result.status ?? "scheduled",
            scheduled_at: result.scheduled_at ?? scheduled_at,
          }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : "Network error" }
        }
      },
    })
  }

  return { ...baseTools, ...extraTools, ...actionTools }
}
