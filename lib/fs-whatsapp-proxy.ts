import { NextRequest, NextResponse } from "next/server"

/**
 * Shared proxy helper for fs-whatsapp API calls.
 * All template/account/flow routes proxy through this.
 */

function getConfig() {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY
  if (!apiUrl) {
    return { error: "FS_WHATSAPP_API_URL is not configured" }
  }
  return { apiUrl, apiKey }
}

/**
 * Extract Bearer token from the Authorization header of an incoming request.
 */
export function extractAuthToken(request: NextRequest): string | undefined {
  const header = request.headers.get("Authorization")
  if (header?.startsWith("Bearer ")) {
    return header.slice(7)
  }
  return undefined
}

interface ProxyOptions {
  /** Path relative to fs-whatsapp base URL, e.g. "/api/templates" */
  path: string
  method?: string
  body?: unknown
  /** Error message shown on failure */
  errorMessage?: string
  /** JWT auth token to forward instead of API key */
  authToken?: string
}

/**
 * Proxy a request to fs-whatsapp and return the unwrapped response.
 * Handles config validation, headers, error wrapping, and envelope unwrapping.
 */
export async function fsWhatsAppProxy(options: ProxyOptions): Promise<NextResponse> {
  const config = getConfig()
  if ("error" in config) {
    return NextResponse.json({ error: config.error }, { status: 500 })
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }

    if (options.authToken) {
      headers["Authorization"] = `Bearer ${options.authToken}`
    } else if (config.apiKey) {
      headers["X-API-Key"] = config.apiKey
    }

    const fetchOptions: RequestInit = {
      method: options.method || "GET",
      cache: "no-store",
      headers,
    }
    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body)
    }

    const response = await fetch(`${config.apiUrl}${options.path}`, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      // Try to extract the message from fs-whatsapp's envelope: { "status": "error", "message": "..." }
      let errorMessage = `Upstream error (${response.status})`
      try {
        const parsed = JSON.parse(errorText)
        errorMessage = parsed.message || parsed.error || errorMessage
      } catch { /* not JSON, use raw text */ }
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      )
    }

    // Handle DELETE or empty responses
    const text = await response.text()
    if (!text) {
      return NextResponse.json({ success: true })
    }

    const result = JSON.parse(text)
    return NextResponse.json(result.data || result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || options.errorMessage || "Request failed" },
      { status: 500 }
    )
  }
}
