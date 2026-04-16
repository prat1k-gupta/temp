import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import {
  listFlows,
  createProject,
  deleteProject,
  createVersion,
  publishVersion,
  publishRuntimeFlow,
  updateProject,
  checkKeywordConflict,
} from "@/lib/agent-api/publisher"
import { findFlowQuerySchema, createFlowBodySchema } from "@/lib/agent-api/schemas"
import { SSEWriter } from "@/lib/agent-api/sse"
import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"
import type { StreamEvent, GenerateFlowResponse } from "@/lib/ai/tools/generate-flow"
import { convertToFsWhatsApp } from "@/utils/whatsapp-converter"
import { flattenFlow } from "@/utils/flow-flattener"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import type { Node, Edge } from "@xyflow/react"

/** Subset of GenerateFlowResponse["flowData"] that we need after AI generation. */
interface CapturedFlowData {
  nodes: Node[]
  edges: Edge[]
  nodeOrder?: string[]
}

/**
 * GET /v1/agent/flows — find/list flows for the authenticated org.
 *
 * Query params:
 *   - query (optional): fuzzy hint string; not used server-side in v1,
 *                       parent LLM does the fuzzy matching on the returned list
 *   - limit (optional): 1-50, default 10
 *
 * Auth: X-API-Key header with a whm_* key. See withAgentAuth.
 * Rate limit bucket: cheap (120/min).
 */
export const GET = withAgentAuth(async (ctx, req) => {
  const url = new URL(req.url)
  const queryParams = {
    query: url.searchParams.get("query") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  }

  const parsed = findFlowQuerySchema.safeParse(queryParams)
  if (!parsed.success) {
    throw new AgentError("invalid_param", "Invalid query parameters", {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const result = await listFlows(ctx, parsed.data.limit)
  return Response.json(result, { status: 200 })
}, "cheap")

/**
 * POST /v1/agent/flows — create a new flow via AI instruction, streamed as SSE.
 *
 * Body: { instruction: string, channel: string, trigger_keyword: string }
 *
 * Pre-stream validation errors (JSON body parse, schema, channel, keyword conflict)
 * are returned as plain HTTP errors before the SSE stream opens.
 *
 * After the stream opens, errors are emitted as SSE error events and orphan
 * projects are cleaned up automatically.
 *
 * Auth: X-API-Key header with a whm_* key. See withAgentAuth.
 * Rate limit bucket: expensive (10/min).
 */
export const POST = withAgentAuth(async (ctx, req) => {
  // --- Pre-stream validation (HTTP errors, not SSE) ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new AgentError("missing_required_param", "Invalid or missing JSON body")
  }

  const parsed = createFlowBodySchema.safeParse(body)
  if (!parsed.success) {
    throw new AgentError("invalid_param", "Invalid request body", {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const { name: flowName, instruction, channel, trigger_keyword: rawKeyword } = parsed.data
  const normalizedKeyword = rawKeyword.toLowerCase()

  // Channel check
  if (!ctx.account.connected_channels.includes(channel as any)) {
    throw new AgentError("channel_not_connected", `Channel "${channel}" is not connected on this account`, {
      connected_channels: ctx.account.connected_channels,
    })
  }

  // Keyword conflict pre-check
  const conflict = await checkKeywordConflict(ctx, normalizedKeyword)
  if (conflict) {
    throw new AgentError("keyword_conflict", `Trigger keyword "${normalizedKeyword}" is already in use`, {
      existing_flow: conflict,
    })
  }

  // --- Start SSE stream ---
  const { readable, writer } = SSEWriter.create()
  let projectId: string | null = null

  const pipeline = async () => {
    try {
      writer.progress("understanding", "Analyzing your request")

      // Step 1: Create project
      const project = await createProject(ctx, {
        name: flowName,
        platform: channel,
        triggerKeywords: [normalizedKeyword],
        triggerMatchType: "exact",
        waAccountId: ctx.account.id,
        waPhoneNumber: ctx.account.phone_number,
      })
      projectId = project.id

      writer.progress("planning", "Building flow plan")

      // Step 2: Run AI generation — capture result via closure.
      // Use a box object so TypeScript doesn't narrow `captured.flowData` to
      // `never` after the guard below (a plain `let` mutated inside a callback
      // gets its type locked at initialisation by the control-flow analyser).
      const captured: {
        flowData: CapturedFlowData | null
        message: string
        error: string | null
      } = { flowData: null, message: "", error: null }

      // Pass default templates so the AI can use flowTemplate nodes (Name, Email,
      // DOB, Address) and buildFlowFromPlan's templateResolver can expand them
      // into their internal sub-nodes. Without this, flowTemplate nodes get empty
      // internals and the converter/flattener produces 0 steps.
      const userTemplates = DEFAULT_TEMPLATES.map(t => ({
        id: t.id, name: t.name, aiMetadata: t.aiMetadata,
      }))
      const userTemplateData = DEFAULT_TEMPLATES.map(t => ({
        id: t.id, name: t.name, nodes: t.nodes, edges: t.edges,
      }))

      await generateFlowStreaming(
        {
          prompt: instruction,
          platform: channel as any,
          existingFlow: {
            nodes: [{ id: "start", type: "start", position: { x: 0, y: 0 }, data: {} }] as any[],
            edges: [],
          },
          context: { source: "agent_api" },
          userTemplates,
          userTemplateData,
        },
        (event: StreamEvent) => {
          switch (event.type) {
            case "text_delta":
              // drop — AI prose tokens are noise for the agent API
              break
            case "tool_step":
              if (event.status === "done" && event.summary) {
                writer.progress("generating", event.summary)
              }
              break
            case "flow_ready":
              writer.progress("validating", "Flow plan validated")
              break
            case "result":
              captured.flowData = (event.data.flowData as CapturedFlowData | undefined) ?? null
              captured.message = event.data.message
              break
            case "error":
              captured.error = event.message
              break
          }
        },
      )

      if (captured.error) {
        throw new AgentError("validation_failed", captured.error)
      }
      if (!captured.flowData) {
        throw new AgentError(
          "invalid_instruction",
          captured.message || "AI did not produce a flow plan. Try a more specific instruction.",
        )
      }

      const flowData = captured.flowData

      // buildFlowFromPlan assumes a start node (id="1") already exists on the
      // canvas and wires the first generated node FROM it — but never creates
      // the start node itself. The internal UI has it on the canvas already;
      // we must prepend it before saving so the version is complete.
      //
      // The start node shape must match what flow-storage.ts:370 creates —
      // it's platform-dependent (controls the trigger config panel in the UI)
      // and carries trigger keywords so the publish modal can read them.
      // Trigger IDs from constants/triggers.ts — the keyword-based trigger per platform
      const KEYWORD_TRIGGER_ID: Record<string, string> = {
        whatsapp: "whatsapp-message",
        instagram: "instagram-message",
        web: "web-embedded",
      }
      const triggerId = KEYWORD_TRIGGER_ID[channel] || "whatsapp-message"

      const startNode = {
        id: "1",
        type: "start",
        position: { x: 250, y: 25 },
        data: {
          label: "Start",
          platform: channel,
          triggerId,
          triggerIds: [triggerId],
          triggerKeywords: [normalizedKeyword],
          triggerMatchType: "exact",
          triggerRef: "",
        },
        draggable: true,
        selectable: true,
      }
      const allNodes = [startNode, ...flowData.nodes]

      // Step 3: Build change tracking entries (same shape as ChangeTracker produces)
      // so the version history UI shows what the AI created.
      const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const now = new Date().toISOString()
      const flowChanges = [
        // One node_add per AI-generated node (skip start — that's infrastructure)
        ...flowData.nodes.map((n: any) => ({
          id: generateId(),
          type: "node_add",
          timestamp: now,
          data: n,
          description: `Added ${n.type || "node"}: ${n.data?.label || n.id}`,
          source: "ai",
        })),
        // One edge_add per edge
        ...flowData.edges.map((e: any) => ({
          id: generateId(),
          type: "edge_add",
          timestamp: now,
          data: e,
          description: `Connected ${e.source} → ${e.target}`,
          source: "ai",
        })),
      ]

      writer.progress("saving", "Saving flow version")
      const version = await createVersion(
        ctx,
        projectId,
        allNodes,
        flowData.edges,
        flowChanges as any,
      )

      // Step 4: Publish version in magic-flow
      await publishVersion(ctx, projectId, version.id)

      // Step 5: Flatten template nodes → convert to fs-whatsapp flat steps → deploy
      // flattenFlow expands flowTemplate nodes (e.g. "Name") by inlining their
      // internal sub-nodes. Without this, the converter skips them (SKIP_NODE_TYPES).
      writer.progress("publishing", "Deploying to runtime")
      const flat = flattenFlow(allNodes, flowData.edges)
      const converted = convertToFsWhatsApp(
        flat.nodes,
        flat.edges,
        flowName,        // flowName
        undefined,                          // flowDescription
        [triggerId],                        // triggerIds
        [normalizedKeyword],                // triggerKeywords
        "exact",                            // triggerMatchType
        undefined,                          // triggerRef
        undefined,                          // flowSlug
        ctx.account.id,                     // whatsappAccount
      )
      const runtime = await publishRuntimeFlow(ctx, {
        flowData: converted as Record<string, unknown>,
        triggerKeywords: [normalizedKeyword],
        triggerMatchType: "exact",
      })

      // Step 5b: Save runtime flow ID (and first-time flow_slug) back
      // to the project so subsequent publishes update this flow instead
      // of creating duplicates. Matches UI's onPublished callback.
      await updateProject(ctx, projectId!, {
        published_flow_id: runtime.runtimeFlowId,
        ...(runtime.flowSlug ? { flow_slug: runtime.flowSlug } : {}),
      })

      // Step 6: Emit final result
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
      const phoneDigits = ctx.account.phone_number?.replace(/\D/g, "")
      const testUrl = phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(normalizedKeyword)}`
        : undefined

      writer.result({
        flow_id: projectId,
        version: version.version_number,
        name: flowName,
        summary: captured.message || "Flow created successfully",
        node_count: allNodes.length,
        magic_flow_url: `${appUrl}/flow/${projectId}`,
        test_url: testUrl,
        trigger_keyword: normalizedKeyword,
        created_at: new Date().toISOString(),
      })

      // runtime is used for the runtime flow ID (available for future use)
      void runtime
    } catch (err) {
      const agentErr = AgentError.fromUnknown(err)
      writer.error(agentErr)

      // Orphan cleanup
      if (projectId) {
        try {
          await deleteProject(ctx, projectId)
        } catch (cleanupErr) {
          console.error("[agent-api] Orphan cleanup failed:", projectId, cleanupErr)
        }
      }
    } finally {
      writer.close()
    }
  }

  // Fire pipeline async — the Response returns immediately with the readable stream
  pipeline()

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}, "expensive")
