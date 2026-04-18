import { NextRequest, NextResponse } from "next/server"
import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"
import type { Platform } from "@/types"

export async function POST(request: NextRequest) {
  // Pre-stream validation — returns JSON errors (not streamed)
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your .env.local file." },
      { status: 500 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const {
    message,
    platform,
    flowContext,
    conversationHistory,
    existingFlow,
    selectedNode,
    userTemplates,
    userTemplateData,
    publishedFlowId,
    waAccountName,
    // Project metadata for publish_flow tool
    projectId,
    projectName,
    triggerKeywords,
    triggerMatchType,
    flowSlug,
    waAccountId,
    waPhoneNumber,
    userTimezone,
  } = body

  const authHeader = request.headers.get('Authorization') || ''

  const validPlatforms: Platform[] = ["web", "whatsapp", "instagram"]

  if (!message || !platform) {
    return NextResponse.json(
      { error: "Missing required fields: message, platform" },
      { status: 400 }
    )
  }

  if (!validPlatforms.includes(platform)) {
    return NextResponse.json(
      { error: `Invalid platform: "${platform}". Must be one of: ${validPlatforms.join(", ")}` },
      { status: 400 }
    )
  }

  const requestData = {
    prompt: message,
    platform: platform as Platform,
    flowContext,
    conversationHistory,
    existingFlow,
    selectedNode,
    userTemplates,
    userTemplateData,
    toolContext: {
      publishedFlowId,
      waAccountName,
      authHeader,
      projectId,
      projectName,
      triggerKeywords,
      triggerMatchType,
      flowSlug,
      waAccountId,
      waPhoneNumber,
      userTimezone,
      // Server-side "now" — trainings priors are unreliable for dates, and
      // the AI needs this to resolve "tomorrow 9 PM" correctly.
      currentTime: new Date().toISOString(),
    },
  }

  // Streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // Controller already closed — ignore
        }
      }

      try {
        await generateFlowStreaming(requestData, emit)
      } catch (error) {
        console.error("[api/ai/flow-assistant] Stream error:", error)
        emit({ type: 'error', message: error instanceof Error ? error.message : 'Internal error' })
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed — ignore
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
