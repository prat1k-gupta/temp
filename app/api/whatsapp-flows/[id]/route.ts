import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  const body = await request.json()
  return fsWhatsAppProxy({ path: `/api/flows/${id}`, method: "PUT", body, authToken, errorMessage: "Failed to update WhatsApp Flow" })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: `/api/flows/${id}`, authToken, errorMessage: "Failed to fetch WhatsApp Flow" })
}
