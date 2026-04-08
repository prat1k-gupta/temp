import { NextRequest, NextResponse } from "next/server"
import { generateTemplateMetadata } from "@/lib/ai/tools/generate-template-metadata"
import type { Platform } from "@/types"

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "No AI API key configured" },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { nodes, edges, platform, flowName } = body

    if (!nodes || !edges || !platform) {
      return NextResponse.json(
        { error: "Missing required fields: nodes, edges, platform" },
        { status: 400 }
      )
    }

    const validPlatforms = ["web", "whatsapp", "instagram"]
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json(
        { error: `Invalid platform: "${platform}"` },
        { status: 400 }
      )
    }

    if (!Array.isArray(nodes) || nodes.length > 500) {
      return NextResponse.json(
        { error: "Invalid or too many nodes (max 500)" },
        { status: 400 }
      )
    }

    const result = await generateTemplateMetadata(
      nodes,
      edges,
      platform as Platform,
      flowName,
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error("[api/ai/generate-template-metadata] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
