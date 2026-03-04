import { fsWhatsAppProxy } from "@/lib/fs-whatsapp-proxy"

export async function GET() {
  return fsWhatsAppProxy({ path: "/api/accounts", errorMessage: "Failed to fetch accounts" })
}
