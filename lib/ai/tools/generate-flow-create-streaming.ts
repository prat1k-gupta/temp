import { z } from "zod"
import { streamText, smoothStream, tool, stepCountIs } from "ai"
import type { Node } from "@xyflow/react"
import { getModel } from "../core/models"
import { flowPlanSchema } from "@/types/flow-plan"
import type { FlowPlan } from "@/types/flow-plan"
import { buildFlowFromPlan } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import type { Platform, TemplateResolver } from "@/types"
import type { GenerateFlowRequest, GenerateFlowResponse, NodeBrief } from "./generate-flow"
import type { StreamEvent } from "./generate-flow"
import { buildToolStepPayload, nodeBrief } from "./generate-flow"

/**
 * Streaming create mode: uses streamText() with a build_and_validate tool.
 * The AI thinks out loud (streamed text), calls the tool with its plan JSON,
 * gets validation feedback, and can fix and retry.
 */
export async function executeCreateModeStreaming(
  request: GenerateFlowRequest,
  systemPrompt: string,
  userPrompt: string,
  templateResolver: TemplateResolver | undefined,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  let finalFlowData: { nodes: any[]; edges: any[]; nodeOrder?: string[] } | null = null
  let finalMessage = ''
  let finalWarnings: string[] = []
  let finalDebugData: Record<string, unknown> = {}

  const result = streamText({
    model: getModel('claude-sonnet'),
    system: systemPrompt + `\n\n**IMPORTANT:** You have a \`build_and_validate\` tool. After describing your plan, call it with your flow plan JSON. The tool will build the flow and validate it. If there are issues, fix them and call the tool again. Do NOT output raw JSON — always use the tool.`,
    prompt: userPrompt,
    tools: {
      build_and_validate: tool({
        description: 'Build and validate a flow plan. Pass your complete flow plan as the argument. Returns validation results — if issues are found, fix the plan and call again.',
        inputSchema: z.object({
          message: z.string().describe('Summary of what this flow does'),
          steps: flowPlanSchema.shape.steps.describe('The flow steps array — NodeStep and BranchStep objects'),
        }),
        execute: async (plan) => {
          try {
            const flowPlan = plan as FlowPlan
            const build = buildFlowFromPlan(flowPlan, request.platform, templateResolver)
            const validation = validateGeneratedFlow(build.nodes, build.edges, request.platform)

            if (validation.isValid) {
              // Store the successful result
              finalFlowData = { nodes: build.nodes, edges: build.edges, nodeOrder: build.nodeOrder }
              finalMessage = flowPlan.message || 'Flow created successfully'
              finalWarnings = build.warnings
              finalDebugData = { rawPlan: flowPlan, validationPassed: true }

              // Emit flow_ready immediately so the canvas can apply the flow
              // in parallel with the rest of the text streaming, instead of
              // waiting for the final 'result' event at end of stream.
              emit({
                type: 'flow_ready',
                flowData: finalFlowData,
                action: 'create',
                warnings: finalWarnings.length > 0 ? finalWarnings : undefined,
                debugData: finalDebugData,
              })

              // Build per-node briefs so the chat UI can render the same
              // granular chip list the EDIT path (apply_edit) emits. Without
              // `details` the UI collapses to a one-line summary, which made
              // the CREATE path feel less transparent than EDIT for the same
              // kind of work.
              const addedBriefs = build.nodes
                .filter((n: Node) => n.type !== 'start')
                .map((n: Node) => nodeBrief(n))
                .filter(Boolean) as NodeBrief[]

              return {
                success: true,
                summary: {
                  nodes: build.nodes.length,
                  edges: build.edges.length,
                },
                details: {
                  kind: 'edit' as const,
                  added: addedBriefs,
                  removed: [],
                  updated: [],
                  edgesAdded: build.edges.length,
                  edgesRemoved: 0,
                },
                message: 'Flow built and validated successfully. No issues found.',
              }
            }

            // Return issues for the AI to fix
            const issueList = validation.issues
              .map((i, idx) => `${idx + 1}. [${i.type}]${i.nodeId ? ` (node: ${i.nodeId})` : ''}: ${i.detail}`)
              .join('\n')

            return {
              success: false,
              issueCount: validation.issues.length,
              issues: issueList,
              message: `Found ${validation.issues.length} issue(s). Fix them and call build_and_validate again with the corrected plan.`,
            }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'Failed to build flow from plan',
              message: 'The plan JSON was invalid. Check the structure and try again.',
            }
          }
        },
      }),
    },
    stopWhen: stepCountIs(8),
    temperature: 0.7,
    // Character-level smoothing — see generate-flow-edit.ts for rationale.
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
      if (chunk.type === 'text-delta' && chunk.text) {
        emit({ type: 'text_delta', delta: chunk.text })
      }
    },

    onStepFinish: (step) => {
      const calls = step.toolCalls?.map((tc: any) => ({ tool: tc.toolName }))
      const results = step.toolResults?.map((tr: any) => ({ tool: tr.toolName, result: tr.result }))
      console.log(`[generate-flow] Create streaming step (${step.finishReason}):`, JSON.stringify({ calls, results }, null, 2))
    },
  })

  // Wait for completion
  const aiMessage = await result.text || finalMessage || 'Flow created'
  await result.steps

  console.log("[generate-flow] Create streaming completed:", {
    hasFlowData: !!finalFlowData,
    message: aiMessage.substring(0, 100),
  })

  // Emit final result
  if (finalFlowData) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        flowData: finalFlowData,
        action: 'create',
        warnings: finalWarnings.length > 0 ? finalWarnings : undefined,
        debugData: finalDebugData,
      },
    })
  } else {
    // AI didn't call build_and_validate or all attempts failed
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: 'suggest',
      },
    })
  }
}
