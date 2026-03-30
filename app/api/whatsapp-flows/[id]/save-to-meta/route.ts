import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: `/api/flows/${id}/save-to-meta`, method: "POST", authToken, errorMessage: "Failed to save flow to Meta" })
}
