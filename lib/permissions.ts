export type Role = "admin" | "manager" | "agent"

export const FEATURES = [
  "flows",
  "templates",
  "chat",
  "campaigns",
  "contacts",
  "analytics",
  "accounts",
  "users",
  "teams",
  "chatbot-settings",
  "api-keys",
  "agent-analytics",
] as const

export type Feature = (typeof FEATURES)[number]

/**
 * Default feature sets per role. Mirrors fs-whatsapp backend middleware.
 * Phase B replaces this with org-level config from the API.
 */
export const DEFAULT_ROLE_FEATURES: Record<Role, Feature[]> = {
  admin: [
    "flows", "templates", "chat", "campaigns", "contacts", "analytics",
    "accounts", "users", "teams",
    "chatbot-settings", "api-keys", "agent-analytics",
  ],
  manager: [
    "flows", "templates", "chat", "campaigns", "contacts", "analytics",
    "accounts", "teams", "chatbot-settings", "agent-analytics",
  ],
  agent: [
    "chat", "contacts", "agent-analytics",
  ],
}

/**
 * Check if a feature is granted by the given permissions.
 * Supports prefix matching: having 'flows' grants 'flows.publish'.
 * Pure function — use directly in tests/middleware, or via useAuth().can() in components.
 */
export function canAccess(permissions: string[], feature: string): boolean {
  if (permissions.includes(feature)) return true

  // Prefix match: a top-level permission (e.g. 'flows') grants any sub-feature
  // (e.g. 'flows.publish'). Only one level of nesting is used today — if
  // deeper nesting is introduced (e.g. 'users.export'),
  // this function will need to walk all ancestor segments, not just parts[0].
  const parts = feature.split(".")
  if (parts.length > 1) {
    return permissions.includes(parts[0])
  }

  return false
}
