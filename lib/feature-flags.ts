/**
 * Feature flags for magic-flow.
 * NEXT_PUBLIC_STORAGE_MODE controls where flow data is stored:
 * - "api" (default): all data goes through the backend API
 * - "local": localStorage fallback (offline mode, no sync)
 */
export function isApiStorage(): boolean {
  return process.env.NEXT_PUBLIC_STORAGE_MODE !== "local"
}
