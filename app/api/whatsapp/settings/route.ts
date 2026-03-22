import { NextRequest, NextResponse } from "next/server"

export async function GET(_request: NextRequest) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_URL or FS_WHATSAPP_API_KEY is not configured" },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(`${apiUrl}/api/chatbot/settings`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${errorText}` },
        { status: response.status }
      )
    }

    const result = await response.json()
    const data = result.data || result
    const settings = data.settings || data

    return NextResponse.json({
      globalVariables: settings.global_variables || {},
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch settings" },
      { status: 500 }
    )
  }
}
