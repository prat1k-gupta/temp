import { NextRequest, NextResponse } from "next/server"

/**
 * Proxy route for testing API calls from the flow builder.
 * Avoids CORS issues and handles {{variable}} template substitution.
 */
export async function POST(request: NextRequest) {
  try {
    const { url, method, headers, body, testVariables } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Replace {{variable}} placeholders with test values
    const processedUrl = replaceVariables(url, testVariables || {})
    const processedBody = body ? replaceVariables(body, testVariables || {}) : undefined
    const processedHeaders: Record<string, string> = {}
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (key) {
          processedHeaders[key] = replaceVariables(String(value), testVariables || {})
        }
      }
    }

    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers: processedHeaders,
      signal: AbortSignal.timeout(15000),
    }

    if (processedBody && (method === "POST" || method === "PUT")) {
      fetchOptions.body = processedBody
      // Auto-set Content-Type if not provided
      if (!Object.keys(processedHeaders).some((k) => k.toLowerCase() === "content-type")) {
        processedHeaders["Content-Type"] = "application/json"
        fetchOptions.headers = processedHeaders
      }
    }

    const startTime = Date.now()
    const response = await fetch(processedUrl, fetchOptions)
    const duration = Date.now() - startTime

    const contentType = response.headers.get("content-type") || ""
    let responseBody: any
    if (contentType.includes("application/json")) {
      responseBody = await response.json()
    } else {
      responseBody = await response.text()
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      duration,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
      processedUrl,
    })
  } catch (error: any) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out (15s)" }, { status: 408 })
    }
    return NextResponse.json(
      { error: error.message || "Failed to make API request" },
      { status: 500 }
    )
  }
}

function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    return variables[varName] ?? `{{${varName}}}`
  })
}

/**
 * Extract a nested value from a JSON object using dot notation.
 * Supports: "name", "user.profile.name", "items[0].name"
 */
function getNestedValue(data: any, path: string): any {
  if (data == null || !path) return undefined

  const parts = path.split(/\.(?![^[]*\])/)
  let current = data

  for (const part of parts) {
    if (current == null) return undefined

    const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/)
    if (arrayMatch) {
      const [, field, indexStr] = arrayMatch
      current = current[field]
      if (!Array.isArray(current)) return undefined
      current = current[parseInt(indexStr, 10)]
    } else {
      current = current[part]
    }
  }

  return current
}

/**
 * POST /api/test-api/extract — extract response mapping from a response body
 */
export async function PUT(request: NextRequest) {
  try {
    const { responseBody, responseMapping } = await request.json()

    if (!responseBody || !responseMapping) {
      return NextResponse.json({ error: "responseBody and responseMapping are required" }, { status: 400 })
    }

    const extracted: Record<string, any> = {}
    for (const [varName, jsonPath] of Object.entries(responseMapping)) {
      extracted[varName] = getNestedValue(responseBody, jsonPath as string)
    }

    return NextResponse.json({ extracted })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
