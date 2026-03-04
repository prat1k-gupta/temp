import { NextRequest } from "next/server"
import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fsWhatsAppProxy({ path: `/api/templates/${id}`, errorMessage: "Failed to fetch template" })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  return fsWhatsAppProxy({ path: `/api/templates/${id}`, method: "PUT", body, errorMessage: "Failed to update template" })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fsWhatsAppProxy({ path: `/api/templates/${id}`, method: "DELETE", errorMessage: "Failed to delete template" })
}
