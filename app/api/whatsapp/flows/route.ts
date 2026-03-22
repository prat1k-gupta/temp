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
    const response = await fetch(`${apiUrl}/api/chatbot/flows`, {
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
    const rawFlows = data.flows || []

    const flows = rawFlows.map((f: any) => ({
      id: f.id,
      name: f.name,
      flowSlug: f.flow_slug,
      variables: f.variables || [],
    }))

    return NextResponse.json({ flows })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch flows" },
      { status: 500 }
    )
  }
}
