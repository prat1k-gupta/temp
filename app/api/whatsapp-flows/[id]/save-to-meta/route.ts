import { NextRequest } from "next/server"
import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return fsWhatsAppProxy({ path: `/api/flows/${id}/save-to-meta`, method: "POST", errorMessage: "Failed to save flow to Meta" })
}
