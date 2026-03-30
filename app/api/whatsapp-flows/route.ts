import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

/**
 * Proxy for Meta WhatsApp Flows (interactive forms).
 * Distinct from /api/whatsapp/flows which lists chatbot flows.
 */
export async function GET(request: NextRequest) {
  const authToken = extractAuthToken(request)
  const { searchParams } = new URL(request.url)
  const params = new URLSearchParams()
  if (searchParams.get("account")) params.set("account", searchParams.get("account")!)
  if (searchParams.get("status")) params.set("status", searchParams.get("status")!)
  const qs = params.toString() ? `?${params.toString()}` : ""

  return fsWhatsAppProxy({ path: `/api/flows${qs}`, authToken, errorMessage: "Failed to fetch WhatsApp Flows" })
}

export async function POST(request: NextRequest) {
  const authToken = extractAuthToken(request)
  const body = await request.json()
  return fsWhatsAppProxy({ path: "/api/flows", method: "POST", body, authToken, errorMessage: "Failed to create WhatsApp Flow" })
}
