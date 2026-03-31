# Phase 2.7: App Shell, Sidebar, Profile & Settings

## Summary

MagicFlow needs a proper app shell before Phase 3. Currently the flows page has an inline header with navigation buttons and logout. There's no sidebar, no settings pages, and no profile page. Users must switch to the fs-chat Vue frontend for account management, team settings, and profile changes.

This phase adds a collapsible sidebar, profile page, and 5 settings pages — all calling existing fs-whatsapp API endpoints.

## Architecture

### Portability Constraint

All UI logic lives in pure React components. The only Next.js-specific file is `(dashboard)/layout.tsx` — a 3-line wrapper that imports `<AppShell>` and passes `{children}`. When migrating to Vite + React Router, this becomes a layout route and the components move unchanged.

### File Structure

```
app/
  (dashboard)/
    layout.tsx              ← Next.js glue: imports AppShell, wraps children
    flows/page.tsx          ← moved from app/flows/
    templates/page.tsx      ← moved from app/templates/
    flow-templates/page.tsx ← moved from app/flow-templates/
    settings/
      page.tsx              ← redirects to /settings/accounts
      accounts/page.tsx
      users/page.tsx
      teams/page.tsx
      chatbot/page.tsx
      api-keys/page.tsx
    profile/page.tsx
  flow/[id]/page.tsx        ← stays outside, full-screen editor
  template/[id]/page.tsx    ← stays outside, full-screen editor
  login/page.tsx            ← stays outside
  register/page.tsx         ← stays outside
  layout.tsx                ← root layout (unchanged)
  page.tsx                  ← redirect to /flows (unchanged)
```

### Components

**`components/app-shell.tsx`** — Pure React. Wraps `SidebarProvider` + `AppSidebar` + main content area. Uses the already-installed shadcn Sidebar component (`components/ui/sidebar.tsx`).

**`components/app-sidebar.tsx`** — Pure React. Navigation items, collapsible Settings submenu, user footer with popover.

## Sidebar Navigation

### Top-Level Items

| Label              | Icon      | Path             |
|--------------------|-----------|------------------|
| Flows              | Workflow  | /flows           |
| Flow Templates     | Layers    | /flow-templates  |
| WhatsApp Templates | FileText  | /templates       |
| Settings           | Settings  | /settings        |

### Settings Children (expandable submenu)

| Label           | Icon  | Path               |
|-----------------|-------|--------------------|
| Accounts        | Phone | /settings/accounts |
| Users           | Users | /settings/users    |
| Teams           | Users | /settings/teams    |
| Chatbot         | Bot   | /settings/chatbot  |
| API Keys        | Key   | /settings/api-keys |

### Sidebar Footer

User avatar (initials fallback) + name + email. Click opens popover with:
- Profile link
- Theme toggle (light/dark/system)
- Logout button

### Sidebar Behavior

- Collapsible via toggle button (icons-only mode when collapsed)
- Keyboard shortcut: `Cmd+B` / `Ctrl+B` (shadcn sidebar default)
- Mobile: sheet overlay (shadcn sidebar handles this)
- Collapse state persisted in cookie (`sidebar_state`)

## Settings Pages

All pages call fs-whatsapp API directly via `apiClient`. Each gets React Query hooks.

### Accounts (`/settings/accounts`)

WhatsApp Business account management. Reference: `fs-whatsapp/frontend/src/views/settings/AccountsView.vue`.

- List accounts with status badges (connected/disconnected)
- Add account (phone number, business ID, API token)
- Edit account settings
- Delete account with confirmation
- Test connection button
- API: `GET/POST/PUT/DELETE /api/accounts`

### Users (`/settings/users`)

Team member management. Reference: `fs-whatsapp/frontend/src/views/settings/UsersView.vue`.

- List users in a table (name, email, role, status)
- Invite new user (email, name, role selector)
- Edit user (name, role, active/inactive toggle)
- Delete user with confirmation
- Roles: admin, manager, agent
- API: `GET/POST/PUT/DELETE /api/users`

### Teams (`/settings/teams`)

Team structure. Reference: `fs-whatsapp/frontend/src/views/settings/TeamsView.vue`.

- List teams
- Create/edit team (name, description, member assignment)
- Delete team with confirmation
- API: `GET/POST/PUT/DELETE /api/teams`

### Chatbot Settings (`/settings/chatbot`)

Global chatbot configuration. Reference: `fs-whatsapp/frontend/src/views/settings/ChatbotSettingsView.vue`.

- Global variables editor (key-value pairs)
- Cancel keywords list (words that reset a flow session)
- API: `GET/PUT /api/chatbot/settings`

### API Keys (`/settings/api-keys`)

API key management. Reference: `fs-whatsapp/frontend/src/views/settings/APIKeysView.vue`.

- List keys (name, created date, last used, masked key)
- Create new key (name, optional expiry) — show full key once on creation
- Revoke key with confirmation
- API: `GET/POST/DELETE /api/api-keys`

## Profile Page (`/profile`)

Reference: `fs-whatsapp/frontend/src/views/profile/ProfileView.vue`.

- View: name, email, role (read-only), organization name (read-only)
- Edit: name, email (react-hook-form + zod validation)
- Change password: current password, new password, confirm password
- API: `GET /api/me`, `PUT /api/me`, `PUT /api/me/password`

## React Query Hooks

New hooks in `hooks/queries/`:

```
hooks/queries/
  use-users.ts        ← useUsers(), useCreateUser(), useUpdateUser(), useDeleteUser()
  use-accounts.ts     ← useAccounts() already exists, add mutations
  use-teams.ts        ← useTeams(), useCreateTeam(), useUpdateTeam(), useDeleteTeam()
  use-api-keys.ts     ← useApiKeys(), useCreateApiKey(), useDeleteApiKey()
  use-chatbot-settings.ts ← useChatbotSettings(), useUpdateChatbotSettings()
  use-profile.ts      ← useProfile(), useUpdateProfile(), useChangePassword()
  use-org-settings.ts ← useOrgSettings(), useUpdateOrgSettings()
```

Query keys added to `hooks/queries/query-keys.ts`.

## Changes to Existing Code

### `flows/page.tsx`

Remove the inline header: logo, "WhatsApp Templates" button, "Flow Templates" button, "New Flow" button placement (keep the button, move into content area), ThemeToggle, logout button. The sidebar now handles all navigation and user actions.

Keep: search, filters, sort, view toggle, flow cards/table, create button (in content area).

### `templates/page.tsx` and `flow-templates/page.tsx`

Same pattern — remove any inline navigation/header that duplicates sidebar functionality.

### No Changes

- `flow/[id]/page.tsx` — full-screen editor, no sidebar
- `template/[id]/page.tsx` — full-screen editor, no sidebar
- `login/page.tsx`, `register/page.tsx` — auth pages, no sidebar
- `middleware.ts` — auth routing unchanged
- `lib/auth.ts` — auth utilities unchanged

## UI Patterns

- All forms: react-hook-form + zod + shadcn Form kit
- All confirmations: AlertDialog (never window.confirm)
- All dropdowns with 5+ items: searchable combobox (Popover + Command)
- Hover states: hover:bg-muted (never hover:bg-accent)
- All clickable elements: cursor-pointer
- Settings pages: Card-based layout with CardHeader + CardContent, max-w-2xl centered
