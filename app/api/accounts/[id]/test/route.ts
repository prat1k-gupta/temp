import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return fsWhatsAppProxy({
    path: `/api/accounts/${id}/test`,
    method: "POST",
    errorMessage: "Failed to test account connection",
  })
}
