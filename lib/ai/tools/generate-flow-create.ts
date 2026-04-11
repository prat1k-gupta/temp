import { getAIClient } from "../core/ai-client"
import { flowPlanSchema } from "@/types/flow-plan"
import type { FlowPlan } from "@/types/flow-plan"
import { buildFlowFromPlan } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow, type FlowIssue } from "@/utils/flow-validator"
import type { Platform, TemplateResolver } from "@/types"
import type { GenerateFlowResponse } from "./generate-flow"

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

/**
 * Execute create mode: plan-based generation with self-correction loop.
 * Uses Haiku to generate a semantic flow plan, validates it, and retries up to 2x.
 */
export async function executeCreateMode(
  request: { platform: Platform },
  systemPrompt: string,
  userPrompt: string,
  templateResolver: TemplateResolver | undefined,
): Promise<GenerateFlowResponse> {
  const aiClient = getAIClient()
  const MAX_CORRECTION_RETRIES = 2
  let cachedIssues: FlowIssue[] | null = null

  for (let attempt = 0; attempt <= MAX_CORRECTION_RETRIES; attempt++) {
    const isRetry = attempt > 0
    const correctionFeedback = isRetry && cachedIssues
      ? buildCorrectionPrompt(cachedIssues, request.platform)
      : ""

    const effectiveUserPrompt = isRetry
      ? `${userPrompt}\n\n--- CORRECTION FEEDBACK ---\n${correctionFeedback}`
      : userPrompt

    const plan = await aiClient.generateJSON<FlowPlan>({
      systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
      userPrompt: effectiveUserPrompt,
      schema: flowPlanSchema,
      model: 'claude-sonnet',
    })

    const build = buildFlowFromPlan(plan, request.platform, templateResolver)
    const validation = validateGeneratedFlow(build.nodes, build.edges, request.platform)

    if (validation.isValid || attempt === MAX_CORRECTION_RETRIES) {
      const allWarnings = [
        ...build.warnings,
        ...(attempt > 0 && validation.isValid ? [`Flow validated after ${attempt} correction retry(s)`] : []),
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
    cachedIssues = validation.issues
  }

  // Unreachable (loop always returns), but TypeScript needs it
  return { message: "Flow generated", action: "create" as const }
}
