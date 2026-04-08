/**
 * Query key factory for type-safe, consistent cache keys.
 * Following TanStack Query best practice: hierarchical key arrays.
 * @see https://tkdodo.eu/blog/effective-react-query-keys
 */

export const flowKeys = {
  all: ["flows"] as const,
  lists: () => [...flowKeys.all, "list"] as const,
  detail: (id: string) => [...flowKeys.all, "detail", id] as const,
  templates: () => [...flowKeys.all, "templates"] as const,
} as const

export const versionKeys = {
  all: (projectId: string) => ["versions", projectId] as const,
  list: (projectId: string) => [...versionKeys.all(projectId), "list"] as const,
  draft: (projectId: string) => [...versionKeys.all(projectId), "draft"] as const,
} as const

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
} as const

export const teamKeys = {
  all: ["teams"] as const,
  list: () => [...teamKeys.all, "list"] as const,
} as const

export const apiKeyKeys = {
  all: ["apiKeys"] as const,
  list: () => [...apiKeyKeys.all, "list"] as const,
} as const

export const chatbotSettingsKeys = {
  all: ["chatbotSettings"] as const,
  detail: () => [...chatbotSettingsKeys.all, "detail"] as const,
} as const

export const profileKeys = {
  all: ["profile"] as const,
  me: () => [...profileKeys.all, "me"] as const,
} as const

export const accountKeys = {
  all: ["accounts"] as const,
  list: () => [...accountKeys.all, "list"] as const,
} as const

export const flowApiKeyKeys = {
  all: ["flowApiKeys"] as const,
  list: () => [...flowApiKeyKeys.all, "list"] as const,
} as const

export const rolePermissionKeys = {
  all: ["rolePermissions"] as const,
  list: () => [...rolePermissionKeys.all, "list"] as const,
} as const
