import { NextResponse } from "next/server"

/**
 * Shared proxy helper for fs-whatsapp API calls.
 * All template/account/flow routes proxy through this.
 */

function getConfig() {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const apiKey = process.env.FS_WHATSAPP_API_KEY
  if (!apiUrl || !apiKey) {
    return { error: "FS_WHATSAPP_API_URL or FS_WHATSAPP_API_KEY not configured" }
  }
  return { apiUrl, apiKey }
}

interface ProxyOptions {
  /** Path relative to fs-whatsapp base URL, e.g. "/api/templates" */
  path: string
  method?: string
  body?: unknown
  /** Error message shown on failure */
  errorMessage?: string
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
    const fetchOptions: RequestInit = {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
    }
    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body)
    }

    const response = await fetch(`${config.apiUrl}${options.path}`, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { error: `Upstream error: ${response.status} ${errorText}` },
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
