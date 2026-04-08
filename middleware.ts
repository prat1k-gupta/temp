import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/register", "/api/auth"]
const STATIC_PREFIXES = ["/_next", "/app/_next", "/favicon.ico"]

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
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
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
    // Invalid/expired JWT — clear cookie and redirect to login
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete("mf_access_token")
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|app/_next|favicon.ico).*)"],
}
