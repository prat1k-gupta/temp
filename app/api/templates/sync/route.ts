import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function POST() {
  return fsWhatsAppProxy({ path: "/api/templates/sync", method: "POST", errorMessage: "Failed to sync templates from Meta" })
}
