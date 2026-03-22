import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const { flowId } = await params
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_URL or FS_WHATSAPP_API_KEY is not configured" },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(`${apiUrl}/api/chatbot/flows/${flowId}`, {
      headers: { "X-API-Key": apiKey },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: response.status }
      )
    }

    const result = await response.json()
    const data = result.data || result
    return NextResponse.json({
      flowSlug: data.flow_slug || undefined,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch flow" },
      { status: 500 }
    )
  }
}
