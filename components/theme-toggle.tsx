"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="ghost" size="sm" disabled className="cursor-pointer">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="hover:bg-primary hover:text-primary-foreground"
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  )
}
