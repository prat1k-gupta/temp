import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API not configured" },
      { status: 500 }
    )
  }

  try {
    const { flowId, triggerKeywords, triggerMatchType, triggerRef } = await request.json()

    if (!flowId) {
      return NextResponse.json(
        { error: "flowId is required" },
        { status: 400 }
      )
    }

    // Build update payload — only include fields that were sent
    const payload: Record<string, any> = {}
    if (Array.isArray(triggerKeywords)) {
      payload.trigger_keywords = triggerKeywords
    }
    if (triggerMatchType !== undefined) {
      payload.trigger_match_type = triggerMatchType
    }
    if (triggerRef !== undefined) {
      payload.trigger_ref = triggerRef
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { error: "No trigger fields to update" },
        { status: 400 }
      )
    }

    const response = await fetch(`${apiUrl}/api/chatbot/flows/${flowId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${errorText}` },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update keywords" },
      { status: 500 }
    )
  }
}
