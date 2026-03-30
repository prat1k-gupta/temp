import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function GET(request: NextRequest) {
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: "/api/accounts", authToken, errorMessage: "Failed to fetch accounts" })
}
