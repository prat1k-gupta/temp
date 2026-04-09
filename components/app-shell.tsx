"use client"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AuthProvider } from "@/contexts/auth-context"
import { WebSocketProvider } from "@/hooks/use-websocket"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <WebSocketProvider>
          <AppSidebar />
          <SidebarInset>
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </SidebarInset>
        </WebSocketProvider>
      </SidebarProvider>
    </AuthProvider>
  )
}
