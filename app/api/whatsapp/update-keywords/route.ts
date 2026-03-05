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
    const { flowId, triggerKeywords } = await request.json()

    if (!flowId) {
      return NextResponse.json(
        { error: "flowId is required" },
        { status: 400 }
      )
    }

    if (!Array.isArray(triggerKeywords) || triggerKeywords.length === 0) {
      return NextResponse.json(
        { error: "triggerKeywords must be a non-empty array" },
        { status: 400 }
      )
    }

    const response = await fetch(`${apiUrl}/api/chatbot/flows/${flowId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ trigger_keywords: triggerKeywords }),
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
