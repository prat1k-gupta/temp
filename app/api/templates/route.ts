import { NextRequest } from "next/server"
import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const params = new URLSearchParams()
  if (searchParams.get("account")) params.set("account", searchParams.get("account")!)
  if (searchParams.get("status")) params.set("status", searchParams.get("status")!)
  const qs = params.toString() ? `?${params.toString()}` : ""

  return fsWhatsAppProxy({ path: `/api/templates${qs}`, errorMessage: "Failed to fetch templates" })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  return fsWhatsAppProxy({ path: "/api/templates", method: "POST", body, errorMessage: "Failed to create template" })
}
