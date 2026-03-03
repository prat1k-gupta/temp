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
    const { publishedFlowId, ...flowData } = await request.json()

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    }

    // Update existing flow or create new one
    const isUpdate = !!publishedFlowId
    const url = isUpdate
      ? `${apiUrl}/api/chatbot/flows/${publishedFlowId}`
      : `${apiUrl}/api/chatbot/flows`

    const response = await fetch(url, {
      method: isUpdate ? "PUT" : "POST",
      headers,
      body: JSON.stringify(flowData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${errorText}` },
        { status: response.status }
      )
    }

    const result = await response.json()
    // fs-whatsapp uses fastglue envelope: { status, data: { id, ... } }
    const data = result.data || result
    const flowId = data.id || data.flow_id || publishedFlowId
    return NextResponse.json({ success: true, flowId, updated: isUpdate })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to publish flow" },
      { status: 500 }
    )
  }
}
