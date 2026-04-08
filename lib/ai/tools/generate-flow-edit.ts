import { z } from "zod"
import { generateText, tool, stepCountIs } from "ai"
import { getModel } from "../core/models"
import { editFlowPlanSchema } from "@/types/flow-plan"
import type { EditFlowPlan } from "@/types/flow-plan"
import { buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import type { BuildEditFlowResult } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import type { Node, Edge } from "@xyflow/react"
import type { TemplateAIMetadata, TemplateResolver } from "@/types"
import type { GenerateFlowRequest, GenerateFlowResponse } from "./generate-flow"

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
    }),
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

interface EditToolCallbacks {
  setEditResult: (result: BuildEditFlowResult) => void
  setTemplateMetadata: (metadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata }) => void
  getEditResult: () => BuildEditFlowResult | null
}

function createEditTools(
  existingNodes: Node[],
  existingEdges: Edge[],
  request: GenerateFlowRequest,
  templateResolver: TemplateResolver | undefined,
  callbacks: EditToolCallbacks,
) {
  return {
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

        // Build current flow state: existing + applied edits
        const currentNodes = [...existingNodes]
        const currentEdges = [...existingEdges]

        currentNodes.push(...finalEditResult.newNodes)
        currentEdges.push(...finalEditResult.newEdges)
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
        const removeIds = new Set(finalEditResult.removeNodeIds)
        const filteredNodes = currentNodes.filter(n => !removeIds.has(n.id))
        const removeEdgeKeys = new Set(
          finalEditResult.removeEdges.map(e => `${e.source}-${e.target}-${e.sourceHandle || ""}`)
        )
        const filteredEdges = currentEdges.filter(e =>
          !removeEdgeKeys.has(`${e.source}-${e.target}-${e.sourceHandle || ""}`)
        )

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
  }
}
