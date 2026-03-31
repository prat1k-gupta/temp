"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { login, isAuthenticated } from "@/lib/auth"

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  useEffect(() => {
    if (isAuthenticated()) {
      router.push("/flows")
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required")
      return
    }
    setIsLoading(true)
    try {
      await login(email, password)
      const redirect = searchParams.get("redirect") || "/flows"
      router.push(redirect)
    } catch (error: any) {
      toast.error(error.message || "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <svg
            viewBox="0 0 127 128"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-16 h-16 mx-auto mb-4"
          >
            <g>
              <path
                d="M94.8052 62.1819V102.384C94.7538 104.184 94.7565 105.342 94.7565 105.342H68.3398V62.1819M94.8052 62.1819H68.3398M94.8052 62.1819H98.7703V51.4453L68.3398 51.4453V62.1819"
                stroke="#052762"
                strokeWidth="7"
                strokeMiterlimit="16"
                strokeLinecap="round"
              />
              <path
                d="M32.6543 62.1819V102.384C32.7057 104.184 32.703 105.342 32.703 105.342H57.2754V62.1819M32.6543 62.1819H57.2754M32.6543 62.1819H28.6892V51.4453L57.2754 51.4453V62.1819"
                stroke="#052762"
                strokeWidth="7"
                strokeMiterlimit="16"
                strokeLinecap="round"
              />
              <path
                d="M28.6895 41.6827C33.2272 41.6827 51.7948 41.6827 56.2307 41.6827L54.6309 39.8631C49.9526 34.0405 40.9363 28.2184 41.3726 18.3922C41.5859 13.5891 48.4992 8.05709 55.553 15.0442C61.1961 20.6339 62.1221 30.9108 61.8797 35.3505C64.1825 28.8971 70.737 17.0821 78.5326 21.449C88.2771 26.9077 76.3772 37.1701 73.9775 38.1891C72.0577 39.2371 70.1728 40.7122 69.0093 41.3187H98.7717"
                stroke="#052762"
                strokeWidth="7"
                strokeLinecap="square"
                strokeLinejoin="round"
              />
            </g>
          </svg>
          <CardTitle className="text-2xl font-bold text-[#052762]">
            Freestand Flow Builder
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your account
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#052762] hover:bg-[#0A49B7] text-white cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
          <p className="text-sm text-center text-muted-foreground mt-4">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-[#052762] font-medium hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
