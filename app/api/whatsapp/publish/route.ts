import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY

  if (!apiUrl) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_URL is not configured" },
      { status: 500 }
    )
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_KEY is not configured" },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    }

    const response = await fetch(`${apiUrl}/api/chatbot/flows`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${errorText}` },
        { status: response.status }
      )
    }

    const result = await response.json()
    return NextResponse.json({ success: true, flowId: result.id || result.flow_id })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to publish flow" },
      { status: 500 }
    )
  }
}
