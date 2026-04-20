import { FS_WHATSAPP_URL } from "./constants"

export interface ProxyOptions {
  apiKey: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
}

export interface ProxyResult<T = unknown> {
  ok: boolean
  status: number
  data?: T
  error?: { code: string; message: string }
  warnings?: Array<{ code: string; message: string; [extra: string]: unknown }>
}

export async function proxyToFsWhatsApp<T = unknown>(opts: ProxyOptions): Promise<ProxyResult<T>> {
  const url = new URL(FS_WHATSAPP_URL + opts.path)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method,
    headers: {
      "X-API-Key": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  })

  const envelope: any = await res.json().catch(() => ({}))

  if (envelope.status === "error") {
    return {
      ok: false,
      status: res.status,
      error: {
        code: envelope.data?.code ?? "internal_error",
        message: envelope.message ?? "Request failed",
      },
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data: envelope.data as T,
    warnings: envelope.data?.warnings,
  }
}
