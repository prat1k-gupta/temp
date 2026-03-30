import { getAccessToken, refreshAccessToken, clearAuth } from "./auth"

class ApiClient {
  private isRefreshing = false
  private refreshPromise: Promise<string | null> | null = null

  async fetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await this.request(url, options)

    if (response.status === 401) {
      const newToken = await this.handleTokenRefresh()
      if (!newToken) {
        clearAuth()
        window.location.href = "/login"
        throw new Error("Session expired")
      }
      const retryResponse = await this.request(url, options, newToken)
      if (!retryResponse.ok) {
        throw new Error(`Request failed: ${retryResponse.status}`)
      }
      return retryResponse.json()
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || `Request failed: ${response.status}`)
    }

    return response.json()
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
