import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function POST(request: NextRequest) {
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: "/api/templates/sync", method: "POST", authToken, errorMessage: "Failed to sync templates from Meta" })
}
