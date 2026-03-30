import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: `/api/magic-flow/projects/${id}/versions`, authToken, errorMessage: "Failed to fetch versions" })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  const body = await request.json()
  return fsWhatsAppProxy({ path: `/api/magic-flow/projects/${id}/versions`, method: "POST", body, authToken, errorMessage: "Failed to create version" })
}
