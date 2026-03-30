import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_URL is not configured" },
      { status: 500 }
    )
  }

  try {
    const authHeader = request.headers.get("Authorization")
    if (!authHeader) {
      return NextResponse.json(
        { error: "No authorization header" },
        { status: 401 }
      )
    }

    const response = await fetch(`${apiUrl}/api/me`, {
      headers: { Authorization: authHeader },
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Failed to fetch user (${response.status})`
      try {
        const parsed = JSON.parse(errorText)
        errorMessage = parsed.message || parsed.error || errorMessage
      } catch {
        /* not JSON */
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    const result = await response.json()
    return NextResponse.json(result.data || result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch user" },
      { status: 500 }
    )
  }
}
