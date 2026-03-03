import { NextRequest, NextResponse } from "next/server"
import { generateFlow } from "@/lib/ai/tools/generate-flow"
import type { Platform } from "@/types"

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your .env.local file." },
        { status: 500 }
      )
    }

    const body = await request.json()
    const {
      message,
      platform,
      flowContext,
      conversationHistory,
      existingFlow,
      selectedNode,
    } = body

    if (!message || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: message, platform" },
        { status: 400 }
      )
    }

    const result = await generateFlow({
      prompt: message,
      platform: platform as Platform,
      flowContext,
      conversationHistory,
      existingFlow,
      selectedNode,
    })

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate flow" },
        { status: 500 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[api/ai/flow-assistant] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

