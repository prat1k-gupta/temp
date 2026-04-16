import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import { editFlowBodySchema } from "@/lib/agent-api/schemas"
import { SSEWriter } from "@/lib/agent-api/sse"
import { loadFlowForEdit } from "@/lib/agent-api/flow-loader"
import { createVersion } from "@/lib/agent-api/publisher"
import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import type { Node, Edge } from "@xyflow/react"

interface CapturedUpdates {
  nodes?: Node[]
  edges?: Edge[]
  removeNodeIds?: string[]
  removeEdges?: Array<{ source: string; target: string; sourceHandle?: string }>
  positionShifts?: Array<{ nodeId: string; dx: number }>
}

/**
 * POST /v1/agent/flows/{flow_id}/edit — edit an existing flow via AI instruction, streamed as SSE.
 *
 * Body: { instruction: string }
 *
 * Pre-stream validation errors (JSON body parse, schema, flow not found) are
 * returned as plain HTTP errors before the SSE stream opens.
 *
 * After the stream opens, errors are emitted as SSE error events.
 * No orphan cleanup needed — we're editing an existing project, not creating one.
 *
 * Auth: X-API-Key header with a whm_* key. See withAgentAuth.
 * Rate limit bucket: expensive (10/min).
 */
export const POST = withAgentAuth(async (ctx, req) => {
  // --- Extract flow_id from URL path ---
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const flowIdIndex = segments.indexOf("flows") + 1
  const flowId = segments[flowIdIndex]

  if (!flowId) {
    throw new AgentError("invalid_param", "Missing flow_id in path")
  }

  // --- Pre-stream validation (HTTP errors, not SSE) ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    throw new AgentError("missing_required_param", "Invalid or missing JSON body")
  }

  const parsed = editFlowBodySchema.safeParse(body)
  if (!parsed.success) {
    throw new AgentError("invalid_param", "Invalid request body", {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const { instruction } = parsed.data

  // Load flow + validate it exists before opening the stream.
  // Throws AgentError (404 etc.) as HTTP errors if the flow doesn't exist.
  const editCtx = await loadFlowForEdit(ctx, flowId)
  const { project, existingFlow } = editCtx

  // --- Start SSE stream ---
  const { readable, writer } = SSEWriter.create()

  const pipeline = async () => {
    try {
      writer.progress("understanding", "Analyzing your edit request")

      // Capture result from AI streaming via closure
      const captured: {
        updates: CapturedUpdates | null
        message: string
        error: string | null
        versionSavedByTool: boolean
      } = { updates: null, message: "", error: null, versionSavedByTool: false }

      // Pass default templates so the AI can resolve flowTemplate nodes
      const userTemplates = DEFAULT_TEMPLATES.map(t => ({
        id: t.id, name: t.name, aiMetadata: t.aiMetadata,
      }))
      const userTemplateData = DEFAULT_TEMPLATES.map(t => ({
        id: t.id, name: t.name, nodes: t.nodes, edges: t.edges,
      }))

      await generateFlowStreaming(
        {
          prompt: instruction,
          platform: project.platform as any,
          existingFlow: {
            nodes: existingFlow.nodes,
            edges: existingFlow.edges,
          },
          context: { source: "agent_api" },
          userTemplates,
          userTemplateData,
          toolContext: editCtx.toolContext,
        },
        (event: StreamEvent) => {
          switch (event.type) {
            case "text_delta":
              // drop — AI prose tokens are noise for the agent API
              break
            case "tool_step":
              if (event.status === "done" && event.summary) {
                writer.progress("editing", event.summary)
              }
              break
            case "flow_ready":
              writer.progress("validating", "Edit validated")
              break
            case "result":
              captured.updates = (event.data.updates as CapturedUpdates | undefined) ?? null
              captured.message = event.data.message
              captured.versionSavedByTool = event.data.versionSavedByTool === true
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
      if (!captured.updates) {
        throw new AgentError(
          "invalid_instruction",
          captured.message || "AI did not produce any edits. Try a more specific instruction.",
        )
      }

      const updates = captured.updates

      // --- Merge updates into existing flow ---
      const existingNodes = existingFlow.nodes
      const existingEdges = existingFlow.edges

      // Step 1: Remove nodes in removeNodeIds
      const removeNodeIds = new Set(updates.removeNodeIds ?? [])
      let mergedNodes = existingNodes.filter(n => !removeNodeIds.has(n.id))

      // Step 2: Apply updated nodes (replace existing by ID, add truly new ones)
      if (updates.nodes && updates.nodes.length > 0) {
        const updatesById = new Map(updates.nodes.map(n => [n.id, n]))
        // Replace existing nodes that appear in updates
        mergedNodes = mergedNodes.map(n => updatesById.has(n.id) ? updatesById.get(n.id)! : n)
        // Add truly new nodes (not already in the merged list)
        const existingIds = new Set(mergedNodes.map(n => n.id))
        for (const n of updates.nodes) {
          if (!existingIds.has(n.id)) {
            mergedNodes.push(n)
          }
        }
      }

      // Step 3: Apply position shifts (dx offsets)
      if (updates.positionShifts && updates.positionShifts.length > 0) {
        const shiftMap = new Map(updates.positionShifts.map(s => [s.nodeId, s.dx]))
        mergedNodes = mergedNodes.map(n => {
          const dx = shiftMap.get(n.id)
          if (dx === undefined) return n
          return { ...n, position: { ...n.position, x: n.position.x + dx } }
        })
      }

      // Step 4: Remove edges matching removeEdges keys (source-target-sourceHandle)
      const removeEdgeKeys = new Set(
        (updates.removeEdges ?? []).map(e =>
          `${e.source}-${e.target}-${e.sourceHandle ?? ""}`,
        ),
      )
      let mergedEdges = existingEdges.filter(e => {
        const key = `${e.source}-${e.target}-${e.sourceHandle ?? ""}`
        return !removeEdgeKeys.has(key)
      })

      // Step 5: Add new edges
      if (updates.edges && updates.edges.length > 0) {
        mergedEdges = [...mergedEdges, ...updates.edges]
      }

      // Step 6: Enforce edge invariant — each (source, sourceHandle) pair
      // can have at most one outgoing edge. A single output port pointing
      // to two targets is structurally invalid. When duplicates exist
      // (typically from AI self-correction losing removeEdges), keep the
      // newest edge (from updates.edges) and drop the stale one.
      const newEdgeIds = new Set((updates.edges ?? []).map(e => e.id))
      const seenSourceHandles = new Map<string, Edge>()
      const deduped: Edge[] = []
      // Process newest edges first so they win on conflict
      for (const e of [...mergedEdges].reverse()) {
        const key = `${e.source}::${e.sourceHandle ?? "default"}`
        if (!seenSourceHandles.has(key)) {
          seenSourceHandles.set(key, e)
          deduped.push(e)
        }
      }
      mergedEdges = deduped.reverse()

      // --- Build change tracking entries ---
      const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const now = new Date().toISOString()

      const existingNodeIds = new Set(existingNodes.map(n => n.id))
      const flowChanges = [
        // node_update or node_add for each node in updates
        ...(updates.nodes ?? []).map((n: any) => ({
          id: generateId(),
          type: existingNodeIds.has(n.id) ? "node_update" : "node_add",
          timestamp: now,
          data: n,
          description: existingNodeIds.has(n.id)
            ? `Updated ${n.type || "node"}: ${n.data?.label || n.id}`
            : `Added ${n.type || "node"}: ${n.data?.label || n.id}`,
          source: "ai",
        })),
        // node_remove for each removed node
        ...(updates.removeNodeIds ?? []).map((nodeId: string) => ({
          id: generateId(),
          type: "node_remove",
          timestamp: now,
          data: { id: nodeId },
          description: `Removed node: ${nodeId}`,
          source: "ai",
        })),
      ]

      // Skip version save if the publish_flow tool already created one
      // during the AI session — otherwise we'd create a duplicate row.
      let versionNumber: number
      let published = false
      if (captured.versionSavedByTool) {
        // Tool already saved + published. Fetch the latest for version number.
        const { getLatestVersion } = await import("@/lib/agent-api/publisher")
        const latest = await getLatestVersion(ctx, project.id)
        versionNumber = latest?.versionNumber ?? 0
        published = latest?.isPublished ?? false
        writer.progress("saving", "Version already saved by publish_flow tool")
      } else {
        writer.progress("saving", "Saving updated flow version")
        const newVersion = await createVersion(
          ctx,
          project.id,
          mergedNodes,
          mergedEdges,
          flowChanges as any,
        )
        versionNumber = newVersion.version_number
      }

      // --- Emit final result ---
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"

      // Compact changes summary (no full node data — just type, node_id, description)
      const changesSummary = flowChanges.map(c => ({
        type: c.type,
        node_id: (c.data as any).id,
        description: c.description,
      }))

      writer.result({
        flow_id: project.id,
        version: versionNumber,
        published,
        name: project.name,
        summary: captured.message || "Flow edited successfully",
        changes: changesSummary,
        node_count: mergedNodes.length,
        magic_flow_url: `${appUrl}/flow/${project.id}`,
        next_action: published
          ? undefined
          : `Call POST /v1/agent/flows/${project.id}/publish to make this version live`,
        updated_at: now,
      })
    } catch (err) {
      const agentErr = AgentError.fromUnknown(err)
      writer.error(agentErr)
      // No orphan cleanup — we're editing an existing project, not creating a new one
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
