import { getAIClient } from "../core/ai-client"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { z } from "zod"
import { collectFlowVariables } from "@/utils/flow-variables"

const metadataSchema = z.object({
  suggestedName: z.string(),
  description: z.string(),
  aiMetadata: z.object({
    description: z.string(),
    whenToUse: z.string(),
    selectionRule: z.string().optional(),
  }),
})

export type TemplateMetadataResult = z.infer<typeof metadataSchema>

export async function generateTemplateMetadata(
  nodes: Node[],
  edges: Edge[],
  platform: Platform,
  flowName?: string,
): Promise<TemplateMetadataResult> {
  const aiClient = getAIClient()

  // Build a summary of the flow for the AI
  const contentNodes = nodes.filter(n => n.type !== "start" && n.type !== "comment")
  const nodeTypes = contentNodes.map(n => n.type).join(", ")
  const variables = collectFlowVariables(nodes)
  const nodeCount = contentNodes.length

  const systemPrompt = `You generate metadata for reusable flow templates. Output ONLY valid JSON matching the schema.`

  const userPrompt = `Analyze this ${platform} chatbot flow and generate template metadata.

Flow name: ${flowName || "Unnamed"}
Node count: ${nodeCount}
Node types used: ${nodeTypes}
Variables collected: ${variables.length > 0 ? variables.join(", ") : "none"}

Generate:
- suggestedName: a clear, concise template name (e.g. "Product Sample Collection", "Customer Feedback")
- description: 1-2 sentence user-facing description of what this template does
- aiMetadata.description: what the template does (for AI context)
- aiMetadata.whenToUse: when the AI should suggest using this template
- aiMetadata.selectionRule: short imperative rule (e.g. "Use when collecting product preferences and scheduling delivery")`

  try {
    const result = await aiClient.generateJSON<TemplateMetadataResult>({
      systemPrompt,
      userPrompt,
      schema: metadataSchema,
      model: 'claude-haiku',
    })
    return result
  } catch {
    // Fallback: generate basic metadata without AI
    const name = flowName ? `${flowName} Template` : "Flow Template"
    return {
      suggestedName: name,
      description: `Reusable template with ${nodeCount} nodes`,
      aiMetadata: {
        description: `A ${platform} flow template with ${nodeCount} nodes`,
        whenToUse: `When you need a flow similar to "${flowName || "this flow"}"`,
      },
    }
  }
}
