const ACCESS_TOKEN_KEY = "mf_access_token"
const REFRESH_TOKEN_KEY = "mf_refresh_token"
const USER_KEY = "mf_user"

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role: string
  organization_id: string
  organization_name?: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user: AuthUser
}

export async function register(
  email: string,
  password: string,
  fullName: string,
  organizationName: string
): Promise<LoginResponse> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      full_name: fullName,
      organization_name: organizationName,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || "Registration failed")
  }

  const data: LoginResponse = await response.json()
  setTokens(data.access_token, data.refresh_token)
  setUser(data.user)
  return data
}

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || "Login failed")
  }

  const data: LoginResponse = await response.json()
  setTokens(data.access_token, data.refresh_token)
  setUser(data.user)
  return data
}

export async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    throw new Error("No refresh token available")
  }

  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (!response.ok) {
    throw new Error("Token refresh failed")
  }

  const data = await response.json()
  setTokens(data.access_token, data.refresh_token || refreshToken)
  return data.access_token
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  const secure = typeof window !== "undefined" && window.location?.protocol === "https:" ? "; Secure" : ""
  document.cookie = `mf_access_token=${accessToken}; path=/; SameSite=Lax${secure}; max-age=${60 * 60 * 24 * 7}`
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  document.cookie =
    "mf_access_token=; path=/; SameSite=Lax; max-age=0"
}

export function logout(): void {
  clearAuth()
  window.location.href = "/login"
}
