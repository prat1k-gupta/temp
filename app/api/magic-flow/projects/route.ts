import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function GET(request: NextRequest) {
  const authToken = extractAuthToken(request)
  const { searchParams } = new URL(request.url)
  const params = new URLSearchParams()
  if (searchParams.get("page")) params.set("page", searchParams.get("page")!)
  if (searchParams.get("limit")) params.set("limit", searchParams.get("limit")!)
  if (searchParams.get("type")) params.set("type", searchParams.get("type")!)
  const qs = params.toString() ? `?${params.toString()}` : ""

  return fsWhatsAppProxy({ path: `/api/magic-flow/projects${qs}`, authToken, errorMessage: "Failed to fetch projects" })
}

export async function POST(request: NextRequest) {
  const authToken = extractAuthToken(request)
  const body = await request.json()
  return fsWhatsAppProxy({ path: "/api/magic-flow/projects", method: "POST", body, authToken, errorMessage: "Failed to create project" })
}
