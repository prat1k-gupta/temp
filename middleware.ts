import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

// Routes that bypass the JWT cookie auth.
// `/api/v1/agent/*` is auth-protected too, but via X-API-Key + withAgentAuth,
// not the mf_access_token cookie. Those routes handle their own rejection.
const PUBLIC_ROUTES = ["/login", "/register", "/api/auth", "/api/v1/agent"]
const STATIC_PREFIXES = ["/_next", "/app/_next", "/favicon.ico"]

// API routes get JSON 401 instead of an HTML redirect so client-side fetch
// handlers can detect the failure, refresh the token, and retry. Without
// this, a streaming endpoint like /api/ai/flow-assistant follows the 302
// to /login, parses the HTML response as NDJSON garbage, and hangs the
// chat UI on "Thinking…" forever.
function rejectAuth(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    const response = NextResponse.json(
      { error: "Unauthorized", code: "TOKEN_EXPIRED" },
      { status: 401 }
    )
    response.cookies.delete("mf_access_token")
    return response
  }
  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("redirect", pathname)
  const response = NextResponse.redirect(loginUrl)
  response.cookies.delete("mf_access_token")
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public routes and static assets
  if (
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) ||
    STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next()
  }

  // Check auth cookie
  const token = request.cookies.get("mf_access_token")?.value
  if (!token) {
    return rejectAuth(request, pathname)
  }

  // Verify JWT signature
  const secret = process.env.JWT_SECRET
  if (!secret) {
    // No secret configured — allow through (backend still enforces)
    return NextResponse.next()
  }

  try {
    await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { issuer: "fschat" }
    )
  } catch {
    return rejectAuth(request, pathname)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|app/_next|favicon.ico).*)"],
}
