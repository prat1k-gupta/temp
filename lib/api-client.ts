import { getAccessToken, refreshAccessToken, clearAuth } from "./auth"

// Paths that stay on the Next.js server (have server-side secrets or special needs)
const LOCAL_PREFIXES = ["/api/auth/", "/api/ai/", "/api/test-api", "/api/campaigns", "/api/debug"]

class ApiClient {
  // Refresh dedup so a burst of parallel 401s only fires one refresh
  // round-trip. Both `fetch<T>` (JSON path) and `raw` (streaming path)
  // share the same primitive — without it, two consumers racing on an
  // expired token would each call /api/auth/refresh and clobber each
  // other's tokens.
  private isRefreshing = false
  private refreshPromise: Promise<string | null> | null = null

  /**
   * Route URL to fs-whatsapp or keep on Next.js.
   * Auth, AI, test-api, campaigns, debug routes stay local.
   * Everything else goes directly to fs-whatsapp.
   */
  private getFullUrl(url: string): string {
    if (LOCAL_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      return url
    }
    const base = process.env.NEXT_PUBLIC_FS_WHATSAPP_URL
    return base ? `${base}${url}` : url
  }

  /**
   * Unwrap fs-whatsapp response envelope.
   * fs-whatsapp wraps responses in { "status": "success", "data": {...} }.
   * The proxy used to do this — now apiClient handles it for direct calls.
   */
  private unwrapEnvelope(json: any): any {
    if (json && typeof json === "object" && "status" in json && "data" in json) {
      return json.data
    }
    return json
  }

  /**
   * Authenticated fetch returning the raw Response.
   *
   * Use this for streaming endpoints and other callers that need
   * Response-level access (body as ReadableStream, custom content-type
   * handling, etc.). The JSON path (`fetch<T>` / `get` / `post` / etc.)
   * is built on top of this — both share the same auth + refresh + retry
   * pipeline so there's a single source of truth for 401 handling.
   *
   * The retry on 401 is safe because the 401 status arrives in the
   * response headers BEFORE any body is consumed — we discard the failed
   * Response and start a fresh fetch with the new token. Callers never
   * see the intermediate 401.
   */
  async raw(url: string, options: RequestInit = {}): Promise<Response> {
    const fullUrl = this.getFullUrl(url)
    let response = await this.request(fullUrl, options)

    if (response.status === 401) {
      const newToken = await this.handleTokenRefresh()
      if (!newToken) {
        clearAuth()
        if (typeof window !== "undefined") {
          window.location.href = "/login"
        }
        throw new Error("Session expired")
      }
      response = await this.request(fullUrl, options, newToken)
    }

    return response
  }

  async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await this.raw(url, options)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error?.message || error?.data?.message || error?.error || `Request failed: ${response.status}`)
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T
    }
    const text = await response.text()
    if (!text) return undefined as T
    const json = JSON.parse(text)
    return this.unwrapEnvelope(json) as T
  }

  private async request(
    url: string,
    options: RequestInit,
    tokenOverride?: string
  ): Promise<Response> {
    const token = tokenOverride || getAccessToken()
    const headers = new Headers(options.headers)
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    return globalThis.fetch(url, { ...options, headers })
  }

  private async handleTokenRefresh(): Promise<string | null> {
    if (this.isRefreshing) {
      return this.refreshPromise
    }

    this.isRefreshing = true
    this.refreshPromise = refreshAccessToken()
      .catch(() => null as string | null)
      .finally(() => {
        this.isRefreshing = false
        this.refreshPromise = null
      })

    return this.refreshPromise
  }

  async get<T>(url: string): Promise<T> {
    return this.fetch<T>(url, { method: "GET" })
  }

  async post<T>(url: string, body?: unknown): Promise<T> {
    return this.fetch<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async put<T>(url: string, body?: unknown): Promise<T> {
    return this.fetch<T>(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async delete<T>(url: string): Promise<T> {
    return this.fetch<T>(url, { method: "DELETE" })
  }
}

export const apiClient = new ApiClient()
