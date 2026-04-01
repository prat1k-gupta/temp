# Design System Cleanup — MagicFlow

**Date:** 2026-04-01
**Status:** Approved
**Reference:** ManyChat-inspired, Freestand blue brand

## Goal

Replace the inherited Sampling Central theme with a clean, token-based design system. Eliminate all hardcoded colors, add missing semantic tokens, modernize the sidebar from dark navy to light/white, scope platform theming to canvas handles only, and ensure full dark mode support.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Visual direction | ManyChat-inspired | Light chrome, clean, modern builder aesthetic |
| Brand identity | Keep Freestand blue, modernize usage | Blue as accent/logo, not navy sidebar |
| Platform theming | Canvas-scoped (handles only) | App shell stays Freestand blue always; edges stay `--accent` always |
| Dark mode | Full support | Audit and fix every component |
| Token approach | Pure CSS variables (Approach 1) | Zero runtime, shadcn-native, v0-compatible |
| Scope | Everything (96 instances, 27 files) | Clean sweep, phased execution |
| Instagram color | `#E1306C` (actual brand pink) | Was `#a855f7` (generic purple) |
| WhatsApp color | `#25d366` (actual brand green) | Was `#10b981` (generic emerald) |

## Token Architecture

### Base Tokens (`:root`)

```css
:root {
  /* Surfaces */
  --background: #ffffff;
  --foreground: #1f2937;
  --card: #ffffff;
  --card-foreground: #1f2937;
  --popover: #ffffff;
  --popover-foreground: #1f2937;
  --muted: #f3f4f6;
  --muted-foreground: #6b7280;

  /* Brand */
  --primary: #2872F4;            /* Freestand blue — buttons, links, CTAs */
  --primary-foreground: #ffffff;

  /* Neutral secondary */
  --secondary: #f3f4f6;          /* Gray — secondary buttons */
  --secondary-foreground: #1f2937;
  --accent: #f3f4f6;             /* Gray — hover backgrounds */
  --accent-foreground: #1f2937;

  /* Semantic */
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --warning: #f59e0b;
  --warning-foreground: #ffffff;
  --success: #10b981;
  --success-foreground: #ffffff;
  --info: #3b82f6;
  --info-foreground: #ffffff;

  /* Borders & inputs */
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #2872F4;

  /* Charts */
  --chart-1: #2872F4;
  --chart-2: #0A49B7;
  --chart-3: #052762;
  --chart-4: #16a34a;
  --chart-5: #dc2626;

  /* Radius */
  --radius: 0.375rem;

  /* Sidebar — light/white (ManyChat-style) */
  --sidebar: #ffffff;
  --sidebar-foreground: #374151;
  --sidebar-primary: #2872F4;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f3f4f6;
  --sidebar-accent-foreground: #1f2937;
  --sidebar-border: #e5e7eb;
  --sidebar-ring: #2872F4;

  /* Platform accent — canvas-scoped, handle dots only */
  --platform-accent: #2872F4;
  --platform-accent-foreground: #ffffff;
}
```

### Dark Mode (`.dark`)

```css
.dark {
  --background: #111827;
  --foreground: #f9fafb;
  --card: #1f2937;
  --card-foreground: #f9fafb;
  --popover: #1f2937;
  --popover-foreground: #f9fafb;
  --muted: #374151;
  --muted-foreground: #9ca3af;

  --primary: #2872F4;
  --primary-foreground: #ffffff;
  --secondary: #374151;
  --secondary-foreground: #f9fafb;
  --accent: #374151;
  --accent-foreground: #f9fafb;

  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --warning: #fbbf24;
  --warning-foreground: #111827;
  --success: #34d399;
  --success-foreground: #111827;
  --info: #60a5fa;
  --info-foreground: #ffffff;

  --border: #4b5563;
  --input: #374151;
  --ring: #2872F4;

  --chart-1: #2872F4;
  --chart-2: #0A49B7;
  --chart-3: #60a5fa;
  --chart-4: #16a34a;
  --chart-5: #ef4444;

  --sidebar: #111827;
  --sidebar-foreground: #e5e7eb;
  --sidebar-primary: #2872F4;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #1f2937;
  --sidebar-accent-foreground: #e5e7eb;
  --sidebar-border: #374151;
  --sidebar-ring: #2872F4;

  --platform-accent: #2872F4;
  --platform-accent-foreground: #ffffff;
}
```

### Platform Overrides (canvas-scoped)

```css
[data-platform="whatsapp"] {
  --platform-accent: #25d366;
}
[data-platform="instagram"] {
  --platform-accent: #E1306C;
}
[data-platform="web"] {
  --platform-accent: #2872F4;
}
```

Key: `--primary`, `--ring`, `--accent` are NOT overridden per platform. Only `--platform-accent` changes. This means buttons, focus rings, modals, inputs all stay Freestand blue regardless of which flow you're editing.

### Tailwind Mapping (complete `@theme inline` block)

Every CSS variable must be mapped here for Tailwind v4 to generate utility classes (`bg-primary`, `text-warning`, etc.). This is the **complete** block — not just additions.

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  /* Standard shadcn tokens */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  /* Radius */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  /* Sidebar */
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  /* New semantic tokens */
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);

  /* Platform accent (canvas-scoped) */
  --color-platform-accent: var(--platform-accent);
  --color-platform-accent-foreground: var(--platform-accent-foreground);
}
```

## Platform Theming — Boundary Rule

`data-platform` stays on `<body>` (portals need it). But only `--platform-accent` changes — a new, additive token.

**Uses `--platform-accent` (canvas elements):**
- Node handle dot background color
- Small platform badge/pill on canvas toolbar (if any)

**Uses `--primary` (always Freestand blue) — canvas structural elements:**
- React Flow edge strokes
- Connection lines (while dragging)
- Handle hover glow/shadow

**Uses `--primary` (always Freestand blue):**
- Buttons, links, CTAs
- Focus rings (`--ring`)
- Modal actions
- Input focus states
- Sidebar active item

**Intentional exceptions (keep hardcoded):**
- Platform brand badges on dashboard ("WhatsApp" pill in green) — literal brand, not themeable
- Chart colors — already tokenized via `--chart-*`
- Third-party component overrides where CSS vars aren't supported

## React Flow Styles

```css
.react-flow__edge-default .react-flow__edge-path {
  stroke: var(--primary);           /* Always Freestand blue */
}
.react-flow__connectionline {
  stroke: var(--primary);
}
.react-flow__handle:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent);
}
```

Handle dots get their background from `--platform-accent` via component props/classes (`bg-platform-accent`), not from global CSS.

## `platform-config.ts` Changes

Remove `colors` object. CSS is the source of truth for platform colors.

```typescript
// Before
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  whatsapp: {
    name: "whatsapp",
    displayName: "WhatsApp",
    colors: { primary: "#25d366", secondary: "#128c7e", accent: "#075e54" },
  },
  // ...
}

// After
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  whatsapp: {
    name: "whatsapp",
    displayName: "WhatsApp",
  },
  // ...
}
```

Components needing platform color in JS (rare) read from CSS: `getComputedStyle(document.body).getPropertyValue('--platform-accent')`.

## Hardcoded Color Migration Map

| Current pattern | Replacement |
|-----------------|-------------|
| `bg-[#052762]`, `bg-[#0A49B7]` | `bg-primary` |
| `text-[#052762]` | `text-primary` |
| `bg-[#2872F4]` | `bg-primary` or `bg-accent` |
| `text-green-500`, `bg-green-*` | `text-success` / `bg-success` |
| `text-red-*`, `bg-red-*` | `text-destructive` / `bg-destructive` |
| `text-amber-*`, `bg-amber-*` | `text-warning` / `bg-warning` |
| `text-blue-*`, `bg-blue-*` (info context) | `text-info` / `bg-info` |
| `#6366f1` in flow-plan-builder | `var(--primary)` |
| `platformColors?.primary \|\| "#3b82f6"` | `bg-platform-accent` class |
| `style={{backgroundColor: platformColors.primary}}` | `className="bg-platform-accent"` |

## Execution Phases

### Phase 1 — Foundation
- Rewrite `app/globals.css` with new token system
- Add new `@theme inline` mappings (warning, success, info, platform-accent)
- Delete `styles/globals.css`
- Update `platform-config.ts` (remove colors)
- Update `PlatformConfig` type

### Phase 2 — App Shell
- Sidebar: dark navy → light/white tokens
- Login/register pages: replace `#052762`, `#0A49B7` with token classes
- Dashboard pages: replace hardcoded colors
- Settings pages: verify token usage

### Phase 3 — Builder Canvas
- React Flow CSS: tokenize edge strokes, connection lines, handle hover
- Node components: replace inline platform color styles with `bg-platform-accent`
- Properties panel: replace hardcoded status colors
- AI panels: replace hardcoded colors
- Flow plan builder: replace `#6366f1` with `--primary` token

### Phase 4 — Dark Mode Audit
- Verify every component in light + dark
- Fix broken contrast, missing `dark:` overrides
- Test platform theming in both modes
- Ensure modals, dropdowns, popovers look correct in both themes

### Phase 5 — CLAUDE.md Update (after user confirms UI)
- Update `magic-flow/CLAUDE.md` to document the design system tokens and enforce their usage
- Rules: never use hardcoded hex colors, always use semantic tokens (`bg-primary`, `text-warning`, `bg-platform-accent`, etc.)
- Document the token → purpose mapping so AI-generated code follows the system
- Only execute this phase after user has reviewed the UI and confirmed it looks correct

Each phase is a separate branch and PR.

## Files Affected

**Delete:** `styles/globals.css`

**Rewrite:** `app/globals.css`

**Modify (27 files with hardcoded colors):**
- `app/login/page.tsx`
- `app/register/page.tsx`
- `app/(dashboard)/flows/page.tsx`
- `app/(dashboard)/flow-templates/page.tsx`
- `app/(dashboard)/templates/page.tsx`
- `app/flow/[id]/page.tsx`
- `components/properties-panel.tsx`
- `components/node-sidebar.tsx`
- `components/template-preview.tsx`
- `components/template-editor-modal.tsx`
- `components/template-sidebar-section.tsx`
- `components/template-builder.tsx`
- `components/connection-menu.tsx`
- `components/ai/ai-button-toolbar.tsx`
- `components/ai/ai-suggestions-panel.tsx`
- `components/ai/ai-assistant.tsx`
- `components/ai/suggested-nodes.tsx`
- `components/ai/ai-toolbar.tsx`
- `components/ai/ai-button-suggestions.tsx`
- `components/nodes/action/template-message-node.tsx`
- `components/nodes/action/transfer-node.tsx`
- `components/nodes/action/api-fetch-node.tsx`
- `components/nodes/fulfillment/event-node.tsx`
- `components/nodes/fulfillment/tracking-notification-node.tsx`
- `components/nodes/fulfillment/retail-store-node.tsx`
- `components/nodes/fulfillment/generic-fulfillment-node.tsx`
- `components/nodes/fulfillment/home-delivery-node.tsx`
- `components/nodes/core/base-node.tsx`
- `components/nodes/web/web-form-node.tsx`
- `utils/flow-plan-builder.ts`
- `lib/platform-config.ts`
