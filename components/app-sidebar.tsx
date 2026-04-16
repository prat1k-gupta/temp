"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Workflow,
  Layers,
  FileText,
  MessageSquare,
  Megaphone,
  Settings,
  Phone,
  Users,
  Bot,
  Key,
  Shield,
  LogOut,
  User,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { useTheme } from "next-themes"
import { LogoClosed, LogoFull } from "@/components/freestand-logo"
import { logout } from "@/lib/auth"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/auth-context"
import type { Feature } from "@/lib/permissions"
import { contactKeys } from "@/hooks/queries/query-keys"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const NAV_ITEMS: { label: string; icon: React.ElementType; path: string; feature: Feature }[] = [
  { label: "Flows", icon: Workflow, path: "/flows", feature: "flows" },
  { label: "Flow Templates", icon: Layers, path: "/flow-templates", feature: "flows" },
  { label: "WhatsApp Templates", icon: FileText, path: "/templates", feature: "templates" },
  { label: "Chat", icon: MessageSquare, path: "/chat", feature: "chat" },
  { label: "Campaigns", icon: Megaphone, path: "/campaigns", feature: "campaigns" },
]

export const SETTINGS_CHILDREN: { label: string; icon: React.ElementType; path: string; feature: Feature }[] = [
  { label: "Accounts", icon: Phone, path: "/settings/accounts", feature: "accounts" },
  { label: "Users", icon: Users, path: "/settings/users", feature: "users" },
  { label: "Teams", icon: Users, path: "/settings/teams", feature: "teams" },
  { label: "Chatbot", icon: Bot, path: "/settings/chatbot", feature: "chatbot-settings" },
  { label: "API Keys", icon: Key, path: "/settings/api-keys", feature: "api-keys" },
  { label: "Roles", icon: Shield, path: "/settings/roles", feature: "users" },
]

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function AppSidebar() {
  const pathname = usePathname()
  const { state } = useSidebar()
  const { theme, setTheme } = useTheme()
  const { user, can } = useAuth()
  const queryClient = useQueryClient()
  const isCollapsed = state === "collapsed"
  const contactsData = queryClient.getQueryData<any>(contactKeys.lists())
  const totalUnread = contactsData?.pages
    ?.flatMap((p: any) => p.contacts)
    ?.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0) ?? 0
  const isSettingsActive = pathname.startsWith("/settings")
  const visibleNav = NAV_ITEMS.filter((item) => can(item.feature))
  const visibleSettings = SETTINGS_CHILDREN.filter((item) => can(item.feature))
  const hasAnySettings = visibleSettings.length > 0

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="!p-0 !gap-0 h-[65px] flex items-center justify-center border-b border-sidebar-border">
        <Link href="/flows" className="flex items-center justify-center">
          {isCollapsed ? (
            <LogoClosed className="h-8 w-8 text-white" />
          ) : (
            <LogoFull className="h-7 text-white" />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleNav.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.path}
                    tooltip={item.label}
                    size="default"
                    className="h-9 text-[13px]"
                  >
                    <Link href={item.path}>
                      <item.icon className="!w-[18px] !h-[18px]" />
                      <span>{item.label}</span>
                      {item.label === "Chat" && totalUnread > 0 && (
                        <span className="bg-primary text-primary-foreground text-[10px] font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                          {totalUnread > 99 ? "99+" : totalUnread}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Settings with collapsible submenu — hidden if no settings access */}
              {hasAnySettings && (
                <Collapsible defaultOpen={isSettingsActive} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={isSettingsActive}
                        tooltip="Settings"
                        className="h-9 text-[13px]"
                      >
                        <Settings className="!w-[18px] !h-[18px]" />
                        <span>Settings</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {visibleSettings.map((child) => (
                          <SidebarMenuSubItem key={child.path}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === child.path}
                            >
                              <Link href={child.path}>
                                <child.icon />
                                <span>{child.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-sidebar-accent cursor-pointer overflow-hidden group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs">
                      {getInitials(user?.full_name || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col text-left text-xs leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                    <span className="font-medium truncate">
                      {user?.full_name}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {user?.email}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-56"
              >
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  My Account
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                  Theme
                </DropdownMenuLabel>
                <div className="flex gap-0.5 px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 cursor-pointer ${theme === "light" ? "bg-muted" : ""}`}
                    onClick={() => setTheme("light")}
                  >
                    <Sun className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 cursor-pointer ${theme === "dark" ? "bg-muted" : ""}`}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 cursor-pointer ${theme === "system" ? "bg-muted" : ""}`}
                    onClick={() => setTheme("system")}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
