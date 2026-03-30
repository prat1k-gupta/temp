/**
 * Query key factory for type-safe, consistent cache keys.
 * Following TanStack Query best practice: hierarchical key arrays.
 * @see https://tkdodo.eu/blog/effective-react-query-keys
 */

export const flowKeys = {
  all: ["flows"] as const,
  lists: () => [...flowKeys.all, "list"] as const,
  detail: (id: string) => [...flowKeys.all, "detail", id] as const,
} as const

export const versionKeys = {
  all: (projectId: string) => ["versions", projectId] as const,
  list: (projectId: string) => [...versionKeys.all(projectId), "list"] as const,
  draft: (projectId: string) => [...versionKeys.all(projectId), "draft"] as const,
} as const
