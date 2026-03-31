# Phase 2.7: App Shell, Sidebar, Profile & Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible sidebar, profile page, and 5 settings pages to MagicFlow so users don't need the fs-chat Vue frontend for account/team management.

**Architecture:** Next.js route group `(dashboard)` wraps all non-editor pages with an `AppShell` component. The shell uses shadcn's already-installed `SidebarProvider` + custom `AppSidebar`. All logic lives in pure React components for Vite portability — the route group layout is a 3-line wrapper. Settings pages call fs-whatsapp API directly via `apiClient` with React Query hooks.

**Tech Stack:** React 18, Next.js (CSR only), shadcn/ui Sidebar + Form components, TanStack React Query, react-hook-form + zod, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-31-app-shell-settings-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `app/(dashboard)/layout.tsx` | Next.js glue — imports AppShell, wraps children |
| `components/app-shell.tsx` | SidebarProvider + AppSidebar + SidebarInset content area |
| `components/app-sidebar.tsx` | Navigation items, collapsible Settings submenu, user footer popover |
| `components/freestand-logo.tsx` | Extracted LogoClosed + LogoFull SVGs (currently duplicated in flows + templates pages) |
| `app/(dashboard)/settings/page.tsx` | Redirect to /settings/accounts |
| `app/(dashboard)/settings/accounts/page.tsx` | WhatsApp Business account management |
| `app/(dashboard)/settings/users/page.tsx` | User/team member management |
| `app/(dashboard)/settings/teams/page.tsx` | Team structure management |
| `app/(dashboard)/settings/chatbot/page.tsx` | Global variables + cancel keywords |
| `app/(dashboard)/settings/api-keys/page.tsx` | API key management |
| `app/(dashboard)/profile/page.tsx` | User profile + change password |
| `hooks/queries/use-users.ts` | React Query hooks for user CRUD |
| `hooks/queries/use-teams.ts` | React Query hooks for team CRUD |
| `hooks/queries/use-api-keys.ts` | React Query hooks for API key CRUD |
| `hooks/queries/use-chatbot-settings.ts` | React Query hooks for chatbot settings |
| `hooks/queries/use-profile.ts` | React Query hooks for profile + password |

### Moved Files (same content, new path)

| From | To |
|------|-----|
| `app/flows/page.tsx` | `app/(dashboard)/flows/page.tsx` |
| `app/templates/page.tsx` | `app/(dashboard)/templates/page.tsx` |
| `app/flow-templates/page.tsx` | `app/(dashboard)/flow-templates/page.tsx` |

### Modified Files

| File | Change |
|------|--------|
| `app/(dashboard)/flows/page.tsx` | Remove inline header (logo, nav buttons, ThemeToggle, logout). Keep search/filters/cards/table content. |
| `app/(dashboard)/templates/page.tsx` | Remove inline header (logo, ArrowLeft, ThemeToggle). Keep filter bar, template cards, builder. |
| `app/(dashboard)/flow-templates/page.tsx` | Remove inline header (ArrowLeft, ThemeToggle). Keep template cards, create modal. |
| `hooks/queries/query-keys.ts` | Add key factories for users, teams, apiKeys, chatbotSettings, profile |
| `hooks/queries/index.ts` | Re-export new hooks |
| `hooks/queries/use-accounts.ts` | Add mutation hooks (create, update, delete, test connection) |

---

## Task 1: Extract Freestand Logo Component

The LogoClosed SVG is duplicated in `flows/page.tsx`, `templates/page.tsx`. Extract into a shared component.

**Files:**
- Create: `components/freestand-logo.tsx`

- [ ] **Step 1: Create the shared logo component**

```tsx
// components/freestand-logo.tsx
"use client"

export function LogoClosed({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127 128" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g>
        <path
          d="M94.8052 62.1819V102.384C94.7538 104.184 94.7565 105.342 94.7565 105.342H68.3398V62.1819M94.8052 62.1819H68.3398M94.8052 62.1819H98.7703V51.4453L68.3398 51.4453V62.1819"
          stroke="currentColor"
          strokeWidth="7"
          strokeMiterlimit="16"
          strokeLinecap="round"
        />
        <path
          d="M32.6543 62.1819V102.384C32.7057 104.184 32.703 105.342 32.703 105.342H57.2754V62.1819M32.6543 62.1819H57.2754M32.6543 62.1819H28.6892V51.4453L57.2754 51.4453V62.1819"
          stroke="currentColor"
          strokeWidth="7"
          strokeMiterlimit="16"
          strokeLinecap="round"
        />
        <path
          d="M28.6895 41.6827C33.2272 41.6827 51.7948 41.6827 56.2307 41.6827L54.6309 39.8631C49.9526 34.0405 40.9363 28.2184 41.3726 18.3922C41.5859 13.5891 48.4992 8.05709 55.553 15.0442C61.1961 20.6339 62.1221 30.9108 61.8797 35.3505C64.1825 28.8971 70.737 17.0821 78.5326 21.449C88.2771 26.9077 76.3772 37.1701 73.9775 38.1891C72.0577 39.2371 70.1728 40.7122 69.0093 41.3187H98.7717"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="square"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

export function LogoFull({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 555 103" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g>
        <path d="M104.485 43.6502L110.811 36.9628V65.0225L106.473 61.4981H133.719V72.3424H106.473L110.811 68.5469V99.4531H96.8035V32.8058H137.741V43.6502H104.485ZM170.052 32.8058C177.071 32.8058 182.252 34.4927 185.596 37.8665C188.939 41.2403 190.611 45.9094 190.611 51.8737C190.611 55.8199 190.009 59.1334 188.804 61.8144C187.599 64.4953 185.927 66.6491 183.788 68.2758C181.68 69.8723 179.24 71.017 176.468 71.7098C173.697 72.4026 170.73 72.749 167.567 72.749H152.656L156.677 68.4113V99.4531H142.941V32.8058H170.052ZM167.702 62.221C169.359 62.221 170.82 61.8595 172.085 61.1366C173.381 60.3835 174.375 59.284 175.067 57.8381C175.79 56.3621 176.152 54.5547 176.152 52.416C176.152 49.5543 175.339 47.3252 173.712 45.7286C172.085 44.102 169.736 43.2887 166.663 43.2887H152.972L156.677 38.9509V66.378L153.153 62.221H167.702ZM164.946 68.095H178.004L190.25 99.4531H175.881L164.946 68.095ZM203.558 43.6502L209.884 36.9628V64.5706L206.721 60.5944H231.301V71.4387H206.721L209.884 67.4624V95.2961L203.558 88.6088H236.317V99.4531H195.786V32.8058H236.317V43.6502H203.558ZM250.578 43.6502L256.904 36.9628V64.5706L253.741 60.5944H278.321V71.4387H253.741L256.904 67.4624V95.2961L250.578 88.6088H283.337V99.4531H242.806V32.8058H283.337V43.6502H250.578ZM312.419 100.538C307.599 100.538 303.352 99.7694 299.677 98.2331C296.032 96.6969 293.17 94.4075 291.092 91.3651C289.043 88.2925 288.019 84.482 288.019 79.9334C288.019 79.4514 288.019 79.0146 288.019 78.623C288.019 78.2013 288.019 77.7495 288.019 77.2675H302.071C302.071 77.7193 302.071 78.126 302.071 78.4875C302.071 78.8188 302.071 79.2104 302.071 79.6623C302.071 82.7649 302.945 85.1447 304.692 86.8014C306.439 88.4582 309.03 89.2866 312.464 89.2866C315.928 89.2866 318.594 88.7444 320.462 87.6599C322.329 86.5454 323.263 84.7229 323.263 82.1926C323.263 80.4153 322.555 78.8489 321.139 77.4934C319.754 76.1379 317.856 74.933 315.446 73.8786C313.066 72.7942 310.34 71.7851 307.268 70.8513C303.924 69.797 300.821 68.4113 297.96 66.6943C295.098 64.9773 292.794 62.7934 291.046 60.1425C289.329 57.4917 288.471 54.2233 288.471 50.3375C288.471 46.4215 289.51 43.0929 291.589 40.3517C293.667 37.5804 296.499 35.4717 300.083 34.0258C303.668 32.5498 307.72 31.8118 312.238 31.8118C316.967 31.8118 321.139 32.5498 324.754 34.0258C328.399 35.4717 331.246 37.6557 333.294 40.5776C335.373 43.4694 336.412 47.0842 336.412 51.4219C336.412 51.9039 336.412 52.3557 336.412 52.7774C336.412 53.169 336.412 53.6209 336.412 54.133H322.405C322.405 53.8016 322.405 53.4552 322.405 53.0937C322.405 52.7323 322.405 52.3858 322.405 52.0545C322.405 49.1325 321.591 46.8884 319.965 45.322C318.368 43.7556 315.853 42.9724 312.419 42.9724C309.105 42.9724 306.53 43.5748 304.692 44.7798C302.885 45.9847 301.981 47.8373 301.981 50.3375C301.981 52.1449 302.629 53.6811 303.924 54.9463C305.249 56.2115 307.057 57.3411 309.346 58.3351C311.636 59.3292 314.241 60.3233 317.163 61.3173C321.139 62.703 324.604 64.2393 327.556 65.9262C330.538 67.5829 332.842 69.6765 334.469 72.2068C336.095 74.707 336.909 77.9001 336.909 81.7859C336.909 85.7622 335.885 89.151 333.836 91.9525C331.788 94.7539 328.911 96.8927 325.206 98.3687C321.531 99.8146 317.269 100.538 312.419 100.538ZM386.752 43.6502H364.747L370.35 36.9628V99.4531H356.388V36.9628L362.171 43.6502H340.031V32.8058H386.752V43.6502ZM381.323 99.4531L397.951 32.7155H420.137L436.674 99.4531H422.306L409.021 41.2554H409.112L395.692 99.4531H381.323ZM393.252 84V73.0653H424.881V84H393.252ZM453.622 99.4531H439.931V32.8058H461.71L484.031 94.3925L481.682 94.9798V32.8058H495.327V99.4531H473.413L451.092 38.0473L453.622 37.4599V99.4531ZM501.866 99.4531V32.8058H523.419C527.877 32.8058 531.929 33.6192 535.573 35.2458C539.248 36.8423 542.396 39.1166 545.017 42.0687C547.668 44.9906 549.701 48.4849 551.117 52.5515C552.533 56.6181 553.241 61.1065 553.241 66.0165C553.241 70.9266 552.533 75.43 551.117 79.5267C549.701 83.6235 547.668 87.1629 545.017 90.1451C542.396 93.0972 539.248 95.3865 535.573 97.0132C531.929 98.6398 527.877 99.4531 523.419 99.4531H501.866ZM515.963 95.2961L509.638 88.6088H521.611C524.865 88.6088 527.802 87.7051 530.422 85.8977C533.073 84.0602 535.167 81.4546 536.703 78.0808C538.239 74.6769 539.007 70.6555 539.007 66.0165C539.007 61.3475 538.239 57.3561 536.703 54.0426C535.167 50.6989 533.073 48.1385 530.422 46.3612C527.802 44.5538 524.865 43.6502 521.611 43.6502H509.638L515.963 36.9628V95.2961Z" fill="currentColor" />
        <path d="M69.8052 54.1819V94.3842C69.7538 96.1843 69.7565 97.3416 69.7565 97.3416H43.3398V54.1819M69.8052 54.1819H43.3398M69.8052 54.1819H73.7703V43.4453L43.3398 43.4453V54.1819" stroke="currentColor" strokeWidth="7" strokeMiterlimit="16" strokeLinecap="round" />
        <path d="M7.65428 54.1819V94.3842C7.70567 96.1843 7.70296 97.3416 7.70296 97.3416H32.2754V54.1819M7.65428 54.1819H32.2754M7.65428 54.1819H3.68922V43.4453L32.2754 43.4453V54.1819" stroke="currentColor" strokeWidth="7" strokeMiterlimit="16" strokeLinecap="round" />
        <path d="M3.68945 33.6827C8.22718 33.6827 26.7948 33.6827 31.2307 33.6827L29.6309 31.8631C24.9526 26.0405 15.9363 20.2184 16.3726 10.3922C16.5859 5.58911 23.4992 0.0570863 30.553 7.04422C36.1961 12.6339 37.1221 22.9108 36.8797 27.3505C39.1825 20.8971 45.737 9.08208 53.5326 13.449C63.2771 18.9077 51.3772 29.1701 48.9775 30.1891C47.0577 31.2371 45.1728 32.7122 44.0093 33.3187H73.7717" stroke="currentColor" strokeWidth="7" strokeLinecap="square" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
```

Note: Using `currentColor` instead of hardcoded `#052762` / `white` so the logo inherits text color and works in both themes.

- [ ] **Step 2: Commit**

```bash
git add components/freestand-logo.tsx
git commit -m "extract: shared Freestand logo component with currentColor"
```

---

## Task 2: Create AppSidebar Component

The main navigation sidebar. Pure React — no Next.js dependencies except `usePathname` (which React Router also has as `useLocation`).

**Files:**
- Create: `components/app-sidebar.tsx`

**Dependencies:** Task 1 (LogoClosed, LogoFull)

- [ ] **Step 1: Create the sidebar component**

```tsx
// components/app-sidebar.tsx
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
import { LogoClosed, LogoFull } from "@/components/freestand-logo"
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
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit 2>&1 | head -20`

Check for: no errors related to `app-sidebar.tsx`. Ignore pre-existing errors.

- [ ] **Step 3: Commit**

```bash
git add components/app-sidebar.tsx
git commit -m "feat: add AppSidebar with nav items, settings submenu, user popover"
```

---

## Task 3: Create AppShell and Dashboard Layout

Wire up the sidebar with the content area. Create the route group layout.

**Files:**
- Create: `components/app-shell.tsx`
- Create: `app/(dashboard)/layout.tsx`

**Dependencies:** Task 2 (AppSidebar)

- [ ] **Step 1: Create AppShell component**

```tsx
// components/app-shell.tsx
"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
```

- [ ] **Step 2: Create the dashboard layout**

```tsx
// app/(dashboard)/layout.tsx
import { AppShell } from "@/components/app-shell"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
```

- [ ] **Step 3: Move existing pages into the route group**

Move files — the `(dashboard)` group doesn't change URLs, so `/flows` stays `/flows`:

```bash
mkdir -p app/\(dashboard\)/flows app/\(dashboard\)/templates app/\(dashboard\)/flow-templates
mv app/flows/page.tsx app/\(dashboard\)/flows/page.tsx
mv app/templates/page.tsx app/\(dashboard\)/templates/page.tsx
mv app/flow-templates/page.tsx app/\(dashboard\)/flow-templates/page.tsx
rmdir app/flows app/templates app/flow-templates
```

- [ ] **Step 4: Verify the app loads**

Run: `docker logs magic-flow-app-1 2>&1 | tail -10`

Open `http://localhost:3002/flows` — should show the sidebar alongside the existing flows page (with its old header still visible — that's fine, cleaned up in Task 4).

- [ ] **Step 5: Commit**

```bash
git add components/app-shell.tsx app/\(dashboard\)
git commit -m "feat: add AppShell with SidebarProvider and dashboard route group"
```

---

## Task 4: Clean Up Existing Page Headers

Remove inline headers from flows, templates, and flow-templates pages. The sidebar now handles navigation, theme, and logout.

**Files:**
- Modify: `app/(dashboard)/flows/page.tsx`
- Modify: `app/(dashboard)/templates/page.tsx`
- Modify: `app/(dashboard)/flow-templates/page.tsx`

**Dependencies:** Task 3 (pages moved into route group)

- [ ] **Step 1: Clean up flows page**

In `app/(dashboard)/flows/page.tsx`:

1. Remove the `LogoClosed` component definition (entire SVG function, ~25 lines)
2. Remove imports: `LogOut`, `Layers`, `ThemeToggle`, `logout`, `Link` (if only used for nav)
3. Remove the header section — the `<div className="border-b ...">` through the closing `</div>` that contains logo, nav buttons, ThemeToggle, logout
4. The remaining structure should be: outer container → content area (search bar, filters, cards/table)
5. Keep the "New Flow" button in the content area (move it next to the search/filter bar)

The page should now render just its content — the sidebar handles all chrome.

- [ ] **Step 2: Clean up templates page**

In `app/(dashboard)/templates/page.tsx`:

1. Remove the `LogoClosed` component definition
2. Remove imports: `ArrowLeft`, `ThemeToggle`, `Link` (if only for nav)
3. Remove the header section (logo, "Flows" back button, ThemeToggle)
4. Keep: Sync button, Create Template button — move them into the content area's filter bar
5. The page title ("Templates") can be a simple `<h1>` at the top of the content area or removed entirely (sidebar shows active page)

- [ ] **Step 3: Clean up flow-templates page**

In `app/(dashboard)/flow-templates/page.tsx`:

1. Remove imports: `ArrowLeft`, `ThemeToggle`
2. Remove the header section (back button, ThemeToggle)
3. Keep: "New Template" button — in content area

- [ ] **Step 4: Verify all three pages load correctly**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit 2>&1 | head -20`

Open each page and verify:
- `/flows` — sidebar visible, no duplicate header, search/filter/cards work
- `/templates` — sidebar visible, sync/create buttons accessible, template cards work
- `/flow-templates` — sidebar visible, create button accessible, template cards work

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/flows/page.tsx app/\(dashboard\)/templates/page.tsx app/\(dashboard\)/flow-templates/page.tsx
git commit -m "refactor: remove inline headers from dashboard pages — sidebar handles navigation"
```

---

## Task 5: Add Query Keys and Profile Hooks

Add query key factories and profile/password hooks. These are needed before the profile page.

**Files:**
- Modify: `hooks/queries/query-keys.ts`
- Create: `hooks/queries/use-profile.ts`
- Modify: `hooks/queries/index.ts`

- [ ] **Step 1: Add query key factories**

Add to `hooks/queries/query-keys.ts`:

```ts
export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
} as const

export const teamKeys = {
  all: ["teams"] as const,
  list: () => [...teamKeys.all, "list"] as const,
} as const

export const apiKeyKeys = {
  all: ["apiKeys"] as const,
  list: () => [...apiKeyKeys.all, "list"] as const,
} as const

export const chatbotSettingsKeys = {
  all: ["chatbotSettings"] as const,
  detail: () => [...chatbotSettingsKeys.all, "detail"] as const,
} as const

export const profileKeys = {
  all: ["profile"] as const,
  me: () => [...profileKeys.all, "me"] as const,
} as const

export const orgSettingsKeys = {
  all: ["orgSettings"] as const,
  detail: () => [...orgSettingsKeys.all, "detail"] as const,
} as const
```

- [ ] **Step 2: Create profile hooks**

```tsx
// hooks/queries/use-profile.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { profileKeys } from "./query-keys"
import { setUser, getUser } from "@/lib/auth"

interface Profile {
  id: string
  email: string
  full_name: string
  role: string
  organization_id: string
  organization_name?: string
}

export function useProfile() {
  return useQuery<Profile>({
    queryKey: profileKeys.me(),
    queryFn: () => apiClient.get<Profile>("/api/me"),
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { full_name?: string; email?: string }) =>
      apiClient.put<Profile>("/api/me", data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.me() })
      // Keep localStorage user in sync
      const current = getUser()
      if (current && updated) {
        setUser({ ...current, ...updated })
      }
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { current_password: string; new_password: string }) =>
      apiClient.put("/api/me/password", data),
  })
}
```

- [ ] **Step 3: Update index.ts**

Add to `hooks/queries/index.ts`:

```ts
export { userKeys, teamKeys, apiKeyKeys, chatbotSettingsKeys, profileKeys, orgSettingsKeys } from "./query-keys"
export { useProfile, useUpdateProfile, useChangePassword } from "./use-profile"
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add hooks/queries/query-keys.ts hooks/queries/use-profile.ts hooks/queries/index.ts
git commit -m "feat: add query keys and profile/password React Query hooks"
```

---

## Task 6: Profile Page

**Files:**
- Create: `app/(dashboard)/profile/page.tsx`

**Dependencies:** Task 5 (profile hooks)

- [ ] **Step 1: Create the profile page**

```tsx
// app/(dashboard)/profile/page.tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Loader2, Eye, EyeOff } from "lucide-react"
import { useProfile, useUpdateProfile, useChangePassword } from "@/hooks/queries"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

const profileSchema = z.object({
  full_name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
})

const passwordSchema = z.object({
  current_password: z.string().min(1, "Current password is required"),
  new_password: z.string().min(6, "Password must be at least 6 characters"),
  confirm_password: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords don't match",
  path: ["confirm_password"],
})

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: {
      full_name: profile?.full_name || "",
      email: profile?.email || "",
    },
  })

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  })

  const onProfileSubmit = (data: z.infer<typeof profileSchema>) => {
    updateProfile.mutate(data, {
      onSuccess: () => toast.success("Profile updated"),
      onError: (err) => toast.error(err.message || "Failed to update profile"),
    })
  }

  const onPasswordSubmit = (data: z.infer<typeof passwordSchema>) => {
    changePassword.mutate(
      { current_password: data.current_password, new_password: data.new_password },
      {
        onSuccess: () => {
          toast.success("Password changed")
          passwordForm.reset()
        },
        onError: (err) => toast.error(err.message || "Failed to change password"),
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Update your name and email</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <FormField
                control={profileForm.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Label className="text-muted-foreground">Role</Label>
                <p className="text-sm capitalize">{profile?.role}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Organization</Label>
                <p className="text-sm">{profile?.organization_name || "—"}</p>
              </div>
              <Button type="submit" disabled={updateProfile.isPending} className="cursor-pointer">
                {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Separator />

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <FormField
                control={passwordForm.control}
                name="current_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showCurrentPassword ? "text" : "password"}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 cursor-pointer"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="new_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showNewPassword ? "text" : "password"}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 cursor-pointer"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirm_password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={changePassword.isPending} className="cursor-pointer">
                {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page loads**

Open `http://localhost:3002/profile`. Should show profile form with current user data and password change form.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/profile/page.tsx
git commit -m "feat: add profile page with edit name/email and change password"
```

---

## Task 7: Settings Redirect + Account Mutations Hook

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`
- Modify: `hooks/queries/use-accounts.ts`
- Modify: `hooks/queries/index.ts`

- [ ] **Step 1: Create settings redirect page**

```tsx
// app/(dashboard)/settings/page.tsx
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SettingsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/settings/accounts")
  }, [router])
  return null
}
```

- [ ] **Step 2: Add account mutation hooks**

Add to `hooks/queries/use-accounts.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"

export const accountKeys = {
  all: ["accounts"] as const,
  list: () => [...accountKeys.all, "list"] as const,
} as const

export interface Account {
  id: string
  name: string
  phone_number: string
  phone_number_id: string
  business_id: string
  waba_id: string
  access_token: string
  is_active: boolean
  webhook_verified: boolean
  created_at: string
  updated_at: string
}

export function useAccounts() {
  return useQuery<Account[]>({
    queryKey: accountKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/accounts")
      return data?.accounts || data || []
    },
  })
}

export function useCreateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name: string
      phone_number: string
      phone_number_id: string
      business_id: string
      waba_id: string
      access_token: string
    }) => apiClient.post("/api/accounts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
    },
  })
}

export function useUpdateAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<{
      name: string
      phone_number: string
      phone_number_id: string
      business_id: string
      waba_id: string
      access_token: string
      is_active: boolean
    }>) => apiClient.put(`/api/accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
    },
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
    },
  })
}
```

- [ ] **Step 3: Update index.ts**

Add new exports:

```ts
export { accountKeys, useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount, type Account } from "./use-accounts"
```

(Replace the existing `useAccounts` export line.)

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/settings/page.tsx hooks/queries/use-accounts.ts hooks/queries/index.ts
git commit -m "feat: add settings redirect and account mutation hooks"
```

---

## Task 8: Accounts Settings Page

**Files:**
- Create: `app/(dashboard)/settings/accounts/page.tsx`

**Dependencies:** Task 7 (account hooks)

- [ ] **Step 1: Create the accounts page**

Reference `fs-whatsapp/frontend/src/views/settings/AccountsView.vue` for field structure.

```tsx
// app/(dashboard)/settings/accounts/page.tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Trash2, Pencil, Loader2, Phone } from "lucide-react"
import {
  useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount,
  type Account,
} from "@/hooks/queries"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form"

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().min(1, "Phone number is required"),
  phone_number_id: z.string().min(1, "Phone number ID is required"),
  business_id: z.string().min(1, "Business ID is required"),
  waba_id: z.string().min(1, "WABA ID is required"),
  access_token: z.string().min(1, "Access token is required"),
})

type AccountFormValues = z.infer<typeof accountSchema>

export default function AccountsSettingsPage() {
  const { data: accounts = [], isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()
  const [showDialog, setShowDialog] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null)

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      phone_number: "",
      phone_number_id: "",
      business_id: "",
      waba_id: "",
      access_token: "",
    },
  })

  const openCreate = () => {
    setEditingAccount(null)
    form.reset({
      name: "",
      phone_number: "",
      phone_number_id: "",
      business_id: "",
      waba_id: "",
      access_token: "",
    })
    setShowDialog(true)
  }

  const openEdit = (account: Account) => {
    setEditingAccount(account)
    form.reset({
      name: account.name,
      phone_number: account.phone_number,
      phone_number_id: account.phone_number_id,
      business_id: account.business_id,
      waba_id: account.waba_id,
      access_token: account.access_token,
    })
    setShowDialog(true)
  }

  const onSubmit = (data: AccountFormValues) => {
    if (editingAccount) {
      updateAccount.mutate(
        { id: editingAccount.id, ...data },
        {
          onSuccess: () => {
            toast.success("Account updated")
            setShowDialog(false)
          },
          onError: (err) => toast.error(err.message || "Failed to update account"),
        }
      )
    } else {
      createAccount.mutate(data, {
        onSuccess: () => {
          toast.success("Account created")
          setShowDialog(false)
        },
        onError: (err) => toast.error(err.message || "Failed to create account"),
      })
    }
  }

  const handleDelete = (id: string) => {
    deleteAccount.mutate(id, {
      onSuccess: () => toast.success("Account deleted"),
      onError: (err) => toast.error(err.message || "Failed to delete account"),
    })
    setAccountToDelete(null)
  }

  const isSaving = createAccount.isPending || updateAccount.isPending

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your WhatsApp Business accounts</p>
        </div>
        <Button onClick={openCreate} className="gap-2 cursor-pointer">
          <Plus className="w-4 h-4" />
          Add Account
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Phone className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No WhatsApp accounts connected</p>
            <Button onClick={openCreate} className="cursor-pointer">Add Your First Account</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {accounts.map((account: Account) => (
            <Card key={account.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{account.name}</CardTitle>
                  <CardDescription>{account.phone_number}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={account.is_active ? "default" : "secondary"}>
                    {account.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={() => openEdit(account)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    onClick={() => setAccountToDelete(account.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">WABA ID:</span>{" "}
                    <span className="font-mono">{account.waba_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Business ID:</span>{" "}
                    <span className="font-mono">{account.business_id}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add Account"}</DialogTitle>
            <DialogDescription>
              {editingAccount ? "Update your WhatsApp Business account details." : "Connect a new WhatsApp Business account."}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Account Name</FormLabel>
                  <FormControl><Input placeholder="My Business" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone_number" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl><Input placeholder="+1234567890" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone_number_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number ID</FormLabel>
                  <FormControl><Input placeholder="From Meta Business Suite" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="business_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Business ID</FormLabel>
                  <FormControl><Input placeholder="Meta Business ID" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="waba_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>WABA ID</FormLabel>
                  <FormControl><Input placeholder="WhatsApp Business Account ID" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="access_token" render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Token</FormLabel>
                  <FormControl><Input placeholder="Permanent access token" type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={isSaving} className="cursor-pointer">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingAccount ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!accountToDelete} onOpenChange={() => setAccountToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this WhatsApp account. Flows using this account will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
              onClick={() => accountToDelete && handleDelete(accountToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page loads**

Open `http://localhost:3002/settings/accounts`. Should show accounts list (or empty state), add button, edit/delete per account.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/settings/accounts/page.tsx
git commit -m "feat: add WhatsApp accounts settings page"
```

---

## Task 9: Users Settings Page + Hooks

**Files:**
- Create: `hooks/queries/use-users.ts`
- Create: `app/(dashboard)/settings/users/page.tsx`
- Modify: `hooks/queries/index.ts`

**Dependencies:** Task 5 (query keys)

- [ ] **Step 1: Create user hooks**

```tsx
// hooks/queries/use-users.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { userKeys } from "./query-keys"

export interface OrgUser {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  created_at: string
}

export function useUsers() {
  return useQuery<OrgUser[]>({
    queryKey: userKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/users")
      return data?.users || data || []
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; password: string; full_name: string; role?: string }) =>
      apiClient.post("/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.list() })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; full_name?: string; email?: string; role?: string; is_active?: boolean }) =>
      apiClient.put(`/api/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.list() })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.list() })
    },
  })
}
```

- [ ] **Step 2: Create the users settings page**

Build a table-based user management page with invite dialog, edit role, toggle active, delete. Reference `fs-whatsapp/frontend/src/views/settings/UsersView.vue`. Pattern matches accounts page (Card list, Dialog for create/edit, AlertDialog for delete). Role field uses `<Select>` with admin/manager/agent options. Include `is_active` toggle via `<Switch>`.

Full page code follows the same structure as the accounts page in Task 8 — Card per user with name/email/role/status badge, plus create Dialog with email+password+name+role fields, edit Dialog, delete AlertDialog. Use `useUsers`, `useCreateUser`, `useUpdateUser`, `useDeleteUser` hooks.

- [ ] **Step 3: Update index.ts**

```ts
export { useUsers, useCreateUser, useUpdateUser, useDeleteUser, type OrgUser } from "./use-users"
```

- [ ] **Step 4: Verify and commit**

```bash
git add hooks/queries/use-users.ts app/\(dashboard\)/settings/users/page.tsx hooks/queries/index.ts
git commit -m "feat: add users settings page with invite, edit role, deactivate"
```

---

## Task 10: Teams Settings Page + Hooks

**Files:**
- Create: `hooks/queries/use-teams.ts`
- Create: `app/(dashboard)/settings/teams/page.tsx`
- Modify: `hooks/queries/index.ts`

**Dependencies:** Task 5 (query keys)

- [ ] **Step 1: Create team hooks**

```tsx
// hooks/queries/use-teams.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { teamKeys } from "./query-keys"

export interface Team {
  id: string
  name: string
  description: string
  assignment_strategy: "round_robin" | "load_balanced" | "manual"
  is_active: boolean
  member_count: number
  created_at: string
}

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: teamKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/teams")
      return data?.teams || data || []
    },
  })
}

export function useCreateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; assignment_strategy?: string }) =>
      apiClient.post("/api/teams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list() })
    },
  })
}

export function useUpdateTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; assignment_strategy?: string; is_active?: boolean }) =>
      apiClient.put(`/api/teams/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list() })
    },
  })
}

export function useDeleteTeam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/teams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.list() })
    },
  })
}
```

- [ ] **Step 2: Create teams page**

Same pattern as accounts/users pages. Card per team (name, description, strategy badge, member count). Create/edit Dialog with name, description, assignment strategy select (round_robin/load_balanced/manual). Delete AlertDialog.

- [ ] **Step 3: Update index.ts and commit**

```bash
git add hooks/queries/use-teams.ts app/\(dashboard\)/settings/teams/page.tsx hooks/queries/index.ts
git commit -m "feat: add teams settings page with CRUD and assignment strategy"
```

---

## Task 11: Chatbot Settings Page + Hooks

**Files:**
- Create: `hooks/queries/use-chatbot-settings.ts`
- Create: `app/(dashboard)/settings/chatbot/page.tsx`
- Modify: `hooks/queries/index.ts`

**Dependencies:** Task 5 (query keys)

- [ ] **Step 1: Create chatbot settings hooks**

```tsx
// hooks/queries/use-chatbot-settings.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { chatbotSettingsKeys } from "./query-keys"

export interface ChatbotSettings {
  global_variables: Record<string, string>
  cancel_keywords: string[]
  inactivity_timeout: number
  welcome_message: string
}

export function useChatbotSettings() {
  return useQuery<ChatbotSettings>({
    queryKey: chatbotSettingsKeys.detail(),
    queryFn: () => apiClient.get<ChatbotSettings>("/api/chatbot/settings"),
  })
}

export function useUpdateChatbotSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ChatbotSettings>) =>
      apiClient.put("/api/chatbot/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatbotSettingsKeys.detail() })
    },
  })
}
```

- [ ] **Step 2: Create chatbot settings page**

Two sections:
1. **Global Variables** — editable key-value table. Add row button. Each row: key input + value input + delete button. Save button sends full `global_variables` object.
2. **Cancel Keywords** — list of keywords. Add input + button. Each keyword has delete button. Save sends full `cancel_keywords` array.

Use `useState` for local edits, save button calls `useUpdateChatbotSettings`.

- [ ] **Step 3: Update index.ts and commit**

```bash
git add hooks/queries/use-chatbot-settings.ts app/\(dashboard\)/settings/chatbot/page.tsx hooks/queries/index.ts
git commit -m "feat: add chatbot settings page with global variables and cancel keywords"
```

---

## Task 12: API Keys Settings Page + Hooks

**Files:**
- Create: `hooks/queries/use-api-keys.ts`
- Create: `app/(dashboard)/settings/api-keys/page.tsx`
- Modify: `hooks/queries/index.ts`

**Dependencies:** Task 5 (query keys)

- [ ] **Step 1: Create API keys hooks**

```tsx
// hooks/queries/use-api-keys.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import { apiKeyKeys } from "./query-keys"

export interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface CreateApiKeyResponse {
  id: string
  name: string
  key: string  // Full key — shown only once
}

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: apiKeyKeys.list(),
    queryFn: async () => {
      const data = await apiClient.get<any>("/api/api-keys")
      return data?.api_keys || data || []
    },
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; expires_at?: string }) =>
      apiClient.post<CreateApiKeyResponse>("/api/api-keys", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() })
    },
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/api-keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() })
    },
  })
}
```

- [ ] **Step 2: Create API keys page**

Table of keys (name, prefix, last used, created, expires). Create dialog (name input, optional expiry date). On create success, show full key in a "copy to clipboard" dialog — warn that it won't be shown again. Delete with AlertDialog confirmation.

- [ ] **Step 3: Update index.ts and commit**

```bash
git add hooks/queries/use-api-keys.ts app/\(dashboard\)/settings/api-keys/page.tsx hooks/queries/index.ts
git commit -m "feat: add API keys settings page with create, copy, revoke"
```

---

## Task 13: Final Verification + Cleanup

**Files:**
- Various (cleanup)

- [ ] **Step 1: TypeScript check**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`

Fix any errors.

- [ ] **Step 2: Verify all routes**

Open each route and verify it works:
- `/flows` — sidebar + flows list
- `/flow-templates` — sidebar + template cards
- `/templates` — sidebar + WhatsApp templates
- `/settings` — redirects to `/settings/accounts`
- `/settings/accounts` — account management
- `/settings/users` — user management
- `/settings/teams` — team management
- `/settings/chatbot` — global variables + keywords
- `/settings/api-keys` — API key management
- `/profile` — profile + password
- `/flow/new` — full-screen editor (no sidebar)
- `/flow/[id]` — full-screen editor (no sidebar)
- `/template/[id]` — full-screen editor (no sidebar)

- [ ] **Step 3: Verify sidebar behavior**

- Collapse/expand via toggle button
- Collapse/expand via `Cmd+B` / `Ctrl+B`
- Settings submenu expands/collapses
- Active page highlighted in sidebar
- User popover shows name, email, theme toggle, profile link, logout
- Logo links to /flows

- [ ] **Step 4: Check old routes are gone**

Verify that the old `app/flows/`, `app/templates/`, `app/flow-templates/` directories no longer exist (moved to route group).

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "fix: final cleanup for Phase 2.7 app shell"
```
