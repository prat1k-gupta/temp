import { FS_WHATSAPP_URL } from "./constants"
import { AgentError } from "./errors"
import type { Account, WhatsAppAccountRaw } from "./types"

/**
 * TODO(multi-account): when orgs are allowed to have >1 account, this helper
 * must be replaced with an explicit account_id param on the request. For now
 * (single-account assumption), we unconditionally pick the first account
 * returned by fs-whatsapp. If an org has 0 accounts, we return an error.
 *
 * When this assumption is removed:
 *   1. Add `account_id` as a required param on POST /v1/agent/flows
 *   2. If we also add a GET /v1/agent/account(s) endpoint at that time, it returns an array
 *   3. Delete this helper
 *
 * Multi-channel note: fs-whatsapp's GET /api/accounts returns ONLY WhatsApp
 * accounts today (Instagram/Line are separate models with separate endpoints).
 * That's why `connected_channels` is hardcoded to ["whatsapp"] below. When
 * multi-channel ships, this helper queries the other platform endpoints and
 * unions the result.
 */
export async function getActingAccount(apiKey: string): Promise<Account> {
  let res: Response
  try {
    res = await fetch(`${FS_WHATSAPP_URL}/api/accounts`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (res.status === 401) {
    throw new AgentError("unauthorized", "Invalid or expired API key")
  }
  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when listing accounts`)
  }

  let body: { accounts?: WhatsAppAccountRaw[] }
  try {
    body = (await res.json()) as { accounts?: WhatsAppAccountRaw[] }
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable accounts response")
  }

  const accounts = body.accounts ?? []
  if (accounts.length === 0) {
    throw new AgentError(
      "no_account_configured",
      "This organization has no connected WhatsApp account. Connect one in the Freestand dashboard before using the agent API.",
    )
  }

  const first = accounts[0]
  return {
    id: first.id,
    name: first.name,
    phone_number: first.phone_number,
    connected_channels: ["whatsapp"],
  }
}
