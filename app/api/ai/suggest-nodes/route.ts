import { NextRequest, NextResponse } from "next/server"
import { suggestNodes } from "@/lib/ai/tools/suggest-nodes"
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
      currentNodeType,
      currentNodeId,
      platform,
      flowContext,
      existingNodes,
      edges,
      maxSuggestions = 2,
    } = body

    if (!currentNodeType || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: currentNodeType, platform" },
        { status: 400 }
      )
    }

    const result = await suggestNodes({
      currentNodeType,
      currentNodeId,
      platform: platform as Platform,
      flowContext,
      existingNodes,
      edges,
      maxSuggestions,
    })

    if (!result) {
      return NextResponse.json(
        { error: "Failed to generate node suggestions" },
        { status: 500 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[api/ai/suggest-nodes] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

