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

    const response = await fetch(`${apiUrl}/api/chatbot/flows`, {
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
    const rawFlows = data.flows || []

    const flows = rawFlows.map((f: any) => ({
      id: f.id,
      name: f.name,
      flowSlug: f.flow_slug,
      variables: f.variables || [],
      triggerKeywords: f.trigger_keywords || [],
      triggerMatchType: f.trigger_match_type || "contains_whole_word",
      triggerRef: f.trigger_ref || "",
    }))

    return NextResponse.json({ flows })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch flows" },
      { status: 500 }
    )
  }
}
