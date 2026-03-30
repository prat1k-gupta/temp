import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: `/api/magic-flow/projects/${id}/versions/${versionId}/publish`, method: "POST", authToken, errorMessage: "Failed to publish version" })
}
