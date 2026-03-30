import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl) {
    return NextResponse.json(
      { error: "FS_WHATSAPP_API_URL is not configured" },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()

    const response = await fetch(`${apiUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Registration failed (${response.status})`
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
      { error: error.message || "Registration request failed" },
      { status: 500 }
    )
  }
}
