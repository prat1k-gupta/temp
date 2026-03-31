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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Workflow,
  Layers,
  FileText,
  Settings,
  Phone,
  Users,
  Bot,
  Key,
  LogOut,
  User,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
} from "lucide-react"
import { useTheme } from "next-themes"
import { LogoClosed } from "@/components/freestand-logo"
import { getUser, logout } from "@/lib/auth"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const NAV_ITEMS = [
  { label: "Flows", icon: Workflow, path: "/flows" },
  { label: "Flow Templates", icon: Layers, path: "/flow-templates" },
  { label: "WhatsApp Templates", icon: FileText, path: "/templates" },
]

const SETTINGS_CHILDREN = [
  { label: "Accounts", icon: Phone, path: "/settings/accounts" },
  { label: "Users", icon: Users, path: "/settings/users" },
  { label: "Teams", icon: Users, path: "/settings/teams" },
  { label: "Chatbot", icon: Bot, path: "/settings/chatbot" },
  { label: "API Keys", icon: Key, path: "/settings/api-keys" },
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
  const user = getUser()
  const isCollapsed = state === "collapsed"
  const isSettingsActive = pathname.startsWith("/settings")

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/flows">
                {isCollapsed ? (
                  <LogoClosed className="h-6 w-6" />
                ) : (
                  <div className="flex items-center gap-2">
                    <LogoClosed className="h-8 w-8" />
                    <span className="text-sm font-semibold">Freestand</span>
                  </div>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.path}
                    tooltip={item.label}
                  >
                    <Link href={item.path}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              {/* Settings with collapsible submenu */}
              <Collapsible defaultOpen={isSettingsActive} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={isSettingsActive}
                      tooltip="Settings"
                    >
                      <Settings />
                      <span>Settings</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {SETTINGS_CHILDREN.map((child) => (
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="cursor-pointer"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">
                      {getInitials(user?.full_name || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col text-left text-xs leading-tight">
                    <span className="font-medium truncate">
                      {user?.full_name}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {user?.email}
                    </span>
                  </div>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-56 p-1.5"
              >
                <div className="text-xs font-medium px-2 py-1 text-muted-foreground">
                  My Account
                </div>
                <Separator className="my-1" />
                <Link href="/profile">
                  <Button
                    variant="ghost"
                    className="w-full justify-start px-2 py-1 h-auto text-sm font-normal cursor-pointer"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Button>
                </Link>
                <Separator className="my-1" />
                <div className="text-xs font-medium px-2 py-1 text-muted-foreground">
                  Theme
                </div>
                <div className="flex gap-0.5 px-1.5 py-1">
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
                <Separator className="my-1" />
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-1 h-auto text-sm font-normal cursor-pointer"
                  onClick={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </Button>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
