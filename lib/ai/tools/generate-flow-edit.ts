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
import type { GenerateFlowRequest, GenerateFlowResponse, StreamEvent } from "./generate-flow"
import { buildToolSummary } from "./generate-flow"

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
  let finalEditResult: BuildEditFlowResult | null = null as BuildEditFlowResult | null
  let finalTemplateMetadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata } | null = null

  const result = streamText({
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
    experimental_onToolCallStart: ({ toolCall }) => {
      emit({ type: 'tool_step', tool: toolCall.toolName, status: 'running' })
    },
    experimental_onToolCallFinish: ({ toolCall, ...rest }) => {
      const output = 'output' in rest && rest.success ? rest.output : undefined
      const summary = buildToolSummary(toolCall.toolName, output)
      emit({ type: 'tool_step', tool: toolCall.toolName, status: 'done', summary })
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

  if (!finalEditResult) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: "edit",
      },
    })
    return
  }

  const updatedNodes = applyNodeUpdates(finalEditResult.nodeUpdates, existingNodes)

  emit({
    type: 'result',
    data: {
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
    },
  })
}

interface EditToolCallbacks {
  setEditResult: (result: BuildEditFlowResult | null) => void
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
          callbacks.setEditResult(editResult)

          console.log("[generate-flow] Tool apply_edit result:", {
            newNodes: editResult.newNodes.length,
            newEdges: editResult.newEdges.map(e => `${e.source} → ${e.target} (handle: ${e.sourceHandle || "default"})`),
            nodeUpdates: editResult.nodeUpdates.length,
            removeNodeIds: editResult.removeNodeIds,
            removeEdges: editResult.removeEdges,
            warnings: editResult.warnings,
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
      description: 'Validate the current state of the flow after applying edits. Call this after apply_edit to check for issues like orphaned nodes, missing connections, undefined variables, or button limit violations. If issues are found, call apply_edit again to fix them.',
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
          issues: validation.issues.map(i => i.type),
        })
        return {
          valid: validation.isValid,
          issueCount: validation.issues.length,
          issues: validation.issues.map(i => ({ type: i.type, nodeId: i.nodeId, detail: i.detail })),
          suggestion: validation.isValid
            ? "Flow looks good — no issues found."
            : "Issues found. Call apply_edit to fix them, then validate_result again.",
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
