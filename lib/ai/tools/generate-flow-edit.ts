import { z } from "zod"
import { generateText, streamText, tool, stepCountIs } from "ai"
import { getModel } from "../core/models"
import { editFlowPlanSchema } from "@/types/flow-plan"
import type { EditFlowPlan } from "@/types/flow-plan"
import { buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import type { BuildEditFlowResult } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import { collectFlowVariablesRich } from "@/utils/flow-variables"
import type { Node, Edge } from "@xyflow/react"
import type { TemplateAIMetadata, TemplateResolver } from "@/types"
import type {
  GenerateFlowRequest,
  GenerateFlowResponse,
  NodeBrief,
  StreamEvent,
  ToolStepDetails,
  UpdateBrief,
} from "./generate-flow"
import { buildToolStepPayload, nodeBrief } from "./generate-flow"

/**
 * Convert nodeUpdates (partial updates) to full Node objects by merging with existing nodes.
 */
export function applyNodeUpdates(
  nodeUpdates: Array<{ nodeId: string; data?: Record<string, any>; newType?: string }>,
  existingNodes: Node[]
): Node[] {
  return nodeUpdates.map((update) => {
    const existing = existingNodes.find((n) => n.id === update.nodeId)
    if (!existing) return null
    return {
      ...existing,
      type: update.newType || existing.type,
      data: { ...existing.data, ...update.data },
    }
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
    stopWhen: stepCountIs(12),
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

  const updatedNodes = applyNodeUpdates(finalEditResult.nodeUpdates, existingNodes)

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
    }, request.toolContext, emit),
    stopWhen: stepCountIs(12),
    temperature: 0.3,
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
      },
    })
    return
  }

  // Gate the final result event on VALIDATED state, not merely applied state.
  // If the AI ran apply_edit and then gave up without a passing validate_result
  // (or hit the step budget mid-fix), we must NOT ship that unvalidated editResult
  // to the canvas. validatedEditResult is only set inside validate_result's
  // execute on success, so its presence means "the AI's latest state is known
  // good". If it's null, send a message-only result — the AI's explanatory
  // text still reaches the user, but the canvas stays untouched.
  if (!validatedEditResult) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: "edit",
      },
    })
    return
  }

  const updatedNodes = applyNodeUpdates(validatedEditResult.nodeUpdates, existingNodes)

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
}

/**
 * Build the current flow state by merging existing nodes with applied edits.
 * Shared by validate_result and list_variables tools.
 */
function buildCurrentNodes(
  existingNodes: Node[],
  editResult: BuildEditFlowResult | null,
): Node[] {
  if (!editResult) return [...existingNodes]
  const nodes = [...existingNodes, ...editResult.newNodes]
  for (const update of editResult.nodeUpdates) {
    const idx = nodes.findIndex(n => n.id === update.nodeId)
    if (idx !== -1) {
      nodes[idx] = {
        ...nodes[idx],
        type: update.newType || nodes[idx].type,
        data: { ...nodes[idx].data, ...update.data },
      }
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
      description: 'Get full details of a node including button/option handle IDs, storeAs, and content. Call this before editing nodes with buttons/options to get exact handle IDs for attachHandle and removeEdges.',
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
        if (data?.buttons) {
          details.buttons = (data.buttons as any[]).map((b: any, i: number) => ({
            index: i, text: b.text || b.label, id: b.id, handleId: b.id || `button-${i}`,
          }))
        }
        if (data?.options) {
          details.options = (data.options as any[]).map((o: any, i: number) => ({
            index: i, text: o.text, id: o.id, handleId: o.id || `option-${i}`,
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
            templateResolver
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
          // (not just "nodeUpdate ") — flow-plan-builder emits several other
          // "nodeUpdate "-prefixed warnings for BENIGN coercions (options →
          // buttons, buttons → options, both → canonical, auto-convert to
          // list) that should pass through as non-fatal. Only the "target
          // not found — skipped" case is a hard skip that must roll back.
          const skipWarnings = editResult.warnings.filter(
            (w) => w.startsWith("addEdge ") || w.startsWith("nodeUpdate target ")
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
              suggestion: "Fix the plan and call apply_edit again. Common causes: (1) referencing a newly-created node by a made-up ID in addEdges (new node IDs are generated by the builder, not derived from removed node IDs); (2) referencing a node that was removed in the same plan; (3) self-referencing edges; (4) nodeUpdate targeting an ID that does not exist — call get_node_details first to confirm the node is still present. To change a node's type while preserving its incoming edges, consider updating content in place via nodeUpdates rather than remove + chain.",
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

        const filteredNodes = buildCurrentNodes(existingNodes, finalEditResult)
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
            const updatedNodes = applyNodeUpdates(finalEditResult.nodeUpdates, existingNodes)
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
        const currentNodes = buildCurrentNodes(existingNodes, callbacks.getEditResult())
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

  if (toolContext?.publishedFlowId && request.platform === 'whatsapp' && apiUrl && toolContext.authHeader) {
    const { publishedFlowId, waAccountName, authHeader } = toolContext
    return {
      ...baseTools,
      trigger_flow: tool({
        description: 'Trigger a test run of the published flow by sending it to a phone number via WhatsApp. Only use when the user asks to test the flow or you have just finished a significant edit.',
        inputSchema: z.object({
          phone_number: z.string().describe('Phone number in E.164 format (e.g. "+919876543210")'),
          variables: z.record(z.string()).optional().describe('Template parameter values if the flow starts with a template message'),
        }),
        execute: async ({ phone_number, variables }) => {
          const body: Record<string, any> = { phone_number }
          if (waAccountName) body.whatsapp_account = waAccountName
          if (variables && Object.keys(variables).length > 0) body.variables = variables

          try {
            const response = await fetch(`${apiUrl}/api/chatbot/flows/${publishedFlowId}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
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
      }),
    }
  }

  return baseTools
}
