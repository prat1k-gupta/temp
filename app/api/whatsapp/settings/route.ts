import { NextRequest, NextResponse } from "next/server"
import { extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function GET(request: NextRequest) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY

  if (!apiUrl) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_URL is not configured" },
      { status: 500 }
    )
  }

  try {
    const authToken = extractAuthToken(request)
    const headers: Record<string, string> = {}
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`
    } else if (apiKey) {
      headers["X-API-Key"] = apiKey
    }

    const response = await fetch(`${apiUrl}/api/chatbot/settings`, {
      headers,
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
