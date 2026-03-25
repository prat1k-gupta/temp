import { NextRequest } from "next/server"
import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  return fsWhatsAppProxy({ path: `/api/flows/${id}`, method: "PUT", body, errorMessage: "Failed to update WhatsApp Flow" })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return fsWhatsAppProxy({ path: `/api/flows/${id}`, errorMessage: "Failed to fetch WhatsApp Flow" })
}
