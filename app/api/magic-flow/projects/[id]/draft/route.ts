import { NextRequest } from "next/server"
import { fsWhatsAppProxy, extractAuthToken } from "@/lib/fs-whatsapp-proxy"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: `/api/magic-flow/projects/${id}/draft`, authToken, errorMessage: "Failed to fetch draft" })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  const body = await request.json()
  return fsWhatsAppProxy({ path: `/api/magic-flow/projects/${id}/draft`, method: "PUT", body, authToken, errorMessage: "Failed to save draft" })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authToken = extractAuthToken(request)
  return fsWhatsAppProxy({ path: `/api/magic-flow/projects/${id}/draft`, method: "DELETE", authToken, errorMessage: "Failed to delete draft" })
}
